import { FC } from 'react';
import { Link } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export const Navbar: FC = () => {
    return (
        <nav className="fixed w-full z-50 top-0 start-0 border-b border-white/10 bg-slate-900/60 backdrop-blur-md">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between p-4">
                <Link to="/" className="flex items-center space-x-3 rtl:space-x-reverse">
                    <div className="w-8 h-8 bg-gradient-to-tr from-emerald-400 to-purple-500 rounded-full animate-pulse" />
                    <span className="self-center text-2xl font-bold whitespace-nowrap text-white tracking-tight">
                        EchoBet<span className="text-emerald-400">Pro</span>
                    </span>
                </Link>

                <div className="flex md:order-2 space-x-3 md:space-x-0 rtl:space-x-reverse">
                    <WalletMultiButton className="!bg-emerald-600 hover:!bg-emerald-700 !transition-all !rounded-xl !font-semibold" />
                </div>

                <div className="items-center justify-between hidden w-full md:flex md:w-auto md:order-1">
                    <ul className="flex flex-col p-4 md:p-0 mt-4 font-medium border border-gray-100 rounded-lg md:space-x-8 rtl:space-x-reverse md:flex-row md:mt-0 md:border-0">
                        <li>
                            <Link to="/markets" className="block py-2 px-3 text-gray-300 hover:text-emerald-400 transition-colors">Markets</Link>
                        </li>
                        <li>
                            <Link to="/create" className="block py-2 px-3 text-gray-300 hover:text-emerald-400 transition-colors">Create</Link>
                        </li>
                        <li>
                            <Link to="/dashboard" className="block py-2 px-3 text-gray-300 hover:text-emerald-400 transition-colors">Dashboard</Link>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
    );
};