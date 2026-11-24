import {
  type Address,
  createPublicClient,
  createWalletClient,
  custom,
  type Hash,
  http,
  parseAbi,
} from 'viem';
import { QIE, QUSDC_ADDRESS, VAULT_ADDRESS } from '../config';

export const publicClient = createPublicClient({
  chain: QIE,
  transport: http(),
});

export const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum;
}

export function getWalletClient() {
  if (!window.ethereum) throw new Error('No wallet detected');
  return createWalletClient({ chain: QIE, transport: custom(window.ethereum) });
}

export async function connectWallet(): Promise<Address> {
  if (!window.ethereum) throw new Error('No wallet detected — install MetaMask or another injected wallet.');
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  if (!accounts.length) throw new Error('No accounts returned by wallet.');
  return accounts[0] as Address;
}

/** Switch to QIE mainnet, adding the network first if the wallet lacks it. */
export async function ensureQieNetwork(): Promise<void> {
  if (!window.ethereum) throw new Error('No wallet detected');
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x7c6' }], // 1990
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x7c6',
            chainName: 'QIE Mainnet',
            nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
            rpcUrls: ['https://rpc1mainnet.qie.digital'],
            blockExplorerUrls: ['https://mainnet.qie.digital'],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function getChainId(): Promise<number> {
  if (!window.ethereum) return 0;
  const hex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
  return parseInt(hex, 16);
}

export interface Balances {
  qusdc: bigint;
  qie: bigint;
}

export async function getBalances(owner: Address): Promise<Balances> {
  const [qusdc, qie] = await Promise.all([
    publicClient.readContract({
      address: QUSDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    }),
    publicClient.getBalance({ address: owner }),
  ]);
  return { qusdc, qie };
}

/**
 * Ensure the vault may pull `amount` QUSDC from `owner`, approving the exact
 * amount (least privilege) when the current allowance is too low.
 * Returns the approval tx hash, or null when no approval was needed.
 */
export async function ensureAllowance(
  owner: Address,
  amount: bigint,
  onStatus: (msg: string) => void,
): Promise<Hash | null> {
  const allowance = await publicClient.readContract({
    address: QUSDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, VAULT_ADDRESS as Address],
  });
  if (allowance >= amount) return null;
  onStatus('Approving QUSDC spend…');
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account: owner,
    address: QUSDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [VAULT_ADDRESS as Address, amount],
    chain: QIE,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function waitReceipt(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

/** Friendly one-line explanations for common failures. */
export function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('user rejected') || lower.includes('user denied')) {
    return 'Transaction rejected in your wallet.';
  }
  if (lower.includes('insufficient funds')) {
    return 'Not enough QIE for gas — buy QIE on MEXC, XT or BingX, or swap on-chain.';
  }
  if (lower.includes('zeroamount')) return 'The bounty amount must be greater than 0.';
  if (lower.includes('deadlineinpast')) return 'The deadline must be in the future.';
  if (lower.includes('bountynotopen')) return 'This bounty is no longer open.';
  if (lower.includes('notbrand')) return 'Only the brand that created this bounty can do that.';
  if (lower.includes('submissionnotfound')) return 'That submission does not exist.';
  if (lower.includes('deadlinepassed')) return 'The bounty deadline has passed.';
  if (lower.includes('deadlinenotpassed')) return 'Refunds open only after the deadline passes.';
  if (lower.includes('hassubmissions')) return 'Cancel is only possible when a bounty has no submissions yet.';
  if (lower.includes('brandcannotsubmit')) return 'The brand cannot submit a clip to its own bounty.';
  if (lower.includes('emptyclipurl')) return 'Add a link to your clip.';
  if (lower.includes('chain') && lower.includes('mismatch')) {
    return 'Your wallet is on the wrong network — switch to QIE Mainnet (1990).';
  }
  // viem shortMessage is usually the most readable part.
  const short = (err as { shortMessage?: string })?.shortMessage;
  if (short && short.length < 200) return short;
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}
