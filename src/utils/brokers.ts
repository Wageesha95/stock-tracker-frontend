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

// The broker to preselect in an entry form: the user's only broker (from their
// selected brokers if set, else system-wide). Empty string when it's ambiguous.
export const defaultBrokerId = (brokers: { id: string }[], selectedBrokerIds: string[]): string => {
  const available = selectedBrokerIds.length > 0
    ? brokers.filter(b => selectedBrokerIds.includes(b.id))
    : brokers;
  return available.length === 1 ? available[0].id : '';
};

// Filter records that carry a brokerId (dividends, rights, ipos) by the selected
// broker data filter. Empty selection = all. NO_BROKER includes broker-less records.
export const filterByBroker = <T extends { brokerId?: string | null }>(items: T[], brokerIds: string[]): T[] => {
  if (!brokerIds || brokerIds.length === 0) return items;
  const includeNone = brokerIds.includes(NO_BROKER);
  return items.filter(i => (i.brokerId != null && brokerIds.includes(i.brokerId)) || (i.brokerId == null && includeNone));
};
