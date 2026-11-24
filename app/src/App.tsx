import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Address } from 'viem';
import { EXPLORER_URL, HACKATHON_URL, QIE, VAULT_DEPLOYED } from './config';
import { fmtQie, fmtQusdc, shortAddr } from './lib/format';
import {
  type Balances,
  connectWallet,
  ensureQieNetwork,
  getBalances,
  getChainId,
  hasInjectedWallet,
  humanizeError,
} from './lib/web3';
import { BountyView } from './views/Bounty';
import { CreateView } from './views/Create';
import { HomeView } from './views/Home';

// ------------------------------------------------------------------ wallet

interface WalletState {
  address: Address | null;
  chainId: number;
  onQie: boolean;
  balances: Balances | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

function useWalletState(): WalletState {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState(0);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [cid, bal] = await Promise.all([getChainId(), getBalances(address)]);
      setChainId(cid);
      setBalances(bal);
    } catch {
      // Balances are best-effort; the UI keeps working without them.
    }
  }, [address]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      if (!hasInjectedWallet()) {
        throw new Error('No wallet detected — install MetaMask or another injected wallet, then try again.');
      }
      const addr = await connectWallet();
      await ensureQieNetwork();
      setAddress(addr);
      const [cid, bal] = await Promise.all([getChainId(), getBalances(addr)]);
      setChainId(cid);
      setBalances(bal);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  // Silent reconnect + account/chain listeners.
  useEffect(() => {
    if (!hasInjectedWallet()) return;
    window.ethereum
      ?.request({ method: 'eth_accounts' })
      .then(async (accounts) => {
        const list = accounts as string[];
        if (list.length) {
          const addr = list[0] as Address;
          setAddress(addr);
          const [cid, bal] = await Promise.all([getChainId(), getBalances(addr)]);
          setChainId(cid);
          setBalances(bal);
        }
      })
      .catch(() => undefined);
    const onAccounts = (accs: unknown) => {
      const list = accs as string[];
      setAddress(list.length ? (list[0] as Address) : null);
      setBalances(null);
    };
    const onChain = () => {
      void getChainId().then(setChainId);
      void refresh();
    };
    window.ethereum?.on?.('accountsChanged', onAccounts as (...a: unknown[]) => void);
    window.ethereum?.on?.('chainChanged', onChain as (...a: unknown[]) => void);
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', onAccounts as (...a: unknown[]) => void);
      window.ethereum?.removeListener?.('chainChanged', onChain as (...a: unknown[]) => void);
    };
  }, [refresh]);

  const value = useMemo<WalletState>(
    () => ({
      address,
      chainId,
      onQie: chainId === QIE.id,
      balances,
      connecting,
      error,
      connect,
      refresh,
    }),
    [address, chainId, balances, connecting, error, connect, refresh],
  );
  return value;
}

// ------------------------------------------------------------------ routing

export type Route =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'bounty'; bountyId: string };

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const bountyMatch = path.match(/^\/bounty\/(\d+)$/);
  if (bountyMatch) return { name: 'bounty', bountyId: bountyMatch[1] };
  if (path === '/create') return { name: 'create' };
  return { name: 'home' };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function navigate(path: string) {
  window.location.hash = path;
}

// -------------------------------------------------------------------- shell

function Header({ route }: { route: Route }) {
  const wallet = useWallet();
  const links: { path: string; label: string; active: boolean }[] = [
    { path: '#/', label: 'Bounties', active: route.name === 'home' },
    { path: '#/create', label: 'Post a bounty', active: route.name === 'create' },
  ];
  return (
    <header className="site-header">
      <a href="#/" className="brand" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
        <span className="brand-mark">▣</span>
        <span className="brand-name">ClipVault</span>
        <span className="brand-net">QIE mainnet</span>
      </a>
      <nav className="site-nav">
        {links.map((l) => (
          <a
            key={l.path}
            href={l.path}
            className={l.active ? 'nav-link active' : 'nav-link'}
            onClick={(e) => { e.preventDefault(); navigate(l.path.slice(1)); }}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <div className="wallet-box">
        {wallet.address ? (
          <>
            <span className="network-badge" title={`Chain ID ${wallet.chainId}`}>
              {wallet.onQie ? '● QIE 1990' : `● Chain ${wallet.chainId || '?'}`}
            </span>
            <span className="balance-chip" title="QUSDC balance">
              {wallet.balances ? `${fmtQusdc(wallet.balances.qusdc)} QUSDC` : '…'}
            </span>
            <span className="balance-chip subtle" title="QIE (gas) balance">
              {wallet.balances ? `${fmtQie(wallet.balances.qie)} QIE` : '…'}
            </span>
            <span className="address-chip">{shortAddr(wallet.address)}</span>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
            {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
          </button>
        )}
      </div>
    </header>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return (
    <div className="page">
      <Header route={parseHash(window.location.hash)} />
      {!VAULT_DEPLOYED && (
        <div className="notice notice-warn page-banner">
          <strong>Contracts not deployed yet.</strong> This build is wired to QIE Mainnet
          (chain 1990) and activates automatically once the ClipVaultEscrow contract is
          deployed and the app is rebuilt with its address. Wallet connection and balances
          work now.
        </div>
      )}
      {wallet.address && !wallet.onQie && (
        <div className="notice notice-warn page-banner">
          Your wallet is on chain {wallet.chainId || 'unknown'} — switch to QIE Mainnet
          (1990) to use ClipVault.{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void ensureQieNetwork().then(() => wallet.refresh())}>
            Switch network
          </button>
        </div>
      )}
      {wallet.error && <div className="notice notice-error page-banner">{wallet.error}</div>}
      <main className="main">{children}</main>
      <footer className="site-footer">
        <span>
          ClipVault runs on QIE Mainnet with real QUSDC — escrowed funds are real value.
        </span>
        <span className="footer-links">
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer">Explorer</a>
          <a href={HACKATHON_URL} target="_blank" rel="noreferrer">QIE Hackathon 3.0</a>
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  const wallet = useWalletState();
  const route = useRoute();
  return (
    <WalletContext.Provider value={wallet}>
      <Shell>
        {route.name === 'home' && <HomeView />}
        {route.name === 'create' && <CreateView />}
        {route.name === 'bounty' && <BountyView bountyId={route.bountyId} />}
      </Shell>
    </WalletContext.Provider>
  );
}
