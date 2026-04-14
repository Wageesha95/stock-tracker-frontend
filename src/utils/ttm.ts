// Shared TTM (trailing dividend window) math.
// Anchor the window at max(latestXdDate, today) and go back ttmWeeks * 7 days.
// This keeps upcoming-declared dividends inside the window while preventing the
// window from falling behind when the company hasn't paid recently.

export const DEFAULT_TTM_WEEKS = 52;

export interface TtmPayout {
  exDividendDate: string;
  amountPerShare?: number | string | null;
}

export function resolveTtmWeeks(ttmWeeks?: number | null): number {
  return ttmWeeks && ttmWeeks > 0 ? ttmWeeks : DEFAULT_TTM_WEEKS;
}

/**
 * Compute the TTM window bounds (cutoff..anchor) for a set of payouts.
 * Returns null if no payouts have an exDividendDate.
 */
export function ttmWindow(
  payouts: TtmPayout[],
  ttmWeeks?: number | null,
  today: string = new Date().toISOString().split('T')[0]
): { cutoff: string; anchor: string } | null {
  const latestXd = payouts.reduce(
    (m, p) => (p.exDividendDate && p.exDividendDate > m ? p.exDividendDate : m),
    ''
  );
  if (!latestXd) return null;
  const anchor = latestXd > today ? latestXd : today;
  const d = new Date(anchor);
  d.setDate(d.getDate() - resolveTtmWeeks(ttmWeeks) * 7);
  return { cutoff: d.toISOString().split('T')[0], anchor };
}

/**
 * Sum dividend amounts falling inside the TTM window for a single company.
 */
export function ttmDividendTotal(payouts: TtmPayout[], ttmWeeks?: number | null): number {
  const w = ttmWindow(payouts, ttmWeeks);
  if (!w) return 0;
  return payouts
    .filter(p => p.exDividendDate >= w.cutoff && p.exDividendDate <= w.anchor)
    .reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
}

/**
 * Group payouts (or anything with a companyCode) by company code.
 */
export function groupByCompanyCode<T extends { companyCode: string }>(items: T[]): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) {
    (out[item.companyCode] = out[item.companyCode] || []).push(item);
  }
  return out;
}

/**
 * Compute a per-company TTM yield map:
 *   yield[code] = ttmDividendTotal(company's payouts, ttmWeeksByCode[code]) / price[code] * 100
 * Only entries with total > 0 and price > 0 are included.
 */
export function computeTtmYieldMap(
  ttmWeeksByCode: Record<string, number | undefined> | undefined,
  payouts: (TtmPayout & { companyCode: string })[],
  priceByCode: Record<string, number | undefined>
): Record<string, number> {
  const byCode = groupByCompanyCode(payouts);
  const yields: Record<string, number> = {};
  for (const [code, divs] of Object.entries(byCode)) {
    const total = ttmDividendTotal(divs, ttmWeeksByCode?.[code]);
    const price = priceByCode[code];
    if (total > 0 && price && price > 0) {
      yields[code] = (total / price) * 100;
    }
  }
  return yields;
}
