#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use sha2::{Digest, Sha256};

declare_id!("HTDC5bDN6u7q1FCYnEuevztZM1ZqKcD9ujPTTLwNfTCc");

// ============================================================================
// CONSTANTS
// ============================================================================

pub const MAX_QUESTION_LENGTH: usize = 256;
pub const DEFAULT_REVEAL_PERIOD: i64 = 24 * 60 * 60;
pub const OUTCOME_NO: u8 = 0;
pub const OUTCOME_YES: u8 = 1;

pub const MARKET_SEED: &[u8] = b"market";
pub const COMMITMENT_SEED: &[u8] = b"commitment";
pub const VAULT_SEED: &[u8] = b"vault";

// ============================================================================
// PROGRAM
// ============================================================================

#[program]
pub mod echobet_pro {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        require!(
            params.question.len() <= MAX_QUESTION_LENGTH,
            EchoBetError::QuestionTooLong
        );
        require!(params.deadline > current_time, EchoBetError::DeadlineInPast);

        let reveal_period = params.reveal_period.unwrap_or(DEFAULT_REVEAL_PERIOD);
        let reveal_period = if reveal_period <= 0 {
            DEFAULT_REVEAL_PERIOD
        } else {
            reveal_period
        };
        let reveal_deadline = params
            .deadline
            .checked_add(reveal_period)
            .ok_or(EchoBetError::Overflow)?;

        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.oracle = ctx.accounts.oracle.key();
        market.market_id = params.market_id;
        market.question = params.question;
        market.deadline = params.deadline;
        market.reveal_deadline = reveal_deadline;
        market.status = MarketStatus::Open;
        market.outcome = None;
        market.total_pool = 0;
        market.yes_pool = 0;
        market.no_pool = 0;
        market.yes_count = 0;
        market.no_count = 0;
        market.created_at = current_time;
        market.resolved_at = 0;
        market.bump = ctx.bumps.market;
        market.vault_bump = ctx.bumps.vault;

