import { Buffer } from 'buffer';
import { sha256 } from 'js-sha256';

// Browser-safe commitment hash generation
export function computeCommitmentHash(
    amount: number,
    outcome: number,
    salt: Buffer
): Buffer {
    // 1. Amount to 8 bytes LE
    const amountBuffer = Buffer.alloc(8);
    amountBuffer.writeBigUInt64LE(BigInt(amount));

    // 2. Outcome to 1 byte
    const outcomeBuffer = Buffer.from([outcome]);

    // 3. Concatenate: Amount + Outcome + Salt
    const data = Buffer.concat([amountBuffer, outcomeBuffer, salt]);

    // 4. Hash
    const hash = sha256.create();
    hash.update(data);

    return Buffer.from(hash.array());
}

export function generateSalt(): Buffer {
    const salt = new Uint8Array(32);
    window.crypto.getRandomValues(salt);
    return Buffer.from(salt);
}