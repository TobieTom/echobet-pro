import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import * as anchor from '@coral-xyz/anchor';

// Ensure this matches your program ID exactly
export const PROGRAM_ID = new PublicKey('HTDC5bDN6u7q1FCYnEuevztZM1ZqKcD9ujPTTLwNfTCc');

export const findMarketPDA = (creator: PublicKey, marketId: anchor.BN) => {
    // marketId is a BN (BigNumber) from anchor, we need it as a buffer (u64 = 8 bytes)
    const idBuffer = marketId.toArrayLike(Buffer, 'le', 8);

    return PublicKey.findProgramAddressSync(
        [Buffer.from('market'), creator.toBuffer(), idBuffer],
        PROGRAM_ID
    );
};

export const findVaultPDA = (marketPda: PublicKey) => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), marketPda.toBuffer()],
        PROGRAM_ID
    );
};

export const findCommitmentPDA = (marketPda: PublicKey, user: PublicKey) => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('commitment'), marketPda.toBuffer(), user.toBuffer()],
        PROGRAM_ID
    );
};