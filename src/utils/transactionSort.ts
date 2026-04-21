import type { Transaction } from '../types';

// Sort transactions chronologically, with same-date BUYs before SELLs.
// Required for any running-cost-basis / FIFO loop — processing a SELL before
// a same-date BUY drives sharesHeld negative and corrupts the avg price.
export const compareTxDateBuysFirst = (a: Transaction, b: Transaction): number =>
  a.date.localeCompare(b.date) || (a.type === 'SELL' ? 1 : 0) - (b.type === 'SELL' ? 1 : 0);

// Tiebreaker for table sorts: when the user sorts a transactions table by
// date and two rows share the same date, show BUYs above SELLs.
export const txDateTieBreaker = <T extends { type: string }>(
  a: T,
  b: T,
  sortKey: string,
): number => {
  if (sortKey !== 'date') return 0;
  return (a.type === 'SELL' ? 1 : 0) - (b.type === 'SELL' ? 1 : 0);
};

// Same ordering rule, applied to mixed event streams (tx | div | realized)
// where only the 'tx' events affect cost basis.
export const compareEventDateBuysFirst = <T extends { date: string; type: string; data: { type?: string } }>(
  a: T,
  b: T,
): number => {
  const dc = a.date.localeCompare(b.date);
  if (dc !== 0) return dc;
  if (a.type === 'tx' && b.type === 'tx') {
    return (a.data.type === 'SELL' ? 1 : 0) - (b.data.type === 'SELL' ? 1 : 0);
  }
  return 0;
};
