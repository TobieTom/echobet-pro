import { FC, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProgram } from '../hooks/useProgram';
import { findMarketPDA, findVaultPDA } from '../utils/pda';
import * as anchor from '@coral-xyz/anchor';
import { useNavigate } from 'react-router-dom';
import { SystemProgram } from '@solana/web3.js';

export const CreateMarket: FC = () => {
    const { connected, publicKey } = useWallet();
    const { program } = useProgram();
    const navigate = useNavigate();

    // Form State
    const [question, setQuestion] = useState('');
    const [deadline, setDeadline] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!program || !publicKey) return;

        setIsLoading(true);
        setError(null);

        try {
            // 1. Generate parameters
            // Using timestamp as a simple unique ID for the hackathon
            const marketId = new anchor.BN(Date.now());
            const deadlineTs = new anchor.BN(Math.floor(new Date(deadline).getTime() / 1000));

            // 2. Derive PDAs
            const [marketPda] = findMarketPDA(publicKey, marketId);
            const [vaultPda] = findVaultPDA(marketPda);

            // 3. Construct params struct 
            // (Matches standard Anchor pattern. If your IDL differs, adjust fields here)
            const params = {
                marketId: marketId,
                question: question,
                deadline: deadlineTs,
                revealPeriod: null, // Optional in prompt, sending null or default
            };

            // 4. Send Transaction
            const tx = await program.methods
                .createMarket(params)
                .accounts({
                    creator: publicKey,
                    market: marketPda,
                    vault: vaultPda,
                    oracle: publicKey, // Defaulting oracle to creator for MVP
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log("Market created signature:", tx);

            // 5. Redirect on success
            navigate('/markets');

        } catch (err: any) {
            console.error("Error creating market:", err);
            setError(err.message || "Failed to create market. Check console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 pt-28 px-4 pb-12 relative overflow-hidden">

            {/* Background Decor */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-2xl mx-auto relative z-10">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 text-center">
                    Create a Prediction <span className="text-emerald-400">Market</span>
                </h1>
                <p className="text-slate-400 text-center mb-8">
                    Ask a question, set a deadline, and let the world bet.
                </p>

                <div className="bg-slate-800/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl">
                    {!connected ? (
                        <div className="text-center py-12">
                            <div className="inline-flex p-4 rounded-full bg-white/5 mb-4 text-emerald-400">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">Wallet Not Connected</h3>
                            <p className="text-slate-400">Please connect your Solana wallet to create a market.</p>
                        </div>
                    ) : (
                        <form onSubmit={handleCreate} className="space-y-6">

                            {/* Question Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Market Question</label>
                                <textarea
                                    required
                                    maxLength={256}
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    placeholder="e.g., Will SOL hit $200 by Friday?"
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none h-32"
                                />
                                <div className="text-right text-xs text-slate-500">
                                    {question.length}/256
                                </div>
                            </div>

                            {/* Deadline Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Betting Deadline</label>
                                <input
                                    required
                                    type="datetime-local"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all [color-scheme:dark]"
                                />
                                <p className="text-xs text-slate-500">
                                    Bets cannot be placed after this time.
                                </p>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transform transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Creating Market...
                                    </>
                                ) : (
                                    "Launch Market"
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};