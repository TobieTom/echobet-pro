import { FC, useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { useProgram } from '../hooks/useProgram';
import { findVaultPDA, findCommitmentPDA } from '../utils/pda';
import { computeCommitmentHash, generateSalt } from '../utils/commitment';
import { useBetStorage } from '../hooks/useBetStorage';
import { Buffer } from 'buffer';

// --- Types (Inferred from IDL) ---
interface MarketAccount {
    creator: PublicKey;
    oracle: PublicKey;
    question: string;
    marketId: anchor.BN;
    deadline: anchor.BN;
    revealDeadline: anchor.BN;
    totalPool: anchor.BN;
    status: { open?: {}; revealing?: {}; resolved?: {} };
    outcome: number | null;
}

export const MarketDetail: FC = () => {
    const { id } = useParams();
    const { publicKey } = useWallet();
    const { program } = useProgram();

    // State
    const [market, setMarket] = useState<MarketAccount | null>(null);
    const [amount, setAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [resolveOutcome, setResolveOutcome] = useState<number | null>(null);

    // Custom Hook for LocalStorage
    const { storedBet, saveBet, clearBet } = useBetStorage(id || '');

    // Fetch Market Data
    useEffect(() => {
        if (!program || !id) return;

        const fetchMarket = async () => {
            try {
                const marketPubkey = new PublicKey(id);
                const account = await program.account.market.fetch(marketPubkey);
                setMarket(account as unknown as MarketAccount);
            } catch (e) {
                console.error("Failed to fetch market", e);
            }
        };

        fetchMarket();
        const interval = setInterval(fetchMarket, 10000);
        return () => clearInterval(interval);
    }, [program, id]);

    // Derived Status Helper - checks both on-chain status AND deadline time
    const marketStatus = useMemo(() => {
        if (!market) return 'loading';

        const now = Date.now() / 1000; // Current time in seconds
        const deadline = market.deadline.toNumber();
        const revealDeadline = market.revealDeadline?.toNumber() || (deadline + 86400); // +24h default

        // Check on-chain status first
        if (market.status.resolved) return 'Resolved';
        if (market.status.revealing) return 'Revealing';

        // If on-chain says Open, but deadline passed, show as Revealing
        if (market.status.open && now >= deadline && now < revealDeadline) {
            return 'Revealing';
        }

        return 'Open';
    }, [market]);

    // Check if current user is the oracle (can resolve)
    const isOracle = useMemo(() => {
        if (!market || !publicKey) return false;
        return market.oracle.equals(publicKey) || market.creator.equals(publicKey);
    }, [market, publicKey]);

    // --- ACTIONS ---

    const handleCommit = async (outcome: number) => {
        if (!program || !publicKey || !market) return;
        setIsLoading(true);

        try {
            const lamports = parseFloat(amount) * 1_000_000_000;
            const salt = generateSalt();

            const commitmentHash = computeCommitmentHash(lamports, outcome, salt);

            const marketPubkey = new PublicKey(id!);
            const [commitmentPda] = findCommitmentPDA(marketPubkey, publicKey);
            const [vaultPda] = findVaultPDA(marketPubkey);

            const tx = await program.methods
                .commitBet({
                    amount: new anchor.BN(lamports),
                    commitmentHash: Array.from(commitmentHash)
                })
                .accounts({
                    user: publicKey,
                    market: marketPubkey,
                    commitment: commitmentPda,
                    vault: vaultPda,
                    systemProgram: SystemProgram.programId
                })
                .rpc();

            saveBet({
                marketId: id!,
                amount: lamports,
                outcome,
                salt: Buffer.from(salt).toString('hex'),
                txSignature: tx
            });

            alert("Bet Placed! We saved your secret key to this browser. Do not clear your cache!");
            setAmount('');
        } catch (err) {
            console.error(err);
            alert("Transaction failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReveal = async () => {
        if (!program || !publicKey || !storedBet) return;
        setIsLoading(true);

        try {
            const marketPubkey = new PublicKey(id!);
            const [commitmentPda] = findCommitmentPDA(marketPubkey, publicKey);

            const saltBuffer = Buffer.from(storedBet.salt, 'hex');

            await program.methods
                .revealBet({
                    outcome: storedBet.outcome,
                    salt: Array.from(saltBuffer)
                })
                .accounts({
                    user: publicKey,
                    market: marketPubkey,
                    commitment: commitmentPda
                })
                .rpc();

            alert("Bet Revealed! If you won, wait for resolution to claim.");
            clearBet();
        } catch (err) {
            console.error(err);
            alert("Reveal failed. Are you sure the market is in Reveal phase?");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResolve = async () => {
        if (!program || !publicKey || !market || resolveOutcome === null) return;
        setIsLoading(true);

        try {
            const marketPubkey = new PublicKey(id!);

            await program.methods
                .resolveMarket({
                    outcome: resolveOutcome
                })
                .accounts({
                    resolver: publicKey,
                    market: marketPubkey
                })
                .rpc();

            alert(`Market resolved as ${resolveOutcome === 1 ? 'YES' : 'NO'}!`);
            setResolveOutcome(null);
        } catch (err) {
            console.error(err);
            alert("Resolution failed. Are you the oracle?");
        } finally {
            setIsLoading(false);
        }
    };

    const handleClaim = async () => {
        if (!program || !publicKey || !market) return;
        setIsLoading(true);

        try {
            const marketPubkey = new PublicKey(id!);
            const [commitmentPda] = findCommitmentPDA(marketPubkey, publicKey);
            const [vaultPda] = findVaultPDA(marketPubkey);

            await program.methods
                .claimWinnings()
                .accounts({
                    user: publicKey,
                    market: marketPubkey,
                    commitment: commitmentPda,
                    vault: vaultPda,
                    systemProgram: SystemProgram.programId
                })
                .rpc();

            alert("Winnings claimed successfully!");
        } catch (err) {
            console.error(err);
            alert("Claim failed. Did you win?");
        } finally {
            setIsLoading(false);
        }
    };

    // --- RENDER ---

    if (!market) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 pt-28 px-4 pb-12">
            <div className="max-w-4xl mx-auto">

                {/* Header Card */}
                <div className="bg-slate-800/60 backdrop-blur-md border border-white/5 rounded-2xl p-8 mb-8 shadow-2xl">
                    <div className="flex justify-between items-start mb-4">
                        <span className={`px-4 py-1.5 rounded-full text-sm font-bold border ${marketStatus === 'Open' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' :
                                marketStatus === 'Revealing' ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' :
                                    'bg-gray-500/20 text-gray-400 border-gray-500/50'
                            }`}>
                            {marketStatus.toUpperCase()}
                        </span>
                        <div className="text-right">
                            <p className="text-slate-400 text-xs uppercase tracking-wider">Total Pool</p>
                            <p className="text-2xl font-mono font-bold text-white">
                                {(market.totalPool.toNumber() / 1_000_000_000).toFixed(2)} SOL
                            </p>
                        </div>
                    </div>

                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
                        {market.question}
                    </h1>

                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        <span>Deadline: {new Date(market.deadline.toNumber() * 1000).toLocaleString()}</span>
                    </div>
                </div>

                {/* Dynamic Action Area */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* Main Action Column */}
                    <div className="md:col-span-2">

                        {/* === OPEN PHASE === */}
                        {marketStatus === 'Open' && (
                            <div className="bg-slate-800/60 backdrop-blur-md border border-white/5 rounded-2xl p-6">
                                <h3 className="text-xl font-bold text-white mb-4">Place your Bet</h3>
                                <div className="mb-6">
                                    <label className="text-sm text-slate-400 mb-2 block">Amount (SOL)</label>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-white text-xl font-mono focus:border-emerald-500 outline-none transition-all"
                                        placeholder="0.5"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => handleCommit(1)}
                                        disabled={isLoading || !amount}
                                        className="bg-emerald-500/10 hover:bg-emerald-500 hover:text-white border border-emerald-500/50 text-emerald-500 font-bold py-4 rounded-xl transition-all disabled:opacity-50"
                                    >
                                        YES
                                    </button>
                                    <button
                                        onClick={() => handleCommit(0)}
                                        disabled={isLoading || !amount}
                                        className="bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/50 text-red-500 font-bold py-4 rounded-xl transition-all disabled:opacity-50"
                                    >
                                        NO
                                    </button>
                                </div>
                                <p className="mt-4 text-xs text-slate-500 text-center">
                                    * Your vote is encrypted (hashed) until the reveal phase.
                                </p>
                            </div>
                        )}

                        {/* === REVEALING PHASE === */}
                        {marketStatus === 'Revealing' && (
                            <div className="space-y-6">
                                {/* Reveal Bet Section */}
                                <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6">
                                    <h3 className="text-xl font-bold text-purple-200 mb-2">Reveal Phase Active</h3>
                                    <p className="text-slate-400 mb-6">It's time to reveal your hidden vote to the blockchain.</p>

                                    {storedBet ? (
                                        <div className="bg-slate-900/50 rounded-xl p-4 mb-4 border border-white/5">
                                            <div className="flex justify-between text-sm mb-2">
                                                <span className="text-slate-400">Your Hidden Bet:</span>
                                                <span className={storedBet.outcome === 1 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                                    {storedBet.outcome === 1 ? "YES" : "NO"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm mb-4">
                                                <span className="text-slate-400">Amount:</span>
                                                <span className="text-white font-mono">
                                                    {(storedBet.amount / 1_000_000_000).toFixed(2)} SOL
                                                </span>
                                            </div>
                                            <button
                                                onClick={handleReveal}
                                                disabled={isLoading}
                                                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-purple-900/50"
                                            >
                                                {isLoading ? "Revealing..." : "Reveal My Bet"}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-slate-500">
                                            No saved commitment found on this device.
                                        </div>
                                    )}
                                </div>

                                {/* Resolve Market Section (Only for Oracle/Creator) */}
                                {isOracle && (
                                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-6">
                                        <h3 className="text-xl font-bold text-amber-200 mb-2">Resolve Market</h3>
                                        <p className="text-slate-400 mb-6">As the market creator, you can set the final outcome.</p>

                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <button
                                                onClick={() => setResolveOutcome(1)}
                                                className={`py-4 rounded-xl font-bold transition-all border ${resolveOutcome === 1
                                                        ? 'bg-emerald-500 text-white border-emerald-500'
                                                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/50 hover:bg-emerald-500 hover:text-white'
                                                    }`}
                                            >
                                                YES Wins
                                            </button>
                                            <button
                                                onClick={() => setResolveOutcome(0)}
                                                className={`py-4 rounded-xl font-bold transition-all border ${resolveOutcome === 0
                                                        ? 'bg-red-500 text-white border-red-500'
                                                        : 'bg-red-500/10 text-red-500 border-red-500/50 hover:bg-red-500 hover:text-white'
                                                    }`}
                                            >
                                                NO Wins
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleResolve}
                                            disabled={isLoading || resolveOutcome === null}
                                            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-amber-900/50 disabled:opacity-50"
                                        >
                                            {isLoading ? "Resolving..." : "Confirm Resolution"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* === RESOLVED PHASE === */}
                        {marketStatus === 'Resolved' && (
                            <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-6 text-center">
                                <h3 className="text-2xl font-bold text-white mb-4">Market Resolved</h3>
                                <div className="text-6xl mb-6">
                                    {market.outcome === 1 ? "✅" : "❌"}
                                </div>
                                <p className="text-lg text-slate-300 mb-6">
                                    Winning Outcome: <span className="font-bold text-white">{market.outcome === 1 ? "YES" : "NO"}</span>
                                </p>
                                <button
                                    onClick={handleClaim}
                                    disabled={isLoading}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                                >
                                    {isLoading ? "Claiming..." : "Claim Winnings"}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Stats Column */}
                    <div className="space-y-4">
                        <div className="bg-slate-800/40 backdrop-blur border border-white/5 rounded-2xl p-6">
                            <h4 className="text-slate-400 text-sm font-semibold uppercase mb-4">Market Health</h4>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-white">Privacy Level</span>
                                        <span className="text-emerald-400">High</span>
                                    </div>
                                    <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                                        <div className="bg-emerald-500 w-full h-full"></div>
                                    </div>
                                </div>

                                {marketStatus !== 'Open' && (
                                    <div className="pt-4 border-t border-white/5">
                                        <p className="text-sm text-slate-400 mb-2">Vote Distribution</p>
                                        <div className="flex h-4 rounded-full overflow-hidden">
                                            <div className="bg-emerald-500 w-[60%]"></div>
                                            <div className="bg-red-500 w-[40%]"></div>
                                        </div>
                                        <div className="flex justify-between text-xs mt-1 text-slate-500">
                                            <span>YES</span>
                                            <span>NO</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};