        msg!(
            "Market created: id={}, creator={}",
            market.market_id,
            market.creator
        );
        Ok(())
    }

    pub fn commit_bet(ctx: Context<CommitBet>, params: CommitBetParams) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let market = &ctx.accounts.market;

        require!(
            !market.deadline_passed(current_time),
            EchoBetError::MarketExpired
        );
        require!(params.amount > 0, EchoBetError::ZeroBetAmount);

        // Transfer to vault
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            params.amount,
        )?;

        // Update market
        let market = &mut ctx.accounts.market;
        market.total_pool = market
            .total_pool
            .checked_add(params.amount)
            .ok_or(EchoBetError::Overflow)?;

        // Initialize commitment
        let commitment = &mut ctx.accounts.commitment;
        commitment.market = market.key();
        commitment.user = ctx.accounts.user.key();
        commitment.commitment_hash = params.commitment_hash;
        commitment.amount = params.amount;
        commitment.revealed_outcome = None;
        commitment.revealed_salt = None;
        commitment.is_revealed = false;
        commitment.is_claimed = false;
        commitment.committed_at = current_time;
        commitment.revealed_at = 0;
        commitment.bump = ctx.bumps.commitment;

        msg!(
            "Bet committed: user={}, amount={}",
            commitment.user,
            commitment.amount
        );
        Ok(())
    }

    pub fn reveal_bet(ctx: Context<RevealBet>, params: RevealBetParams) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let market = &ctx.accounts.market;
        let commitment = &ctx.accounts.commitment;

        require!(
            market.deadline_passed(current_time),
            EchoBetError::MarketNotExpired
        );
        require!(
            !market.reveal_deadline_passed(current_time),
            EchoBetError::RevealPeriodEnded
        );
        require!(
            params.outcome == OUTCOME_NO || params.outcome == OUTCOME_YES,
            EchoBetError::InvalidOutcome
        );

        // Verify hash
        let computed_hash =
            compute_commitment_hash(commitment.amount, params.outcome, &params.salt);
        require!(
            commitment.commitment_hash == computed_hash,
            EchoBetError::CommitmentMismatch
        );

        // Update market pools
        let market = &mut ctx.accounts.market;
        if market.status == MarketStatus::Open {
            market.status = MarketStatus::Revealing;
        }

        match params.outcome {
            OUTCOME_YES => {
                market.yes_pool = market
                    .yes_pool
                    .checked_add(commitment.amount)
                    .ok_or(EchoBetError::Overflow)?;
                market.yes_count = market
                    .yes_count
                    .checked_add(1)
                    .ok_or(EchoBetError::Overflow)?;
            }
            OUTCOME_NO => {
                market.no_pool = market
                    .no_pool
                    .checked_add(commitment.amount)
                    .ok_or(EchoBetError::Overflow)?;
                market.no_count = market
                    .no_count
                    .checked_add(1)
                    .ok_or(EchoBetError::Overflow)?;
            }
            _ => unreachable!(),
        }

        // Update commitment
        let commitment = &mut ctx.accounts.commitment;
        commitment.revealed_outcome = Some(params.outcome);
        commitment.revealed_salt = Some(params.salt);
        commitment.is_revealed = true;
        commitment.revealed_at = current_time;

        msg!(
            "Bet revealed: user={}, outcome={}",
            commitment.user,
            params.outcome
        );
        Ok(())
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, params: ResolveMarketParams) -> Result<()> {
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let market = &ctx.accounts.market;
        let resolver = &ctx.accounts.resolver;

        require!(
            market.deadline_passed(current_time),
            EchoBetError::MarketNotExpired
        );

        let is_oracle = resolver.key() == market.oracle;
        let is_creator = resolver.key() == market.creator;
        require!(is_oracle || is_creator, EchoBetError::UnauthorizedResolver);
        require!(
            params.outcome == OUTCOME_NO || params.outcome == OUTCOME_YES,
            EchoBetError::InvalidOutcome
        );

        let market = &mut ctx.accounts.market;
        market.outcome = Some(params.outcome);
        market.status = MarketStatus::Resolved;
        market.resolved_at = current_time;

        msg!(
            "Market resolved: id={}, outcome={}",
            market.market_id,
            params.outcome
        );
        Ok(())
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let commitment = &ctx.accounts.commitment;

        let winning_outcome = market.outcome.ok_or(EchoBetError::MarketNotResolved)?;
        let user_outcome = commitment
            .revealed_outcome
            .ok_or(EchoBetError::NotRevealed)?;
        require!(user_outcome == winning_outcome, EchoBetError::DidNotWin);

        let user_bet = commitment.amount;
        let (winning_pool, losing_pool) = if winning_outcome == 1 {
            (market.yes_pool, market.no_pool)
        } else {
            (market.no_pool, market.yes_pool)
        };

        let share_of_losers = if winning_pool > 0 {
            (user_bet as u128)
                .checked_mul(losing_pool as u128)
                .ok_or(EchoBetError::Overflow)?
                .checked_div(winning_pool as u128)
                .ok_or(EchoBetError::DivisionByZero)?
        } else {
            0u128
        };

        let payout = (user_bet as u128)
            .checked_add(share_of_losers)
            .ok_or(EchoBetError::Overflow)? as u64;
        require!(
            ctx.accounts.vault.lamports() >= payout,
            EchoBetError::InsufficientPoolFunds
        );

        // Transfer lamports using CPI with signer seeds
        let market_key = ctx.accounts.market.key();
        let vault_bump = ctx.accounts.market.vault_bump;
        let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, market_key.as_ref(), &[vault_bump]]];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                },
                signer_seeds,
            ),
            payout,
        )?;

        // Mark claimed
        let commitment = &mut ctx.accounts.commitment;
        commitment.is_claimed = true;

        msg!(
            "Winnings claimed: user={}, payout={}",
            commitment.user,
            payout
        );
        Ok(())
    }
}

// ============================================================================
// ACCOUNTS STRUCTS
// ============================================================================

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = Market::LEN,
        seeds = [MARKET_SEED, creator.key().as_ref(), &params.market_id.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: PDA vault for holding SOL
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: Oracle can be any pubkey
    pub oracle: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Open @ EchoBetError::MarketExpired
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = user,
        space = Commitment::LEN,
        seeds = [COMMITMENT_SEED, market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub commitment: Account<'info, Commitment>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealBet<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Open || market.status == MarketStatus::Revealing @ EchoBetError::MarketAlreadyResolved
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [COMMITMENT_SEED, market.key().as_ref(), user.key().as_ref()],
        bump = commitment.bump,
        constraint = commitment.user == user.key() @ EchoBetError::InvalidSigner,
        constraint = commitment.market == market.key() @ EchoBetError::InvalidMarketId,
        constraint = !commitment.is_revealed @ EchoBetError::AlreadyRevealed
    )]
    pub commitment: Account<'info, Commitment>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    pub resolver: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.creator.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
        constraint = market.status != MarketStatus::Resolved @ EchoBetError::MarketAlreadyResolved,
        constraint = market.status != MarketStatus::Cancelled @ EchoBetError::MarketAlreadyResolved
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Resolved @ EchoBetError::MarketNotResolved
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [COMMITMENT_SEED, market.key().as_ref(), user.key().as_ref()],
        bump = commitment.bump,
        constraint = commitment.user == user.key() @ EchoBetError::InvalidSigner,
        constraint = commitment.market == market.key() @ EchoBetError::InvalidMarketId,
        constraint = commitment.is_revealed @ EchoBetError::NotRevealed,
        constraint = !commitment.is_claimed @ EchoBetError::AlreadyClaimed
    )]
    pub commitment: Account<'info, Commitment>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ============================================================================
