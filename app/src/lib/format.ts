import { formatUnits, parseUnits } from 'viem';

export const QUSDC_DECIMALS = 6;

/** Format a QUSDC amount (6 decimals) with thousands separators, trimmed. */
export function fmtQusdc(amount: bigint): string {
  const raw = formatUnits(amount, QUSDC_DECIMALS);
  const [whole, frac] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!frac) return grouped;
  const trimmed = frac.replace(/0+$/, '');
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/** Format a QIE (native, 18 decimals) balance compactly. */
export function fmtQie(amount: bigint): string {
  const raw = formatUnits(amount, 18);
  const n = Number(raw);
  if (n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Parse user input into QUSDC base units. Returns null for invalid input. */
export function parseQusdc(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  try {
    return parseUnits(s, QUSDC_DECIMALS);
  } catch {
    return null;
  }
}

export function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function fmtDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human countdown: "in 3h 12m", "in 2d", or "expired". */
export function fmtCountdown(expiryUnix: number): string {
  const diff = expiryUnix - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'expired';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}
