import { defineChain } from 'viem';

/** QIE mainnet — chain ID 1990, verified live against the public RPC. */
export const QIE = defineChain({
  id: 1990,
  name: 'QIE Mainnet',
  nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc1mainnet.qie.digital'] } },
  blockExplorers: {
    default: { name: 'QIE Explorer', url: 'https://mainnet.qie.digital' },
  },
});

/** QUSDC — the hackathon stablecoin, already deployed. Never deploy your own. */
export const QUSDC_ADDRESS =
  '0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5' as const;

/**
 * ClipVaultEscrow address, set at deploy time. Build with
 * VITE_VAULT_ADDRESS=<address> once the contract is deployed; until then the
 * app runs in "not deployed yet" mode — browsing works against the contract
 * address only after deploy, and all writes are disabled with a clear notice.
 */
export const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS as string | undefined) ??
  '0x0000000000000000000000000000000000000000';
export const VAULT_DEPLOYED =
  VAULT_ADDRESS.toLowerCase() !== '0x0000000000000000000000000000000000000000';

export const HACKATHON_URL = 'https://hackathon.qie.digital';
export const EXPLORER_URL = 'https://mainnet.qie.digital';

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
