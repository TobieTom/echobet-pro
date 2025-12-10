/**
 * EchoBet Pro - Comprehensive Test Suite
 *
 * Tests cover all instructions with happy paths and edge cases:
 * - create_market
 * - commit_bet
 * - reveal_bet
 * - resolve_market
 * - claim_winnings
 *
 * Coverage target: 80%+
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

// Type placeholder - replace with generated IDL type after build
type EchobetPro = any;

describe("EchoBet Pro", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // @ts-ignore - Program will be available after anchor build
  const program = anchor.workspace.EchobetPro as Program<EchobetPro>;

  // Test accounts
  let creator: Keypair;
  let oracle: Keypair;
  let user1: Keypair;
  let user2: Keypair;
  let user3: Keypair;

  let marketId = 0;

  // Seeds
  const MARKET_SEED = Buffer.from("market");
  const COMMITMENT_SEED = Buffer.from("commitment");
  const VAULT_SEED = Buffer.from("vault");

  // Helper: Generate random salt
  function generateSalt(): Buffer {
    return Buffer.from(Keypair.generate().secretKey.slice(0, 32));
  }

  // Helper: Compute commitment hash (uses SHA256 to match on-chain)
  function computeCommitmentHash(
    amount: anchor.BN,
    outcome: number,
    salt: Buffer
  ): Buffer {
    const amountBuffer = Buffer.alloc(8);
    amount.toArrayLike(Buffer, "le", 8).copy(amountBuffer);
    const outcomeBuffer = Buffer.from([outcome]);
    const data = Buffer.concat([amountBuffer, outcomeBuffer, salt]);
    return createHash("sha256").update(data).digest();
  }

  // Helper: Derive Market PDA
  async function deriveMarketPDA(
    creatorKey: PublicKey,
    id: number
  ): Promise<[PublicKey, number]> {
    const idBuffer = Buffer.alloc(8);
    new anchor.BN(id).toArrayLike(Buffer, "le", 8).copy(idBuffer);
    return PublicKey.findProgramAddressSync(
      [MARKET_SEED, creatorKey.toBuffer(), idBuffer],
      program.programId
    );
  }

  // Helper: Derive Vault PDA
  async function deriveVaultPDA(
    marketKey: PublicKey
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [VAULT_SEED, marketKey.toBuffer()],
      program.programId
    );
  }

  // Helper: Derive Commitment PDA
  async function deriveCommitmentPDA(
    marketKey: PublicKey,
    userKey: PublicKey
  ): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddressSync(
      [COMMITMENT_SEED, marketKey.toBuffer(), userKey.toBuffer()],
      program.programId
    );
  }

  // Helper: Future timestamp
  function futureTimestamp(secondsFromNow: number): anchor.BN {
    return new anchor.BN(Math.floor(Date.now() / 1000) + secondsFromNow);
  }

  // Helper: Past timestamp
  function pastTimestamp(secondsAgo: number): anchor.BN {
    return new anchor.BN(Math.floor(Date.now() / 1000) - secondsAgo);
  }

  // Helper: Airdrop SOL
  async function airdrop(pubkey: PublicKey, amount: number) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      amount * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  }

  // Helper: Sleep
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ============================================
  // Setup
  // ============================================

  before(async () => {
    creator = Keypair.generate();
    oracle = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();
    user3 = Keypair.generate();

    await airdrop(creator.publicKey, 100);
    await airdrop(oracle.publicKey, 10);
    await airdrop(user1.publicKey, 50);
    await airdrop(user2.publicKey, 50);
    await airdrop(user3.publicKey, 50);

    console.log("Test accounts funded:");
    console.log("  Creator:", creator.publicKey.toBase58());
    console.log("  Oracle:", oracle.publicKey.toBase58());
  });

  // ============================================
  // create_market Tests
  // ============================================

  describe("create_market", () => {
    it("creates a market successfully", async () => {
      marketId = 1;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      const deadline = futureTimestamp(3600);
      const question = "Will BTC reach $100k by end of 2024?";

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: question,
          deadline: deadline,
          revealPeriod: new anchor.BN(86400),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const market = await program.account.market.fetch(marketPDA);
      expect(market.creator.toBase58()).to.equal(creator.publicKey.toBase58());
      expect(market.oracle.toBase58()).to.equal(oracle.publicKey.toBase58());
      expect(market.marketId.toNumber()).to.equal(marketId);
      expect(market.question).to.equal(question);
      expect(market.status).to.deep.equal({ open: {} });
      expect(market.outcome).to.be.null;
      expect(market.totalPool.toNumber()).to.equal(0);
    });

    it("fails with question too long", async () => {
      marketId = 2;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      try {
        await program.methods
          .createMarket({
            marketId: new anchor.BN(marketId),
            question: "x".repeat(257),
            deadline: futureTimestamp(3600),
            revealPeriod: null,
          })
          .accounts({
            creator: creator.publicKey,
            market: marketPDA,
            vault: vaultPDA,
            oracle: oracle.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown QuestionTooLong error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("QuestionTooLong");
      }
    });

    it("fails with deadline in past", async () => {
      marketId = 3;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      try {
        await program.methods
          .createMarket({
            marketId: new anchor.BN(marketId),
            question: "Past deadline test",
            deadline: pastTimestamp(3600),
            revealPeriod: null,
          })
          .accounts({
            creator: creator.publicKey,
            market: marketPDA,
            vault: vaultPDA,
            oracle: oracle.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown DeadlineInPast error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("DeadlineInPast");
      }
    });

    it("allows creator as oracle", async () => {
      marketId = 4;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Self-resolved market",
          deadline: futureTimestamp(3600),
          revealPeriod: new anchor.BN(3600),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const market = await program.account.market.fetch(marketPDA);
      expect(market.oracle.toBase58()).to.equal(creator.publicKey.toBase58());
    });
  });

  // ============================================
  // commit_bet Tests
  // ============================================

  describe("commit_bet", () => {
    let testMarket: PublicKey;
    let testVault: PublicKey;

    before(async () => {
      marketId = 100;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);
      testMarket = marketPDA;
      testVault = vaultPDA;

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Betting test market",
          deadline: futureTimestamp(300),
          revealPeriod: new anchor.BN(600),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
    });

    it("commits a bet successfully", async () => {
      const betAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
      const outcome = 1;
      const salt = generateSalt();
      const commitmentHash = computeCommitmentHash(betAmount, outcome, salt);
      const [commitmentPDA] = await deriveCommitmentPDA(testMarket, user1.publicKey);

      const preBalance = await provider.connection.getBalance(user1.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(commitmentHash),
          amount: betAmount,
        })
        .accounts({
          user: user1.publicKey,
          market: testMarket,
          commitment: commitmentPDA,
          vault: testVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      const commitment = await program.account.commitment.fetch(commitmentPDA);
      expect(commitment.user.toBase58()).to.equal(user1.publicKey.toBase58());
      expect(commitment.amount.toNumber()).to.equal(betAmount.toNumber());
      expect(commitment.isRevealed).to.be.false;

      const postBalance = await provider.connection.getBalance(user1.publicKey);
      expect(preBalance - postBalance).to.be.greaterThan(betAmount.toNumber());

      const market = await program.account.market.fetch(testMarket);
      expect(market.totalPool.toNumber()).to.equal(betAmount.toNumber());

      (user1 as any).betSalt = salt;
      (user1 as any).betOutcome = outcome;
    });

    it("allows multiple users to commit", async () => {
      const betAmount2 = new anchor.BN(2 * LAMPORTS_PER_SOL);
      const outcome2 = 0;
      const salt2 = generateSalt();
      const commitmentHash2 = computeCommitmentHash(betAmount2, outcome2, salt2);
      const [commitmentPDA2] = await deriveCommitmentPDA(testMarket, user2.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(commitmentHash2),
          amount: betAmount2,
        })
        .accounts({
          user: user2.publicKey,
          market: testMarket,
          commitment: commitmentPDA2,
          vault: testVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      const market = await program.account.market.fetch(testMarket);
      expect(market.totalPool.toNumber()).to.equal(3 * LAMPORTS_PER_SOL);

      (user2 as any).betSalt = salt2;
      (user2 as any).betOutcome = outcome2;
    });

    it("fails with zero bet amount", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(testMarket, user3.publicKey);
      const salt = generateSalt();
      const commitmentHash = computeCommitmentHash(new anchor.BN(0), 1, salt);

      try {
        await program.methods
          .commitBet({
            commitmentHash: Array.from(commitmentHash),
            amount: new anchor.BN(0),
          })
          .accounts({
            user: user3.publicKey,
            market: testMarket,
            commitment: commitmentPDA,
            vault: testVault,
            systemProgram: SystemProgram.programId,
          })
          .signers([user3])
          .rpc();
        expect.fail("Should have thrown ZeroBetAmount error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("ZeroBetAmount");
      }
    });

    it("fails if user already committed", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(testMarket, user1.publicKey);
      const salt = generateSalt();
      const commitmentHash = computeCommitmentHash(new anchor.BN(1 * LAMPORTS_PER_SOL), 0, salt);

      try {
        await program.methods
          .commitBet({
            commitmentHash: Array.from(commitmentHash),
            amount: new anchor.BN(1 * LAMPORTS_PER_SOL),
          })
          .accounts({
            user: user1.publicKey,
            market: testMarket,
            commitment: commitmentPDA,
            vault: testVault,
            systemProgram: SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have failed - user already committed");
      } catch (err: any) {
        expect(err.message).to.include("already in use");
      }
    });
  });

  // ============================================
  // reveal_bet Tests
  // ============================================

  describe("reveal_bet", () => {
    let revealMarket: PublicKey;
    let revealVault: PublicKey;
    let user1Salt: Buffer;
    let user2Salt: Buffer;

    before(async () => {
      marketId = 200;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);
      revealMarket = marketPDA;
      revealVault = vaultPDA;

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Reveal test market",
          deadline: futureTimestamp(5),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // User 1 commits (Yes)
      const betAmount1 = new anchor.BN(1 * LAMPORTS_PER_SOL);
      user1Salt = generateSalt();
      const hash1 = computeCommitmentHash(betAmount1, 1, user1Salt);
      const [commitment1] = await deriveCommitmentPDA(revealMarket, user1.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(hash1),
          amount: betAmount1,
        })
        .accounts({
          user: user1.publicKey,
          market: revealMarket,
          commitment: commitment1,
          vault: revealVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // User 2 commits (No)
      const betAmount2 = new anchor.BN(2 * LAMPORTS_PER_SOL);
      user2Salt = generateSalt();
      const hash2 = computeCommitmentHash(betAmount2, 0, user2Salt);
      const [commitment2] = await deriveCommitmentPDA(revealMarket, user2.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(hash2),
          amount: betAmount2,
        })
        .accounts({
          user: user2.publicKey,
          market: revealMarket,
          commitment: commitment2,
          vault: revealVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      console.log("    Waiting for deadline to pass...");
      await sleep(6000);
    });

    it("reveals bet successfully after deadline", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(revealMarket, user1.publicKey);

      await program.methods
        .revealBet({
          outcome: 1,
          salt: Array.from(user1Salt),
        })
        .accounts({
          user: user1.publicKey,
          market: revealMarket,
          commitment: commitmentPDA,
        })
        .signers([user1])
        .rpc();

      const commitment = await program.account.commitment.fetch(commitmentPDA);
      expect(commitment.isRevealed).to.be.true;
      expect(commitment.revealedOutcome).to.equal(1);

      const market = await program.account.market.fetch(revealMarket);
      expect(market.yesPool.toNumber()).to.equal(1 * LAMPORTS_PER_SOL);
      expect(market.yesCount).to.equal(1);
    });

    it("reveals second user bet (No)", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(revealMarket, user2.publicKey);

      await program.methods
        .revealBet({
          outcome: 0,
          salt: Array.from(user2Salt),
        })
        .accounts({
          user: user2.publicKey,
          market: revealMarket,
          commitment: commitmentPDA,
        })
        .signers([user2])
        .rpc();

      const market = await program.account.market.fetch(revealMarket);
      expect(market.noPool.toNumber()).to.equal(2 * LAMPORTS_PER_SOL);
      expect(market.noCount).to.equal(1);
      expect(market.status).to.deep.equal({ revealing: {} });
    });

    it("fails with wrong salt (commitment mismatch)", async () => {
      const newUser = Keypair.generate();
      await airdrop(newUser.publicKey, 10);

      marketId = 201;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Mismatch test",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const correctSalt = generateSalt();
      const wrongSalt = generateSalt();
      const betAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
      const hash = computeCommitmentHash(betAmount, 1, correctSalt);
      const [commitmentPDA] = await deriveCommitmentPDA(marketPDA, newUser.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(hash),
          amount: betAmount,
        })
        .accounts({
          user: newUser.publicKey,
          market: marketPDA,
          commitment: commitmentPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([newUser])
        .rpc();

      await sleep(4000);

      try {
        await program.methods
          .revealBet({
            outcome: 1,
            salt: Array.from(wrongSalt),
          })
          .accounts({
            user: newUser.publicKey,
            market: marketPDA,
            commitment: commitmentPDA,
          })
          .signers([newUser])
          .rpc();
        expect.fail("Should have thrown CommitmentMismatch error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("CommitmentMismatch");
      }
    });

    it("fails if already revealed", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(revealMarket, user1.publicKey);

      try {
        await program.methods
          .revealBet({
            outcome: 1,
            salt: Array.from(user1Salt),
          })
          .accounts({
            user: user1.publicKey,
            market: revealMarket,
            commitment: commitmentPDA,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown AlreadyRevealed error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("AlreadyRevealed");
      }
    });
  });

  // ============================================
  // resolve_market Tests
  // ============================================

  describe("resolve_market", () => {
    let resolveMarket: PublicKey;

    before(async () => {
      marketId = 300;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);
      resolveMarket = marketPDA;

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Resolution test market",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      await sleep(4000);
    });

    it("oracle can resolve market", async () => {
      await program.methods
        .resolveMarket({
          outcome: 1,
        })
        .accounts({
          resolver: oracle.publicKey,
          market: resolveMarket,
        })
        .signers([oracle])
        .rpc();

      const market = await program.account.market.fetch(resolveMarket);
      expect(market.status).to.deep.equal({ resolved: {} });
      expect(market.outcome).to.equal(1);
      expect(market.resolvedAt.toNumber()).to.be.greaterThan(0);
    });

    it("fails to resolve already resolved market", async () => {
      try {
        await program.methods
          .resolveMarket({
            outcome: 0,
          })
          .accounts({
            resolver: oracle.publicKey,
            market: resolveMarket,
          })
          .signers([oracle])
          .rpc();
        expect.fail("Should have thrown MarketAlreadyResolved error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("MarketAlreadyResolved");
      }
    });

    it("creator can also resolve market", async () => {
      marketId = 301;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Creator resolution test",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      await sleep(4000);

      await program.methods
        .resolveMarket({
          outcome: 0,
        })
        .accounts({
          resolver: creator.publicKey,
          market: marketPDA,
        })
        .signers([creator])
        .rpc();

      const market = await program.account.market.fetch(marketPDA);
      expect(market.status).to.deep.equal({ resolved: {} });
      expect(market.outcome).to.equal(0);
    });

    it("unauthorized user cannot resolve", async () => {
      marketId = 302;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Unauthorized test",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      await sleep(4000);

      try {
        await program.methods
          .resolveMarket({
            outcome: 1,
          })
          .accounts({
            resolver: user1.publicKey,
            market: marketPDA,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown UnauthorizedResolver error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("UnauthorizedResolver");
      }
    });

    it("fails with invalid outcome", async () => {
      marketId = 303;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Invalid outcome test",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      await sleep(4000);

      try {
        await program.methods
          .resolveMarket({
            outcome: 2,
          })
          .accounts({
            resolver: oracle.publicKey,
            market: marketPDA,
          })
          .signers([oracle])
          .rpc();
        expect.fail("Should have thrown InvalidOutcome error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidOutcome");
      }
    });
  });

  // ============================================
  // claim_winnings Tests
  // ============================================

  describe("claim_winnings", () => {
    let claimMarket: PublicKey;
    let claimVault: PublicKey;
    let winnerSalt: Buffer;
    let loserSalt: Buffer;

    before(async () => {
      marketId = 400;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);
      claimMarket = marketPDA;
      claimVault = vaultPDA;

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Claim test market",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // User1 bets 1 SOL on Yes (will win)
      const betAmount1 = new anchor.BN(1 * LAMPORTS_PER_SOL);
      winnerSalt = generateSalt();
      const hash1 = computeCommitmentHash(betAmount1, 1, winnerSalt);
      const [commitment1] = await deriveCommitmentPDA(claimMarket, user1.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(hash1),
          amount: betAmount1,
        })
        .accounts({
          user: user1.publicKey,
          market: claimMarket,
          commitment: commitment1,
          vault: claimVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // User2 bets 2 SOL on No (will lose)
      const betAmount2 = new anchor.BN(2 * LAMPORTS_PER_SOL);
      loserSalt = generateSalt();
      const hash2 = computeCommitmentHash(betAmount2, 0, loserSalt);
      const [commitment2] = await deriveCommitmentPDA(claimMarket, user2.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(hash2),
          amount: betAmount2,
        })
        .accounts({
          user: user2.publicKey,
          market: claimMarket,
          commitment: commitment2,
          vault: claimVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      await sleep(4000);

      // Reveal bets
      await program.methods
        .revealBet({ outcome: 1, salt: Array.from(winnerSalt) })
        .accounts({
          user: user1.publicKey,
          market: claimMarket,
          commitment: commitment1,
        })
        .signers([user1])
        .rpc();

      await program.methods
        .revealBet({ outcome: 0, salt: Array.from(loserSalt) })
        .accounts({
          user: user2.publicKey,
          market: claimMarket,
          commitment: commitment2,
        })
        .signers([user2])
        .rpc();

      // Resolve as Yes
      await program.methods
        .resolveMarket({ outcome: 1 })
        .accounts({
          resolver: oracle.publicKey,
          market: claimMarket,
        })
        .signers([oracle])
        .rpc();
    });

    it("winner claims winnings successfully", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(claimMarket, user1.publicKey);
      const preBalance = await provider.connection.getBalance(user1.publicKey);

      await program.methods
        .claimWinnings()
        .accounts({
          user: user1.publicKey,
          market: claimMarket,
          commitment: commitmentPDA,
          vault: claimVault,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      const postBalance = await provider.connection.getBalance(user1.publicKey);

      // User1 bet 1 SOL, Yes pool = 1, No pool = 2
      // Payout = 1 + (1/1 * 2) = 3 SOL
      const expectedPayout = 3 * LAMPORTS_PER_SOL;
      const actualGain = postBalance - preBalance;

      expect(actualGain).to.be.closeTo(expectedPayout, 0.01 * LAMPORTS_PER_SOL);

      const commitment = await program.account.commitment.fetch(commitmentPDA);
      expect(commitment.isClaimed).to.be.true;
    });

    it("loser cannot claim", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(claimMarket, user2.publicKey);

      try {
        await program.methods
          .claimWinnings()
          .accounts({
            user: user2.publicKey,
            market: claimMarket,
            commitment: commitmentPDA,
            vault: claimVault,
            systemProgram: SystemProgram.programId,
          })
          .signers([user2])
          .rpc();
        expect.fail("Should have thrown DidNotWin error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("DidNotWin");
      }
    });

    it("winner cannot double claim", async () => {
      const [commitmentPDA] = await deriveCommitmentPDA(claimMarket, user1.publicKey);

      try {
        await program.methods
          .claimWinnings()
          .accounts({
            user: user1.publicKey,
            market: claimMarket,
            commitment: commitmentPDA,
            vault: claimVault,
            systemProgram: SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown AlreadyClaimed error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("AlreadyClaimed");
      }
    });

    it("cannot claim from unresolved market", async () => {
      marketId = 401;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Unresolved claim test",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      const salt = generateSalt();
      const betAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
      const hash = computeCommitmentHash(betAmount, 1, salt);
      const [commitmentPDA] = await deriveCommitmentPDA(marketPDA, user3.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(hash),
          amount: betAmount,
        })
        .accounts({
          user: user3.publicKey,
          market: marketPDA,
          commitment: commitmentPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([user3])
        .rpc();

      await sleep(4000);

      await program.methods
        .revealBet({ outcome: 1, salt: Array.from(salt) })
        .accounts({
          user: user3.publicKey,
          market: marketPDA,
          commitment: commitmentPDA,
        })
        .signers([user3])
        .rpc();

      // Try to claim without resolution
      try {
        await program.methods
          .claimWinnings()
          .accounts({
            user: user3.publicKey,
            market: marketPDA,
            commitment: commitmentPDA,
            vault: vaultPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([user3])
          .rpc();
        expect.fail("Should have thrown MarketNotResolved error");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("MarketNotResolved");
      }
    });
  });

  // ============================================
  // Full Integration Test
  // ============================================

  describe("Full Integration Flow", () => {
    it("complete market lifecycle with multiple participants", async () => {
      marketId = 500;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      // 1. Create market
      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "Integration test: Will SOL hit $500?",
          deadline: futureTimestamp(5),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // 2. Multiple users commit
      const participants = [
        { user: user1, amount: 1 * LAMPORTS_PER_SOL, outcome: 1 },
        { user: user2, amount: 2 * LAMPORTS_PER_SOL, outcome: 0 },
        { user: user3, amount: 3 * LAMPORTS_PER_SOL, outcome: 1 },
      ];

      const salts: Map<string, Buffer> = new Map();

      for (const p of participants) {
        const salt = generateSalt();
        salts.set(p.user.publicKey.toBase58(), salt);

        const hash = computeCommitmentHash(new anchor.BN(p.amount), p.outcome, salt);
        const [commitmentPDA] = await deriveCommitmentPDA(marketPDA, p.user.publicKey);

        await program.methods
          .commitBet({
            commitmentHash: Array.from(hash),
            amount: new anchor.BN(p.amount),
          })
          .accounts({
            user: p.user.publicKey,
            market: marketPDA,
            commitment: commitmentPDA,
            vault: vaultPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([p.user])
          .rpc();
      }

      let market = await program.account.market.fetch(marketPDA);
      expect(market.totalPool.toNumber()).to.equal(6 * LAMPORTS_PER_SOL);

      // 3. Wait for deadline
      console.log("    Waiting for deadline...");
      await sleep(6000);

      // 4. All users reveal
      for (const p of participants) {
        const salt = salts.get(p.user.publicKey.toBase58())!;
        const [commitmentPDA] = await deriveCommitmentPDA(marketPDA, p.user.publicKey);

        await program.methods
          .revealBet({ outcome: p.outcome, salt: Array.from(salt) })
          .accounts({
            user: p.user.publicKey,
            market: marketPDA,
            commitment: commitmentPDA,
          })
          .signers([p.user])
          .rpc();
      }

      market = await program.account.market.fetch(marketPDA);
      expect(market.yesPool.toNumber()).to.equal(4 * LAMPORTS_PER_SOL);
      expect(market.noPool.toNumber()).to.equal(2 * LAMPORTS_PER_SOL);

      // 5. Oracle resolves (Yes wins)
      await program.methods
        .resolveMarket({ outcome: 1 })
        .accounts({
          resolver: oracle.publicKey,
          market: marketPDA,
        })
        .signers([oracle])
        .rpc();

      // 6. Winners claim
      const [commitment1] = await deriveCommitmentPDA(marketPDA, user1.publicKey);
      const [commitment3] = await deriveCommitmentPDA(marketPDA, user3.publicKey);

      const preBalance1 = await provider.connection.getBalance(user1.publicKey);
      const preBalance3 = await provider.connection.getBalance(user3.publicKey);

      await program.methods
        .claimWinnings()
        .accounts({
          user: user1.publicKey,
          market: marketPDA,
          commitment: commitment1,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      await program.methods
        .claimWinnings()
        .accounts({
          user: user3.publicKey,
          market: marketPDA,
          commitment: commitment3,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([user3])
        .rpc();

      const postBalance1 = await provider.connection.getBalance(user1.publicKey);
      const postBalance3 = await provider.connection.getBalance(user3.publicKey);

      // User1: 1 + (1/4 * 2) = 1.5 SOL
      // User3: 3 + (3/4 * 2) = 4.5 SOL
      expect(postBalance1 - preBalance1).to.be.closeTo(1.5 * LAMPORTS_PER_SOL, 0.01 * LAMPORTS_PER_SOL);
      expect(postBalance3 - preBalance3).to.be.closeTo(4.5 * LAMPORTS_PER_SOL, 0.01 * LAMPORTS_PER_SOL);

      // 7. Vault should be empty
      const vaultBalance = await provider.connection.getBalance(vaultPDA);
      expect(vaultBalance).to.equal(0);

      console.log("    ✓ Full integration test passed!");
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe("Edge Cases", () => {
    it("handles market with all bets on one side", async () => {
      marketId = 600;
      const [marketPDA] = await deriveMarketPDA(creator.publicKey, marketId);
      const [vaultPDA] = await deriveVaultPDA(marketPDA);

      await program.methods
        .createMarket({
          marketId: new anchor.BN(marketId),
          question: "One-sided market test",
          deadline: futureTimestamp(3),
          revealPeriod: new anchor.BN(300),
        })
        .accounts({
          creator: creator.publicKey,
          market: marketPDA,
          vault: vaultPDA,
          oracle: oracle.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Only user1 bets
      const salt = generateSalt();
      const betAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
      const hash = computeCommitmentHash(betAmount, 1, salt);
      const [commitmentPDA] = await deriveCommitmentPDA(marketPDA, user1.publicKey);

      await program.methods
        .commitBet({
          commitmentHash: Array.from(hash),
          amount: betAmount,
        })
        .accounts({
          user: user1.publicKey,
          market: marketPDA,
          commitment: commitmentPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      await sleep(4000);

      await program.methods
        .revealBet({ outcome: 1, salt: Array.from(salt) })
        .accounts({
          user: user1.publicKey,
          market: marketPDA,
          commitment: commitmentPDA,
        })
        .signers([user1])
        .rpc();

      await program.methods
        .resolveMarket({ outcome: 1 })
        .accounts({
          resolver: oracle.publicKey,
          market: marketPDA,
        })
        .signers([oracle])
        .rpc();

      const preBalance = await provider.connection.getBalance(user1.publicKey);

      await program.methods
        .claimWinnings()
        .accounts({
          user: user1.publicKey,
          market: marketPDA,
          commitment: commitmentPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      const postBalance = await provider.connection.getBalance(user1.publicKey);

      // Should get back 1 SOL (no losers)
      expect(postBalance - preBalance).to.be.closeTo(1 * LAMPORTS_PER_SOL, 0.01 * LAMPORTS_PER_SOL);
    });
  });
});
