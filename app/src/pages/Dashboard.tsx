import { FC, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Link } from 'react-router-dom';
import { useProgram } from '../hooks/useProgram';

interface BetInfo {
    marketId: string;
    marketQuestion: string;
    amount: number;
    outcome: number | null;
    isRevealed: boolean;
    isClaimed: boolean;
    marketStatus: 'Open' | 'Revealing' | 'Resolved';
    marketOutcome: number | null;
    didWin: boolean | null;
}

export const Dashboard: FC = () => {
    const { publicKey } = useWallet();
    const { program } = useProgram();
    const [bets, setBets] = useState<BetInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        totalBets: 0,
        totalWagered: 0,
        wins: 0,
        losses: 0,
        pending: 0
    });

    useEffect(() => {
        const fetchBets = async () => {
            if (!program || !publicKey) {
                setIsLoading(false);
                return;
            }

            try {
                // Fetch all commitment accounts for this user
                const commitments = await program.account.commitment.all([
                    {
                        memcmp: {
                            offset: 8 + 32, // After discriminator + market pubkey
                            bytes: publicKey.toBase58()
                        }
                    }
                ]);

                const betInfos: BetInfo[] = [];
                let totalWagered = 0;
                let wins = 0;
                let losses = 0;
                let pending = 0;

                for (const commitment of commitments) {
                    const c = commitment.account as any;
                    const marketPubkey = c.market as PublicKey;

                    // Fetch the associated market
                    try {
                        const market = await program.account.market.fetch(marketPubkey);
                        const m = market as any;

                        const now = Date.now() / 1000;
                        const deadline = m.deadline.toNumber();
                        
                        let marketStatus: 'Open' | 'Revealing' | 'Resolved' = 'Open';
                        if (m.status.resolved) {
                            marketStatus = 'Resolved';
                        } else if (m.status.revealing || now >= deadline) {
                            marketStatus = 'Revealing';
                        }

                        const amount = c.amount.toNumber() / 1_000_000_000;
                        totalWagered += amount;

                        let didWin: boolean | null = null;
                        if (marketStatus === 'Resolved' && c.isRevealed) {
                            didWin = c.revealedOutcome === m.outcome;
                            if (didWin) wins++;
                            else losses++;
                        } else {
                            pending++;
                        }

                        betInfos.push({
                            marketId: marketPubkey.toBase58(),
                            marketQuestion: m.question,
                            amount,
                            outcome: c.revealedOutcome ?? null,
                            isRevealed: c.isRevealed,
                            isClaimed: c.isClaimed,
                            marketStatus,
                            marketOutcome: m.outcome ?? null,
                            didWin
                        });
                    } catch (e) {
                        console.error('Failed to fetch market for commitment', e);
                    }
                }

                setBets(betInfos);
                setStats({
                    totalBets: betInfos.length,
                    totalWagered,
                    wins,
                    losses,
                    pending
                });
            } catch (error) {
                console.error('Error fetching bets:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchBets();
    }, [program, publicKey]);

    if (!publicKey) {
        return (
            <div className="min-h-screen bg-slate-900 pt-28 px-4 pb-12">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-4xl font-bold text-white mb-4">Dashboard</h1>
                    <p className="text-slate-400 mb-8">Connect your wallet to view your betting history.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 pt-28 px-4 pb-12">
            <div className="max-w-6xl mx-auto">
                
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        Your <span className="text-emerald-400">Dashboard</span>
                    </h1>
                    <p className="text-slate-400 text-lg">
                        Track your bets, reveals, and winnings.
                    </p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
                    <div className="bg-slate-800/60 backdrop-blur border border-white/5 rounded-2xl p-6">
                        <p className="text-slate-400 text-sm mb-1">Total Bets</p>
                        <p className="text-3xl font-bold text-white">{stats.totalBets}</p>
                    </div>
                    <div className="bg-slate-800/60 backdrop-blur border border-white/5 rounded-2xl p-6">
                        <p className="text-slate-400 text-sm mb-1">Total Wagered</p>
                        <p className="text-3xl font-bold text-white">{stats.totalWagered.toFixed(2)} <span className="text-lg text-slate-400">SOL</span></p>
                    </div>
                    <div className="bg-emerald-900/30 backdrop-blur border border-emerald-500/20 rounded-2xl p-6">
                        <p className="text-emerald-400 text-sm mb-1">Wins</p>
                        <p className="text-3xl font-bold text-emerald-400">{stats.wins}</p>
                    </div>
                    <div className="bg-red-900/30 backdrop-blur border border-red-500/20 rounded-2xl p-6">
                        <p className="text-red-400 text-sm mb-1">Losses</p>
                        <p className="text-3xl font-bold text-red-400">{stats.losses}</p>
                    </div>
                    <div className="bg-purple-900/30 backdrop-blur border border-purple-500/20 rounded-2xl p-6">
                        <p className="text-purple-400 text-sm mb-1">Pending</p>
                        <p className="text-3xl font-bold text-purple-400">{stats.pending}</p>
                    </div>
                </div>

                {/* Bets List */}
                <div className="bg-slate-800/40 backdrop-blur border border-white/5 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                        <h2 className="text-xl font-bold text-white">Bet History</h2>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
                        </div>
                    ) : bets.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="inline-flex p-4 rounded-full bg-white/5 mb-4 text-slate-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">No Bets Yet</h3>
                            <p className="text-slate-400 mb-6">Place your first bet on a prediction market!</p>
                            <Link
                                to="/markets"
                                className="inline-flex px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all"
                            >
                                Browse Markets
                            </Link>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {bets.map((bet, index) => (
                                <Link
                                    key={index}
                                    to={`/market/${bet.marketId}`}
                                    className="block p-6 hover:bg-white/5 transition-all"
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                                    bet.marketStatus === 'Open' 
                                                        ? 'bg-emerald-500/20 text-emerald-400' 
                                                        : bet.marketStatus === 'Revealing'
                                                        ? 'bg-purple-500/20 text-purple-400'
                                                        : 'bg-gray-500/20 text-gray-400'
                                                }`}>
                                                    {bet.marketStatus}
                                                </span>
                                                {bet.didWin !== null && (
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                                        bet.didWin 
                                                            ? 'bg-emerald-500/20 text-emerald-400' 
                                                            : 'bg-red-500/20 text-red-400'
                                                    }`}>
                                                        {bet.didWin ? '🎉 Won' : 'Lost'}
                                                    </span>
                                                )}
                                                {!bet.isRevealed && bet.marketStatus === 'Revealing' && (
                                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 animate-pulse">
                                                        ⚠️ Needs Reveal
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-1">
                                                {bet.marketQuestion}
                                            </h3>
                                            <p className="text-sm text-slate-400">
                                                Your bet: <span className={bet.outcome === 1 ? 'text-emerald-400' : bet.outcome === 0 ? 'text-red-400' : 'text-slate-500'}>
                                                    {bet.isRevealed ? (bet.outcome === 1 ? 'YES' : 'NO') : 'Hidden'}
                                                </span>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold font-mono text-white">
                                                {bet.amount.toFixed(2)} SOL
                                            </p>
                                            {bet.isClaimed && (
                                                <p className="text-sm text-emerald-400">✓ Claimed</p>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};