import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Styles
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

// Layout
import { Navbar } from './components/layout/Navbar';

// Pages
import { Markets } from './pages/Markets';
import { CreateMarket } from './pages/CreateMarket';
import { MarketDetail } from './pages/MarketDetail';
import { Dashboard } from './pages/Dashboard';

function App() {
  // defaulting to devnet for the hackathon
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-emerald-500/30">
              <Navbar />
              <Routes>
                <Route path="/" element={<Markets />} />
                <Route path="/markets" element={<Markets />} />
                <Route path="/create" element={<CreateMarket />} />
                <Route path="/market/:id" element={<MarketDetail />} />
                <Route path="/dashboard" element={<Dashboard />} />
              </Routes>
            </div>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;