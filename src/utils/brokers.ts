import type { Transaction } from '../types';

// Token representing "no broker" (manually-entered transactions) in a broker filter.
export const NO_BROKER = '__none__';

// Keep only transactions matching the selected broker filter. Empty selection = all.
// NO_BROKER includes manually-entered (no-broker) transactions.
export const filterTxByBroker = (txns: Transaction[], brokerIds: string[]): Transaction[] => {
  if (!brokerIds || brokerIds.length === 0) return txns;
  const includeNone = brokerIds.includes(NO_BROKER);
  return txns.filter(t => (t.brokerId != null && brokerIds.includes(t.brokerId)) || (t.brokerId == null && includeNone));
};
