import { FC, useState, useEffect } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { MarketCard } from '../components/market/MarketCard';
import { useProgram } from '../hooks/useProgram';
import { Link } from 'react-router-dom';

interface MarketData {
    id: string;
    question: string;
    status: 'Open' | 'Revealing' | 'Resolved';
    poolSize: number;
    deadline: Date;
    bettors: number;
}

export const Markets: FC = () => {
    const [filter, setFilter] = useState('All');
    const [markets, setMarkets] = useState<MarketData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { program } = useProgram();
    const { connection } = useConnection();

    useEffect(() => {
        const fetchMarkets = async () => {
            if (!program) {
                setIsLoading(false);
                return;
            }

            try {
                // Fetch all Market accounts from the program
                const marketAccounts = await program.account.market.all();
                
                const formattedMarkets: MarketData[] = marketAccounts.map((account) => {
                    const market = account.account as any;
                    
                    // Determine status
                    let status: 'Open' | 'Revealing' | 'Resolved' = 'Open';
                    if (market.status.revealing) status = 'Revealing';
                    if (market.status.resolved) status = 'Resolved';
                    
                    return {
                        id: account.publicKey.toBase58(),
                        question: market.question,
                        status,
                        poolSize: market.totalPool.toNumber() / 1_000_000_000,
                        deadline: new Date(market.deadline.toNumber() * 1000),
                        bettors: market.yesCount + market.noCount,
                    };
                });

                setMarkets(formattedMarkets);
            } catch (error) {
                console.error('Error fetching markets:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMarkets();
        
        // Refresh every 30 seconds
        const interval = setInterval(fetchMarkets, 30000);
        return () => clearInterval(interval);
    }, [program]);

    const filteredMarkets = markets.filter(m => filter === 'All' || m.status === filter);

    return (
        <div className="min-h-screen bg-slate-900 pt-24 px-4 pb-12">
            <div className="max-w-7xl mx-auto">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            Live <span className="text-emerald-400">Markets</span>
                        </h1>
                        <p className="text-slate-400 text-lg max-w-2xl">
                            Predict outcomes, bet privately, and win rewards on the most secure prediction market on Solana.
                        </p>
                    </div>

                    <div className="flex gap-2 p-1 bg-slate-800/50 rounded-xl border border-white/5 backdrop-blur-sm">
                        {['All', 'Open', 'Revealing', 'Resolved'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === f
                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
                    </div>
                ) : filteredMarkets.length === 0 ? (
                    /* Empty State */
                    <div className="text-center py-20">
                        <div className="inline-flex p-4 rounded-full bg-white/5 mb-4 text-emerald-400">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">No Markets Yet</h3>
                        <p className="text-slate-400 mb-6">Be the first to create a prediction market!</p>
                        <Link
                            to="/create"
                            className="inline-flex px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all"
                        >
                            Create Market
                        </Link>
                    </div>
                ) : (
                    /* Grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredMarkets.map((market) => (
                            <MarketCard key={market.id} {...market} />
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
};