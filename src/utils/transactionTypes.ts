import type { Transaction } from '../types';

type TxType = Transaction['type'];

// Mirrors TransactionType.isAcquisition()/isDisposal() on the backend. Every
// running-cost-basis loop must classify every type, so keep the two in step:
// adding a type here without adding it on the backend silently diverges the
// numbers the dashboard shows from the ones the API computes.

// Types that add shares to a holding and add their cost to its basis.
export const isAcquisition = (type: TxType): boolean =>
  type === 'BUY' || type === 'RIGHTS' || type === 'SCRIP_DIVIDEND' || type === 'IPO' || type === 'TRANSFER_IN';

// Types that remove shares from a holding. Only SELL realizes a gain —
// TRANSFER_OUT just moves the shares to another broker.
export const isDisposal = (type: TxType): boolean =>
  type === 'SELL' || type === 'TRANSFER_OUT';

// Signed share delta a transaction applies to a holding.
export const shareDelta = (tx: { type: TxType; count: number }, count = tx.count): number =>
  isDisposal(tx.type) ? -count : count;

// Short label for the type pill; the full enum names are too wide for a table cell.
export const txTypeLabel = (type: TxType): string => {
  if (type === 'SCRIP_DIVIDEND') return 'SCRIP';
  if (type === 'TRANSFER_IN') return 'TR IN';
  if (type === 'TRANSFER_OUT') return 'TR OUT';
  return type;
};

export const txTypePillClass = (type: TxType): string => {
  switch (type) {
    case 'BUY': return 'gain-pill-buy';
    case 'SELL': return 'gain-pill-sell';
    case 'RIGHTS': return 'gain-pill-rights';
    case 'IPO': return 'gain-pill-ipo';
    case 'TRANSFER_IN': return 'gain-pill-transfer-in';
    case 'TRANSFER_OUT': return 'gain-pill-transfer-out';
    default: return 'gain-pill-scrip-div';
  }
};
