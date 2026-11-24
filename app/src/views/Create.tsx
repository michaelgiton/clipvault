import { useState } from 'react';
import type { Address } from 'viem';
import { useWallet } from '../App';
import { explorerTx, VAULT_ADDRESS } from '../config';
import { feeFor } from '../lib/vault';
import { fmtQusdc, parseQusdc } from '../lib/format';
import { ensureAllowance, humanizeError } from '../lib/web3';
import { createBountyTx } from '../lib/vault';
import { publicClient } from '../lib/web3';
import { VAULT_ABI } from '../lib/vault';
import { Card } from '../components/ui';

export function CreateView() {
  const wallet = useWallet();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [newBountyId, setNewBountyId] = useState<bigint | null>(null);

  const parsedAmount = parseQusdc(amount);
  const deadlineUnix = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;
  const creatorShare = parsedAmount === null ? null : parsedAmount - feeFor(parsedAmount);

  async function onCreate() {
    setError(null);
    setStatus(null);
    setTxHash(null);
    setNewBountyId(null);
    if (!wallet.address) {
      setError('Connect your wallet first.');
      return;
    }
    if (!wallet.onQie) {
      setError('Switch your wallet to QIE Mainnet (1990).');
      return;
    }
    if (!title.trim()) {
      setError('Give the bounty a title.');
      return;
    }
    if (parsedAmount === null || parsedAmount === 0n) {
      setError('Enter a bounty amount greater than 0 QUSDC.');
      return;
    }
    if (!deadline || deadlineUnix <= Math.floor(Date.now() / 1000)) {
      setError('Pick a deadline in the future.');
      return;
    }
    setBusy(true);
    try {
      const addr = wallet.address as Address;
      await ensureAllowance(addr, parsedAmount, setStatus);
      setStatus('Locking QUSDC in the vault…');
      const hash = await createBountyTx(
        addr,
        title.trim(),
        description.trim(),
        parsedAmount,
        BigInt(deadlineUnix),
      );
      setTxHash(hash);
      const count = (await publicClient.readContract({
        address: VAULT_ADDRESS as Address,
        abi: VAULT_ABI,
        functionName: 'bountyCount',
      })) as bigint;
      setNewBountyId(count);
      setStatus(`Bounty #${count.toString()} created — ${fmtQusdc(parsedAmount)} QUSDC locked in escrow.`);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <h1>Post a bounty</h1>
      <p className="page-sub">
        Lock QUSDC in escrow. Creators submit clips, you accept the winner, and the vault
        pays them automatically. If nobody wins by the deadline, you get the full amount back.
      </p>

      <Card>
        <label className="field">
          <span className="field-label">Title</span>
          <input
            type="text"
            value={title}
            maxLength={120}
            placeholder="e.g. 30-second hype clip for our launch"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">What should creators make?</span>
          <textarea
            value={description}
            rows={4}
            maxLength={1000}
            placeholder="Style, length, must-include moments, where the clip will run…"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Bounty amount (QUSDC)</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            placeholder="e.g. 50"
            onChange={(e) => setAmount(e.target.value)}
          />
          {wallet.balances && (
            <span className="field-hint">
              Your balance: {fmtQusdc(wallet.balances.qusdc)} QUSDC
            </span>
          )}
        </label>
        <label className="field">
          <span className="field-label">Deadline</span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>

        {parsedAmount !== null && parsedAmount > 0n && (
          <div className="fee-box">
            <div>
              <span>Winner receives (98%)</span>
              <strong>{fmtQusdc(creatorShare ?? 0n)} QUSDC</strong>
            </div>
            <div>
              <span>Platform fee (2%)</span>
              <strong>{fmtQusdc(feeFor(parsedAmount))} QUSDC</strong>
            </div>
            <div>
              <span>You lock now</span>
              <strong>{fmtQusdc(parsedAmount)} QUSDC</strong>
            </div>
          </div>
        )}

        {error && <div className="notice notice-error">{error}</div>}
        {status && <div className="notice notice-ok">{status}</div>}
        {txHash && (
          <div className="notice">
            Transaction:{' '}
            <a href={explorerTx(txHash)} target="_blank" rel="noreferrer">
              {txHash.slice(0, 18)}…
            </a>
            {newBountyId !== null && (
              <>
                {' — '}
                <a href={`#/bounty/${newBountyId}`}>View bounty #{newBountyId.toString()}</a>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !wallet.address}
          onClick={() => void onCreate()}
        >
          {busy ? 'Working…' : wallet.address ? 'Lock QUSDC & post bounty' : 'Connect wallet to post'}
        </button>
      </Card>
    </div>
  );
}
