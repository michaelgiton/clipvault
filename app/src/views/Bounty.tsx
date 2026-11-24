import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { useWallet } from '../App';
import { explorerAddress, explorerTx } from '../config';
import { feeFor, BountyStatus, acceptSubmissionTx, cancelBountyTx, listSubmissions, readBounty, refundBountyTx, submitClipTx, type Bounty, type Submission } from '../lib/vault';
import { fmtCountdown, fmtDateTime, fmtQusdc, shortAddr } from '../lib/format';
import { humanizeError } from '../lib/web3';
import { Card, Empty, Spinner, StatusBadge } from '../components/ui';

export function BountyView({ bountyId }: { bountyId: string }) {
  const wallet = useWallet();
  const id = BigInt(bountyId);
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [clipUrl, setClipUrl] = useState('');
  const [contentHash, setContentHash] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const b = await readBounty(id);
      if (!b) {
        setNotFound(true);
        return;
      }
      setBounty(b);
      setSubs(await listSubmissions(id, b.submissionCount));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isBrand =
    wallet.address && bounty
      ? bounty.brand.toLowerCase() === wallet.address.toLowerCase()
      : false;
  const now = Math.floor(Date.now() / 1000);
  const pastDeadline = bounty ? now > bounty.deadline : false;
  const isOpen = bounty?.status === BountyStatus.Open;

  async function run(fn: () => Promise<string>, doneMsg: string) {
    setFormError(null);
    setStatus(null);
    setTxHash(null);
    setBusy(true);
    try {
      const hash = await fn();
      setTxHash(hash);
      setStatus(doneMsg);
      await load();
    } catch (err) {
      setFormError(humanizeError(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmitClip() {
    if (!wallet.address) return setFormError('Connect your wallet first.');
    if (!wallet.onQie) return setFormError('Switch your wallet to QIE Mainnet (1990).');
    if (!/^https?:\/\/.+/.test(clipUrl.trim())) {
      return setFormError('Paste a valid clip link (https://…).');
    }
    if (!contentHash.trim()) {
      return setFormError('Paste the content hash of your clip file (e.g. its sha256).');
    }
    void run(
      () => submitClipTx(wallet.address as Address, id, clipUrl.trim(), contentHash.trim()),
      'Clip submitted.',
    );
  }

  if (notFound) {
    return (
      <div className="narrow">
        <Empty title="Bounty not found." body="Check the bounty number and try again." />
        <p>
          <a href="#/">← Back to all bounties</a>
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="narrow">
        <div className="notice notice-error">{error}</div>
      </div>
    );
  }
  if (!bounty) {
    return (
      <div className="narrow loading">
        <Spinner /> Loading bounty…
      </div>
    );
  }

  return (
    <div className="narrow">
      <p>
        <a href="#/">← All bounties</a>
      </p>
      <div className="bounty-head">
        <h1>{bounty.title}</h1>
        <StatusBadge status={bounty.status} />
      </div>
      <p className="page-sub">{bounty.description || 'No description.'}</p>

      <Card>
        <dl className="facts">
          <div>
            <dt>Bounty</dt>
            <dd>
              {fmtQusdc(bounty.amount)} QUSDC locked
              <span className="fact-sub">
                winner gets {fmtQusdc(bounty.amount - feeFor(bounty.amount))} · fee{' '}
                {fmtQusdc(feeFor(bounty.amount))}
              </span>
            </dd>
          </div>
          <div>
            <dt>Brand</dt>
            <dd>
              <a href={explorerAddress(bounty.brand)} target="_blank" rel="noreferrer">
                {shortAddr(bounty.brand)}
              </a>
              {isBrand && <span className="you-tag"> — this is you</span>}
            </dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              {fmtDateTime(bounty.deadline)}{' '}
              <span className="fact-sub">({fmtCountdown(bounty.deadline)})</span>
            </dd>
          </div>
          <div>
            <dt>Submissions</dt>
            <dd>{bounty.submissionCount}</dd>
          </div>
          {bounty.status === BountyStatus.Paid && (
            <div>
              <dt>Winner</dt>
              <dd>Submission #{bounty.acceptedSubmissionId.toString()}</dd>
            </div>
          )}
        </dl>

        {isBrand && isOpen && (
          <div className="brand-actions">
            <strong>Brand actions</strong>
            {bounty.submissionCount === 0 && !pastDeadline && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => cancelBountyTx(wallet.address as Address, id),
                    'Bounty cancelled — full refund sent to you.',
                  )
                }
              >
                Cancel bounty (full refund)
              </button>
            )}
            {pastDeadline && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => refundBountyTx(wallet.address as Address, id),
                    'Refund claimed — full amount returned to you.',
                  )
                }
              >
                Claim refund (deadline passed)
              </button>
            )}
            {!pastDeadline && bounty.submissionCount > 0 && (
              <p className="hint">Pick a winning clip below to pay the creator.</p>
            )}
          </div>
        )}
      </Card>

      {formError && <div className="notice notice-error">{formError}</div>}
      {status && <div className="notice notice-ok">{status}</div>}
      {txHash && (
        <div className="notice">
          Transaction:{' '}
          <a href={explorerTx(txHash)} target="_blank" rel="noreferrer">
            {txHash.slice(0, 18)}…
          </a>
        </div>
      )}

      <h2>Clips ({subs === null ? '…' : subs.length})</h2>
      {subs === null && (
        <div className="loading">
          <Spinner /> Loading clips…
        </div>
      )}
      {subs !== null && subs.length === 0 && (
        <Empty title="No clips submitted yet." body="Be the first creator to submit." />
      )}
      <div className="sub-list">
        {subs?.map((s) => {
          const isWinner =
            bounty.status === BountyStatus.Paid && bounty.acceptedSubmissionId === s.id;
          return (
            <Card key={s.id.toString()} className={isWinner ? 'sub-winner' : ''}>
              <div className="sub-top">
                <span>
                  <strong>#{s.id.toString()}</strong> by{' '}
                  <a href={explorerAddress(s.creator)} target="_blank" rel="noreferrer">
                    {shortAddr(s.creator)}
                  </a>
                </span>
                <span className="sub-time">{fmtDateTime(s.createdAt)}</span>
              </div>
              <a
                className="sub-link"
                href={s.clipUrl}
                target="_blank"
                rel="noreferrer"
              >
                ▶ Watch clip
              </a>
              <div className="sub-hash">
                hash: <code>{s.contentHash}</code>
              </div>
              {isWinner && <div className="winner-tag">✓ Accepted — paid {fmtQusdc(bounty.amount - feeFor(bounty.amount))} QUSDC</div>}
              {isBrand && isOpen && !pastDeadline && !isWinner && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => acceptSubmissionTx(wallet.address as Address, id, s.id),
                      `Accepted clip #${s.id.toString()} — creator paid.`,
                    )
                  }
                >
                  Accept & pay creator
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {isOpen && !pastDeadline && (
        <Card>
          <h3>Submit your clip</h3>
          <p className="hint">
            Post the public link to your clip (YouTube, TikTok, …) and the content hash of
            the video file — run <code>sha256sum yourclip.mp4</code> to get it. The hash
            proves the clip you submitted is the clip that gets judged.
          </p>
          <label className="field">
            <span className="field-label">Clip link</span>
            <input
              type="url"
              value={clipUrl}
              placeholder="https://youtube.com/shorts/…"
              onChange={(e) => setClipUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Content hash</span>
            <input
              type="text"
              value={contentHash}
              placeholder="e.g. 9f2c…a41b"
              onChange={(e) => setContentHash(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy || !wallet.address}
            onClick={onSubmitClip}
          >
            {busy ? 'Working…' : wallet.address ? 'Submit clip' : 'Connect wallet to submit'}
          </button>
        </Card>
      )}
      {isOpen && pastDeadline && (
        <div className="notice">
          The deadline has passed — submissions are closed. The brand can now claim a refund
          if no clip was accepted.
        </div>
      )}
    </div>
  );
}
