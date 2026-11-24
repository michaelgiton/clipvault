import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function StatusBadge({ status }: { status: number }) {
  const label = status === 0 ? 'Open' : status === 1 ? 'Paid' : 'Refunded';
  const cls = status === 0 ? 'badge-open' : status === 1 ? 'badge-paid' : 'badge-refunded';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Spinner() {
  return <span className="spinner" aria-label="loading" />;
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
    </div>
  );
}