// INSTRUCTION PARAMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketParams {
    pub market_id: u64,
    pub question: String,
    pub deadline: i64,
    pub reveal_period: Option<i64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CommitBetParams {
    pub commitment_hash: [u8; 32],
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RevealBetParams {
    pub outcome: u8,
    pub salt: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ResolveMarketParams {
    pub outcome: u8,
}

// ============================================================================
// STATE
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Open,
    Revealing,
    Resolved,
    Cancelled,
}

impl Default for MarketStatus {
    fn default() -> Self {
        MarketStatus::Open
    }
}

#[account]
pub struct Market {
    pub creator: Pubkey,
    pub oracle: Pubkey,
    pub market_id: u64,
    pub question: String,
    pub deadline: i64,
    pub reveal_deadline: i64,
    pub status: MarketStatus,
    pub outcome: Option<u8>,
    pub total_pool: u64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub yes_count: u32,
    pub no_count: u32,
    pub created_at: i64,
    pub resolved_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Market {
    pub const LEN: usize = 8
        + 32
        + 32
        + 8
        + (4 + MAX_QUESTION_LENGTH)
        + 8
        + 8
        + 1
        + 2
        + 8
        + 8
        + 8
        + 4
        + 4
        + 8
        + 8
        + 1
        + 1
        + 64;

    pub fn deadline_passed(&self, current_time: i64) -> bool {
        current_time >= self.deadline
    }

    pub fn reveal_deadline_passed(&self, current_time: i64) -> bool {
        current_time >= self.reveal_deadline
    }
}

#[account]
#[derive(Default)]
pub struct Commitment {
    pub market: Pubkey,
    pub user: Pubkey,
    pub commitment_hash: [u8; 32],
    pub amount: u64,
    pub revealed_outcome: Option<u8>,
    pub revealed_salt: Option<[u8; 32]>,
    pub is_revealed: bool,
    pub is_claimed: bool,
    pub committed_at: i64,
    pub revealed_at: i64,
    pub bump: u8,
}

impl Commitment {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 2 + 33 + 1 + 1 + 8 + 8 + 1 + 32;
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum EchoBetError {
    #[msg("Market deadline has not passed yet")]
    MarketNotExpired,
    #[msg("Market deadline has already passed")]
    MarketExpired,
    #[msg("Market has already been resolved")]
    MarketAlreadyResolved,
    #[msg("Market is not resolved yet")]
    MarketNotResolved,
    #[msg("Reveal period has ended")]
    RevealPeriodEnded,
    #[msg("Commitment hash does not match")]
    CommitmentMismatch,
    #[msg("Bet has already been revealed")]
    AlreadyRevealed,
    #[msg("Bet has not been revealed yet")]
    NotRevealed,
    #[msg("Bet amount must be greater than zero")]
    ZeroBetAmount,
    #[msg("User did not win")]
    DidNotWin,
    #[msg("Winnings have already been claimed")]
    AlreadyClaimed,
    #[msg("Unauthorized resolver")]
    UnauthorizedResolver,
    #[msg("Invalid signer")]
    InvalidSigner,
    #[msg("Question too long")]
    QuestionTooLong,
    #[msg("Deadline must be in the future")]
    DeadlineInPast,
    #[msg("Invalid outcome")]
    InvalidOutcome,
    #[msg("Invalid market ID")]
    InvalidMarketId,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Insufficient pool funds")]
    InsufficientPoolFunds,
}

// ============================================================================
// UTILS
// ============================================================================

pub fn compute_commitment_hash(amount: u64, outcome: u8, salt: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(&amount.to_le_bytes());
    hasher.update(&[outcome]);
    hasher.update(salt);
    let result = hasher.finalize();
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&result);
    hash
}
