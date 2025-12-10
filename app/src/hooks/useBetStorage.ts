import { useState, useEffect } from 'react';

interface StoredBet {
    marketId: string;
    amount: number;
    outcome: number; // 0 = No, 1 = Yes
    salt: string; // Hex string representation of the buffer
    txSignature: string;
}

export const useBetStorage = (marketId: string) => {
    const [storedBet, setStoredBet] = useState<StoredBet | null>(null);
    const key = `echobet_commitment_${marketId}`;

    useEffect(() => {
        const data = localStorage.getItem(key);
        if (data) {
            setStoredBet(JSON.parse(data));
        }
    }, [marketId]);

    const saveBet = (bet: StoredBet) => {
        localStorage.setItem(key, JSON.stringify(bet));
        setStoredBet(bet);
    };

    const clearBet = () => {
        localStorage.removeItem(key);
        setStoredBet(null);
    };

    return { storedBet, saveBet, clearBet };
};