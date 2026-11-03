/**
 * Display formatters for Pakistan: PKR currency and DD/MM/YYYY dates.
 */

const pkrFormatter = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

/** 125000 -> "Rs. 125,000" */
export const formatPKR = (amount) => `Rs. ${pkrFormatter.format(Number(amount) || 0)}`;

/** 1250000 -> "Rs. 12.5L" (Lakh), 12500000 -> "Rs. 1.25Cr" (Crore) - for compact stats/axes */
export const formatPKRCompact = (amount) => {
  const value = Number(amount) || 0;
  if (Math.abs(value) >= 10000000) return `Rs. ${+(value / 10000000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100000) return `Rs. ${+(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `Rs. ${+(value / 1000).toFixed(1)}K`;
  return `Rs. ${value}`;
};

export const formatNumber = (value) => pkrFormatter.format(Number(value) || 0);

/** "2026-11-03" or Date -> "03/11/2026" */
export const formatDate = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
};

export const formatPercent = (value, digits = 1) => `${(Number(value) || 0).toFixed(digits)}%`;

/** "Muhammad Ali Khan" -> "MA" */
export const getInitials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
