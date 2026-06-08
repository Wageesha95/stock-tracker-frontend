import type { Transaction } from '../types';
import type { ShareSplitData } from '../api';

// All helpers normalize to CURRENT (post-all-splits) basis: a quantity/price as
// of some past date is expressed in today's share units. This keeps share counts
// continuous and money values (shares×price) consistent across a split.
//
// A subdivision 1:10 (fromShares=1, toShares=10) multiplies share count ×10 and
// divides per-share price ÷10; a merge 10:1 does the reverse. Cost (count×price)
// is invariant under the adjustment.
//
// The `splits` passed in must already be scoped to the relevant company.

// Cumulative split ratio for splits strictly AFTER `dateStr`. A transaction or
// price dated on/after a split is treated as already in post-split units (matches
// the backend's `isAfter` rule), so only later splits apply.
export const splitFactorAfter = (dateStr: string, splits: ShareSplitData[]): number => {
  let factor = 1;
  for (const s of splits) {
    if (s.date > dateStr) {
      factor *= s.toShares / s.fromShares;
    }
  }
  return factor;
};

// A transaction's share count in current units. Rounded per-split (matching the
// backend) so cumulative share counts line up with the dashboard's sharesHeld.
export const adjustedCount = (t: Transaction, splits: ShareSplitData[]): number => {
  let adjusted = t.count;
  for (const s of [...splits].sort((a, b) => a.date.localeCompare(b.date))) {
    if (s.date > t.date) {
      adjusted = Math.round((adjusted * s.toShares) / s.fromShares);
    }
  }
  return adjusted;
};

// A transaction's per-share price in current units.
export const adjustedPrice = (t: Transaction, splits: ShareSplitData[]): number =>
  t.price / splitFactorAfter(t.date, splits);

// A historical market price observed on `dateStr`, expressed in current units so a
// shares(current)×price series does not jump at a split.
export const adjustedHistPrice = (price: number, dateStr: string, splits: ShareSplitData[]): number =>
  price / splitFactorAfter(dateStr, splits);
