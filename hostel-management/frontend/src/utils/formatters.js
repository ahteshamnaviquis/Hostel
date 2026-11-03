/**
 * Display formatters for Pakistan: PKR currency and DD/MM/YYYY dates.
 */

const pkrFormatter = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

/** 125000 -> "Rs. 125,000" */
export const formatPKR = (amount) => {
  const n = Number(amount) || 0;
  return `${n < 0 ? '-' : ''}Rs. ${pkrFormatter.format(Math.abs(n))}`;
};

/** 1250000 -> "Rs. 12.5L" (Lakh), 12500000 -> "Rs. 1.25Cr" (Crore) - for compact stats/axes */
export const formatPKRCompact = (amount) => {
  const value = Number(amount) || 0;
  if (Math.abs(value) >= 10000000) return `Rs. ${+(value / 10000000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100000) return `Rs. ${+(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `Rs. ${+(value / 1000).toFixed(1)}K`;
  return `Rs. ${value}`;
};

export const formatNumber = (value) => pkrFormatter.format(Number(value) || 0);

/** "2026-11-03" -> "03/11/2026" (string dates are never shifted by timezone) */
export const formatDate = (value) => {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

/** "2026-11-03 16:05:00" -> "03/11/2026 4:05 PM" */
export const formatDateTime = (value) => {
  if (!value) return '-';
  const str = String(value);
  const time = str.length > 10 ? formatTime(str.slice(11, 16)) : '';
  return `${formatDate(str)}${time ? ` ${time}` : ''}`;
};

/** "16:05:00" -> "4:05 PM" */
export const formatTime = (value) => {
  if (!value) return '-';
  const [h, m] = String(value).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** "2026-11" -> "November 2026" */
export const formatMonth = (ym) => {
  if (!ym) return '-';
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const formatPercent = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`;

/** "partially_paid" -> "Partially Paid" */
export const humanize = (value) => (value ? String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-');

/** "Muhammad Ali Khan" -> "MA" */
export const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

/** Today's date in Pakistan (YYYY-MM-DD). */
export const todayISO = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
export const monthISO = () => todayISO().slice(0, 7);
export const addDaysISO = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const nowTime = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(11, 16);

/** Relative time: "5 min ago", "Yesterday" */
export const timeAgo = (value) => {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T') + (String(value).length <= 19 ? '+05:00' : ''));
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 172800) return 'Yesterday';
  return formatDate(value);
};
