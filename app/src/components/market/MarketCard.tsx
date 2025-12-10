import { FC } from 'react';
import { Link } from 'react-router-dom';

interface MarketCardProps {
    id: string;
    question: string;
    status: 'Open' | 'Revealing' | 'Resolved';
    poolSize: number;
    deadline: Date;
    bettors: number;
}

const statusColors = {
    Open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
    Revealing: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
    Resolved: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
};

export const MarketCard: FC<MarketCardProps> = ({ id, question, status, poolSize, deadline, bettors }) => {
    return (
        <Link to={`/market/${id}`}>
            <div className="group relative p-6 bg-slate-800/40 backdrop-blur-sm border border-white/5 rounded-2xl hover:border-emerald-500/30 hover:bg-slate-800/60 transition-all duration-300 shadow-lg hover:shadow-emerald-500/10 cursor-pointer h-full flex flex-col justify-between">

                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[status]}`}>
                        {status}
                    </span>
                    <span className="text-slate-400 text-xs">
                        {bettors} Bets
                    </span>
                </div>

                {/* Content */}
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-2 line-clamp-2 group-hover:text-emerald-400 transition-colors">
                        {question}
                    </h3>
                    <p className="text-slate-400 text-sm">
                        Ends: {deadline.toLocaleDateString()}
                    </p>
                </div>

                {/* Footer / Stats */}
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider">Pool Size</p>
                        <p className="text-white font-mono font-semibold">{poolSize} SOL</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                    </div>
                </div>
            </div>
        </Link>
    );
};