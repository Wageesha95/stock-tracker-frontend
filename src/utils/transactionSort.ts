import type { Transaction } from '../types';
import { isDisposal } from './transactionTypes';

// Sort transactions chronologically, with same-date inflows before outflows.
// Required for any running-cost-basis / FIFO loop — processing a SELL before
// a same-date BUY drives sharesHeld negative and corrupts the avg price.
// TRANSFER_OUT is an outflow for the same reason: the shares it moves out may
// have been acquired, or transferred in, earlier the same day.
export const compareTxDateBuysFirst = (a: Transaction, b: Transaction): number =>
  a.date.localeCompare(b.date) || Number(isDisposal(a.type)) - Number(isDisposal(b.type));

// Tiebreaker for table sorts: when the user sorts a transactions table by
// date and two rows share the same date, show inflows above outflows.
export const txDateTieBreaker = <T extends { type: Transaction['type'] }>(
  a: T,
  b: T,
  sortKey: string,
): number => {
  if (sortKey !== 'date') return 0;
  return Number(isDisposal(a.type)) - Number(isDisposal(b.type));
};

// Same ordering rule, applied to mixed event streams (tx | div | realized)
// where only the 'tx' events affect cost basis.
export const compareEventDateBuysFirst = <T extends { date: string; type: string; data: { type?: Transaction['type'] } }>(
  a: T,
  b: T,
): number => {
  const dc = a.date.localeCompare(b.date);
  if (dc !== 0) return dc;
  if (a.type === 'tx' && b.type === 'tx') {
    return Number(!!a.data.type && isDisposal(a.data.type)) - Number(!!b.data.type && isDisposal(b.data.type));
  }
  return 0;
};
