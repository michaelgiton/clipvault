import { useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import { useWallet } from '../App';
import { fmtCountdown, fmtDateTime, fmtQusdc, shortAddr } from '../lib/format';
import { BountyStatus, listBounties, type Bounty } from '../lib/vault';
import { Card, Empty, Spinner, StatusBadge } from '../components/ui';

type Filter = 'all' | 'open' | 'paid' | 'refunded' | 'mine';

export function HomeView() {
  const wallet = useWallet();
  const [bounties, setBounties] = useState<Bounty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let cancelled = false;
    listBounties()
      .then((rows) => {
        if (!cancelled) setBounties(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!bounties) return [];
    switch (filter) {
      case 'open':
        return bounties.filter((b) => b.status === BountyStatus.Open);
      case 'paid':
        return bounties.filter((b) => b.status === BountyStatus.Paid);
      case 'refunded':
        return bounties.filter((b) => b.status === BountyStatus.Refunded);
      case 'mine':
        return bounties.filter(
          (b) => wallet.address && b.brand.toLowerCase() === wallet.address.toLowerCase(),
        );
      default:
        return bounties;
    }
  }, [bounties, filter, wallet.address]);

  const openCount = bounties?.filter((b) => b.status === BountyStatus.Open).length ?? 0;
  const lockedTotal =
    bounties
      ?.filter((b) => b.status === BountyStatus.Open)
      .reduce((sum, b) => sum + b.amount, 0n) ?? 0n;

  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'paid', label: 'Paid' },
    { key: 'refunded', label: 'Refunded' },
    { key: 'mine', label: 'My bounties' },
  ];

  return (
    <div>
      <section className="hero">
        <h1>Clip bounties, paid in escrow.</h1>
        <p className="hero-sub">
          Brands lock QUSDC in a smart-contract vault. Creators submit clips. When the
          brand accepts a clip, the locked funds release to the creator — minus a 2%
          platform fee. No accepted clip by the deadline? The brand gets a full refund.
        </p>
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-num">{bounties === null ? '…' : openCount}</span>
            <span className="stat-label">open bounties</span>
          </div>
          <div className="stat">
            <span className="stat-num">{bounties === null ? '…' : `${fmtQusdc(lockedTotal)} QUSDC`}</span>
            <span className="stat-label">locked in escrow</span>
          </div>
          <div className="stat">
            <span className="stat-num">2%</span>
            <span className="stat-label">platform fee, only on payout</span>
          </div>
        </div>
        <div className="hero-actions">
          <a className="btn btn-primary" href="#/create">
            Post a bounty
          </a>
          <a className="btn btn-ghost" href="#how">
            How it works
          </a>
        </div>
      </section>

      <section id="how" className="how">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <strong>1. Lock</strong>
            <span>The brand posts a bounty and locks QUSDC in the vault. The money is visibly there before anyone starts work.</span>
          </li>
          <li>
            <strong>2. Submit</strong>
            <span>Creators post their clip link and a content hash. Any number of clips can be submitted per bounty.</span>
          </li>
          <li>
            <strong>3. Accept</strong>
            <span>The brand picks a winner before the deadline. The vault pays the creator 98% and keeps a 2% fee.</span>
          </li>
          <li>
            <strong>4. Refund</strong>
            <span>No winner by the deadline? The brand reclaims the full locked amount. No submissions at all? The brand can cancel early.</span>
          </li>
        </ol>
      </section>

      <section className="bounty-list">
        <div className="list-head">
          <h2>Bounties</h2>
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={filter === t.key}
                className={filter === t.key ? 'tab active' : 'tab'}
                onClick={() => setFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="notice notice-error">{error}</div>}
        {bounties === null && !error && (
          <div className="loading">
            <Spinner /> Loading bounties…
          </div>
        )}
        {bounties !== null && filtered.length === 0 && (
          <Empty
            title={filter === 'mine' ? 'No bounties from your wallet yet.' : 'No bounties here yet.'}
            body={
              filter === 'all'
                ? 'Be the first brand to lock a bounty in the vault.'
                : undefined
            }
          />
        )}
        <div className="bounty-grid">
          {filtered.map((b) => (
            <a key={b.id.toString()} href={`#/bounty/${b.id}`} className="bounty-card-link">
              <Card className="bounty-card">
                <div className="bounty-card-top">
                  <StatusBadge status={b.status} />
                  <span className="bounty-amount">{fmtQusdc(b.amount)} QUSDC</span>
                </div>
                <h3 className="bounty-title">{b.title}</h3>
                <p className="bounty-desc">{b.description}</p>
                <div className="bounty-meta">
                  <span>by {shortAddr(b.brand)}</span>
                  <span>
                    {b.status === BountyStatus.Open
                      ? `ends ${fmtCountdown(b.deadline)} · ${fmtDateTime(b.deadline)}`
                      : `ended ${fmtDateTime(b.deadline)}`}
                  </span>
                  <span>
                    {b.submissionCount} clip{b.submissionCount === 1 ? '' : 's'}
                  </span>
                </div>
              </Card>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
