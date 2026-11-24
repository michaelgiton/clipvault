import type { Address, Hash } from 'viem';
import { parseAbi } from 'viem';
import { QIE, VAULT_ADDRESS, VAULT_DEPLOYED } from '../config';
import { getWalletClient, publicClient } from './web3';

export const VAULT_ABI = parseAbi([
  'function createBounty(string title, string description, uint256 amount, uint256 deadline) returns (uint256 bountyId)',
  'function submitClip(uint256 bountyId, string clipUrl, string contentHash) returns (uint256 submissionId)',
  'function acceptSubmission(uint256 bountyId, uint256 submissionId)',
  'function refundBounty(uint256 bountyId)',
  'function cancelBounty(uint256 bountyId)',
  'function bountyCount() view returns (uint256)',
  'function feeRecipient() view returns (address)',
  'function getBounty(uint256 bountyId) view returns (address brand, string title, string description, uint256 amount, uint256 deadline, uint8 status, uint256 submissionCount, uint256 acceptedSubmissionId)',
  'function getSubmission(uint256 bountyId, uint256 submissionId) view returns (address creator, string clipUrl, string contentHash, uint256 createdAt)',
  'event BountyCreated(uint256 indexed bountyId, address indexed brand, uint256 amount, uint256 deadline)',
  'event ClipSubmitted(uint256 indexed bountyId, uint256 indexed submissionId, address indexed creator, string clipUrl, string contentHash)',
  'event SubmissionAccepted(uint256 indexed bountyId, uint256 indexed submissionId, address indexed creator, uint256 creatorAmount, uint256 feeAmount)',
  'event BountyRefunded(uint256 indexed bountyId, address indexed brand, uint256 amount)',
  'event BountyCancelled(uint256 indexed bountyId, address indexed brand, uint256 amount)',
]);

export enum BountyStatus {
  Open = 0,
  Paid = 1,
  Refunded = 2,
}

export interface Bounty {
  id: bigint;
  brand: Address;
  title: string;
  description: string;
  amount: bigint;
  deadline: number;
  status: BountyStatus;
  submissionCount: number;
  acceptedSubmissionId: bigint;
}

export interface Submission {
  id: bigint;
  creator: Address;
  clipUrl: string;
  contentHash: string;
  createdAt: number;
}

export const FEE_BPS = 200n; // 2%

export function feeFor(amount: bigint): bigint {
  return (amount * FEE_BPS) / 10_000n;
}

/** Read every bounty on-chain (newest first). Read-only: works with no wallet. */
export async function listBounties(): Promise<Bounty[]> {
  if (!VAULT_DEPLOYED) return [];
  const count = await publicClient.readContract({
    address: VAULT_ADDRESS as Address,
    abi: VAULT_ABI,
    functionName: 'bountyCount',
  });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n; i--) ids.push(i);
  const rows = await Promise.all(ids.map((id) => readBounty(id)));
  return rows.filter((b): b is Bounty => b !== null);
}

export async function readBounty(id: bigint): Promise<Bounty | null> {
  if (!VAULT_DEPLOYED) return null;
  try {
    const r = await publicClient.readContract({
      address: VAULT_ADDRESS as Address,
      abi: VAULT_ABI,
      functionName: 'getBounty',
      args: [id],
    });
    return {
      id,
      brand: r[0],
      title: r[1],
      description: r[2],
      amount: r[3],
      deadline: Number(r[4]),
      status: r[5] as BountyStatus,
      submissionCount: Number(r[6]),
      acceptedSubmissionId: r[7],
    };
  } catch {
    return null;
  }
}

export async function listSubmissions(bountyId: bigint, count: number): Promise<Submission[]> {
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await publicClient.readContract({
          address: VAULT_ADDRESS as Address,
          abi: VAULT_ABI,
          functionName: 'getSubmission',
          args: [bountyId, id],
        });
        return { id, creator: r[0], clipUrl: r[1], contentHash: r[2], createdAt: Number(r[3]) };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((s): s is Submission => s !== null);
}

export async function createBountyTx(
  account: Address,
  title: string,
  description: string,
  amount: bigint,
  deadline: bigint,
): Promise<Hash> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account,
    address: VAULT_ADDRESS as Address,
    abi: VAULT_ABI,
    functionName: 'createBounty',
    args: [title, description, amount, deadline],
    chain: QIE,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function submitClipTx(
  account: Address,
  bountyId: bigint,
  clipUrl: string,
  contentHash: string,
): Promise<Hash> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account,
    address: VAULT_ADDRESS as Address,
    abi: VAULT_ABI,
    functionName: 'submitClip',
    args: [bountyId, clipUrl, contentHash],
    chain: QIE,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function acceptSubmissionTx(
  account: Address,
  bountyId: bigint,
  submissionId: bigint,
): Promise<Hash> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account,
    address: VAULT_ADDRESS as Address,
    abi: VAULT_ABI,
    functionName: 'acceptSubmission',
    args: [bountyId, submissionId],
    chain: QIE,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function refundBountyTx(account: Address, bountyId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account,
    address: VAULT_ADDRESS as Address,
    abi: VAULT_ABI,
    functionName: 'refundBounty',
    args: [bountyId],
    chain: QIE,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function cancelBountyTx(account: Address, bountyId: bigint): Promise<Hash> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    account,
    address: VAULT_ADDRESS as Address,
    abi: VAULT_ABI,
    functionName: 'cancelBounty',
    args: [bountyId],
    chain: QIE,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
