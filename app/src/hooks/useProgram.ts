import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import idl from '../idl/echobet_pro.json';

const PROGRAM_ID = new PublicKey('HTDC5bDN6u7q1FCYnEuevztZM1ZqKcD9ujPTTLwNfTCc');

export const useProgram = () => {
    const { connection } = useConnection();
    const wallet = useAnchorWallet();

    const provider = useMemo(() => {
        if (!wallet) return null;
        return new AnchorProvider(connection, wallet, {
            preflightCommitment: 'processed',
        });
    }, [connection, wallet]);

    const program = useMemo(() => {
        if (!provider) return null;

        try {
            return new Program(idl as any, PROGRAM_ID, provider);
        } catch (e) {
            console.error('Failed to create program:', e);
            return null;
        }
    }, [provider]);

    return { program, provider, connection };
};