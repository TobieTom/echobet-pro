# EchoBet Pro 🎯

**Privacy-Preserving Prediction Markets on Solana**

> Bet on real-world outcomes without revealing your position until the deadline. No front-running. No whale copying. Just fair markets.

---

## 🚀 Overview

EchoBet Pro is a decentralized prediction market protocol built on Solana that uses a **commit-reveal scheme** to keep bets private until the betting period ends. Unlike traditional prediction markets where large bets move the odds and invite copycat behavior, EchoBet ensures every participant commits blindly—creating truly fair and manipulation-resistant markets.

Built for the **Indie.fun Hackathon** (December 2025).

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🔒 Private Betting** | Bets are hidden using SHA256 hash commitments until reveal phase |
| **⚖️ Fair Markets** | No front-running, no whale copying, no last-second manipulation |
| **💰 Proportional Payouts** | Winners split the losing pool based on their bet size |
| **🔐 PDA Vaults** | All funds secured in program-controlled vaults |
| **👥 Dual Resolution** | Markets can be resolved by oracle OR creator |
| **⚡ Solana Speed** | Sub-second finality, minimal fees |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         EchoBet Pro                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   CREATE    │    │   COMMIT    │    │   REVEAL    │         │
│  │   MARKET    │───▶│    BET      │───▶│    BET      │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│        │                   │                  │                 │
│        ▼                   ▼                  ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Market    │    │ Commitment  │    │   Market    │         │
│  │    PDA      │    │    PDA      │    │   Pools     │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                            │                  │                 │
│                            ▼                  │                 │
│                     ┌─────────────┐           │                 │
│                     │    Vault    │◀──────────┘                 │
│                     │    PDA      │                             │
│                     └─────────────┘                             │
│                            │                                    │
│        ┌───────────────────┼───────────────────┐               │
│        ▼                   ▼                   ▼               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   RESOLVE   │    │    CLAIM    │    │   PAYOUT    │         │
│  │   MARKET    │───▶│  WINNINGS   │───▶│  TO USER    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 How Commit-Reveal Works

### The Problem
In traditional prediction markets, everyone sees your bet. If a whale bets $100k on "Yes," others copy them, moving odds before you can react.

### The Solution
EchoBet uses a two-phase commit-reveal scheme:

**Phase 1: COMMIT (Before Deadline)**
```
User creates: hash = SHA256(amount || outcome || salt)
User sends:   hash + amount (SOL locked in vault)
Visible:      Only the hash and amount
Hidden:       Which side (Yes/No) they bet on
```

**Phase 2: REVEAL (After Deadline)**
```
User sends:   outcome + salt
Program:      Verifies SHA256(amount || outcome || salt) == stored hash
Result:       Bet is revealed and added to Yes/No pool
```

**Phase 3: CLAIM (After Resolution)**
```
Winner's payout = their_bet + (their_bet / winning_pool) × losing_pool
```

---

## 📁 Project Structure

```
echobet_pro/
├── programs/echobet_pro/
│   ├── src/
│   │   └── lib.rs              # All program code (single-file architecture)
│   └── Cargo.toml
├── tests/
│   └── echobet_pro.ts          # 23 comprehensive tests
├── app/                        # React frontend (coming soon)
├── Anchor.toml
├── Cargo.toml
├── package.json
└── README.md
```

> **Note:** Single-file architecture is a workaround for [Anchor 0.32 module bug](https://github.com/coral-xyz/anchor/issues/3690).

---

## 🛠️ Quick Start

### Prerequisites

- Rust 1.70+
- Solana CLI 1.18+
- Anchor 0.32+
- Node.js 18+
- Yarn

### Install & Build

```bash
# Clone the repo
git clone https://github.com/yourusername/echobet-pro.git
cd echobet-pro

# Install dependencies
yarn install

# Build the program
anchor build

# Run tests (starts local validator automatically)
anchor test
```

### Deploy to Devnet

```bash
# Configure for devnet
solana config set --url devnet

# Airdrop SOL for deployment
solana airdrop 2

# Deploy
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show <PROGRAM_ID>
```

---

## 🧪 Test Coverage

```
  EchoBet Pro
    create_market
      ✔ creates a market successfully
      ✔ fails with question too long
      ✔ fails with deadline in past
      ✔ allows creator as oracle
    commit_bet
      ✔ commits a bet successfully
      ✔ allows multiple users to commit
      ✔ fails with zero bet amount
      ✔ fails if user already committed
    reveal_bet
      ✔ reveals bet successfully after deadline
      ✔ reveals second user bet (No)
      ✔ fails with wrong salt (commitment mismatch)
      ✔ fails if already revealed
    resolve_market
      ✔ oracle can resolve market
      ✔ fails to resolve already resolved market
      ✔ creator can also resolve market
      ✔ unauthorized user cannot resolve
      ✔ fails with invalid outcome
    claim_winnings
      ✔ winner claims winnings successfully
      ✔ loser cannot claim
      ✔ winner cannot double claim
      ✔ cannot claim from unresolved market
    Full Integration Flow
      ✔ complete market lifecycle with multiple participants
    Edge Cases
      ✔ handles market with all bets on one side

  23 passing
```

---

## 🔒 Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Front-running** | Commit-reveal ensures bets are hidden until deadline |
| **Hash collision** | SHA256 is collision-resistant; 32-byte salt adds entropy |
| **Overflow attacks** | All arithmetic uses `checked_add`, `checked_mul`, `checked_div` |
| **Unauthorized resolution** | Only oracle OR creator can resolve markets |
| **Double claims** | `is_claimed` flag prevents multiple withdrawals |
| **Vault security** | PDA-controlled vault with program-only transfer authority |
| **Reentrancy** | Anchor's account model prevents reentrancy by design |

### Audit Status
⚠️ **Unaudited** - This is hackathon code. Do not use in production without a professional security audit.

---

## 🗺️ Roadmap

- [x] Core smart contract
- [x] Commit-reveal betting
- [x] PDA vault payouts
- [x] Comprehensive test suite
- [ ] React frontend
- [ ] Pyth oracle integration
- [ ] Multi-outcome markets
- [ ] Market creator fees
- [ ] Liquidity incentives
- [ ] Mobile app

---

## 🏆 Hackathon Submission

**Event:** Indie.fun Hackathon  
**Track:** DeFi / Prediction Markets  
**Deadline:** December 12, 2025

### Why EchoBet Pro?

1. **Novel Approach** - First Solana prediction market with commit-reveal privacy
2. **Real Problem** - Front-running and whale manipulation plague existing markets
3. **Complete Solution** - Fully functional backend with 23 passing tests
4. **Production Path** - Clear roadmap to mainnet deployment

---

## 👥 Team

- **Tobias** - Full-stack developer, Solana/Anchor

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🔗 Links

- [Live Demo](#) (coming soon)
- [Devnet Program](#) (coming soon)
- [Twitter](#)
- [Discord](#)

---

<p align="center">
  Built with ❤️ for the Indie.fun Hackathon
</p>
