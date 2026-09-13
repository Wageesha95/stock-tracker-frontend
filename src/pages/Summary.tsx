import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardAll, getDividends, getUserSettings, getTransactions, getCompanies, getAvailableDates, getMarketDataByDate } from '../api';
import { PortfolioItem, RealizedGainItem, Dividend, Company, Transaction } from '../types';
import { filterByBroker, filterTxByBroker } from '../utils/brokers';
import { useTableSort } from '../hooks/useTableSort';
import CompanyAvatar from '../components/CompanyAvatar';
import MarketDatePicker from '../components/MarketDatePicker';
import { compareTxDateBuysFirst } from '../utils/transactionSort';
import { SELL_COMMISSION_PCT } from '../constants';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const SELL_PCT = Number(SELL_COMMISSION_PCT) || 0;

// Definitions for the expanded-row cells, shown behind the info icon next to the
// By Company heading. The cells carry short labels; this explains how each is derived.
const CELL_LEGEND = [
  'Unrealized — market value − cost, before any cost of selling',
  `Net of Comm. — the same, after the ~${SELL_PCT}% commission to sell`,
  'Unreal. % — Net of Comm. ÷ open invested',
  'Booked % — (Realized + Dividends) ÷ total purchase cost. Non-zero even when Realized is 0, because dividends count as booked.',
  'Realized — booked gains/losses from sells & lapsed rights',
  'Dividends — cumulative cash dividends received (net)',
];
const COLORS = [
  '#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5',
  '#dd6b20', '#319795', '#d53f8c', '#5a67d8', '#2c7a7b',
  '#b83280', '#c05621', '#2f855a', '#6b46c1', '#2b6cb0',
];

export default function Summary() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Current view (mutated when a historical date is picked)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [realized, setRealized] = useState<RealizedGainItem[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);

  // Originals / raw data for historical recompute
  const [origRealized, setOrigRealized] = useState<RealizedGainItem[]>([]);
  const [origDividends, setOrigDividends] = useState<Dividend[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [latestDate, setLatestDate] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [sectors, setSectors] = useState<{ sector: string; currentValue: number; totalInvested: number }[]>([]);
  // Per-company accrued opportunity cost, already computed by the dashboard endpoint
  // at the user's configured rate — no need to recompute it here.
  const [interestByCompany, setInterestByCompany] = useState<Record<string, number>>({});
  const [pieMetric, setPieMetric] = useState<'value' | 'invested'>('value');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 640);
  // Matches the `hide-sm` breakpoint in App.css, so the expandable row detail appears
  // exactly when the columns it restates are the ones being hidden.
  const [isCompact, setIsCompact] = useState(typeof window !== 'undefined' && window.innerWidth <= 700);
  // Which company row is expanded on a compact screen. Only one at a time.
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const historicalMode = !!selectedDate;

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < 640);
      setIsCompact(window.innerWidth <= 700);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Growing back to a wide screen re-shows the columns, so a stale expansion would
  // just duplicate them.
  useEffect(() => {
    if (!isCompact) setExpandedCode(null);
  }, [isCompact]);

  const loadData = useCallback(() => {
    return getUserSettings().then(settings => {
      const brokers = settings.selectedDataBrokerIds || [];
      return Promise.all([
        getDashboardAll(brokers), getDividends(), getTransactions(), getCompanies(), getAvailableDates(),
      ]).then(([dash, divs, txns, comps, dates]) => {
        const fd = filterByBroker(divs, brokers);
        setPortfolio(dash.portfolio || []);
        setRealized(dash.realizedItems || []);
        setDividends(fd);
        setOrigRealized(dash.realizedItems || []);
        setOrigDividends(fd);
        setTransactions(filterTxByBroker(txns.filter(t => !t.disabled), brokers));
        setCompanies(comps);
        setSectors((dash.sectors || []).map(s => ({ sector: s.sector, currentValue: s.currentValue, totalInvested: s.totalInvested })));
        const interest: Record<string, number> = {};
        (dash.interestBreakdown || []).forEach(b => { interest[b.companyCode] = (interest[b.companyCode] || 0) + b.interest; });
        setInterestByCompany(interest);
        setAvailableDates(dates);
        setLatestDate(dates.reduce((a, b) => (a > b ? a : b), ''));
      });
    });
  }, []);

  useEffect(() => { loadData().catch(console.error).finally(() => setLoading(false)); }, [loadData]);

  // Recompute the whole summary as of a past market day: holdings from transactions up to that
  // date valued at that day's prices, realized/dividends cumulative to that date. Mirrors the
  // Dashboard's historical mode.
  const loadHistorical = useCallback(async (finalDate: string) => {
    const md = await getMarketDataByDate(finalDate);
    const priceMap: Record<string, number> = {};
    md.forEach(m => { priceMap[m.companyCode] = m.lastTrade; });

    const grouped: Record<string, Transaction[]> = {};
    transactions.filter(t => t.date <= finalDate).forEach(t => {
      (grouped[t.companyCode] = grouped[t.companyCode] || []).push(t);
    });

    const hist: PortfolioItem[] = [];
    for (const [code, txns] of Object.entries(grouped)) {
      const sorted = [...txns].sort(compareTxDateBuysFirst);
      let shares = 0, cost = 0;
      for (const t of sorted) {
        if (t.type === 'SELL') {
          const avg = shares > 0 ? cost / shares : 0;
          cost -= avg * t.count;
          shares -= t.count;
        } else if (t.type === 'TRANSFER_OUT') {
          // Not a disposal: removes exactly the cost its own price represents.
          cost -= t.count * t.price;
          shares -= t.count;
        } else {
          cost += t.count * t.price + t.commission;
          shares += t.count;
        }
      }
      if (shares <= 0) continue;
      const avgBuy = shares > 0 ? cost / shares : 0;
      const price = priceMap[code] || 0;
      const currentValue = shares * price;
      const totalInv = shares * avgBuy;
      const comp = companies.find(c => c.code === code);
      const mdItem = md.find(m => m.companyCode === code);
      hist.push({
        companyCode: code,
        companyName: comp?.name || mdItem?.companyName || code,
        sharesHeld: shares,
        avgBuyPrice: avgBuy,
        lastTrade: price,
        change: mdItem?.change || 0,
        changePercent: mdItem?.changePercent || 0,
        currentValue,
        totalInvested: totalInv,
        unrealizedGain: currentValue - totalInv,
        unrealizedGainPercent: totalInv !== 0 ? ((currentValue - totalInv) / totalInv) * 100 : 0,
        unrealizedDayGain: 0,
        realizedGain: 0,
      });
    }

    setPortfolio(hist);
    setRealized(origRealized.filter(r => r.sellDate <= finalDate));
    setDividends(origDividends.filter(d => d.date <= finalDate));
  }, [transactions, companies, origRealized, origDividends]);

  const onSelectDate = async (finalDate: string) => {
    if (!finalDate || finalDate === latestDate) {
      setSelectedDate('');
      setRefreshing(true);
      loadData().catch(console.error).finally(() => setRefreshing(false));
      return;
    }
    setSelectedDate(finalDate);
    setRefreshing(true);
    await loadHistorical(finalDate).catch(console.error).finally(() => setRefreshing(false));
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cls = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const sign = (n: number) => (n >= 0 ? '+' : '');

  // Per-company cumulative breakdown (union of held / sold / dividend-paying companies).
  const byCompany = new Map<string, { code: string; name: string; unrealized: number; realized: number; dividends: number; invested: number; value: number; shares: number }>();
  const ensure = (code: string, name?: string) => {
    let e = byCompany.get(code);
    if (!e) { e = { code, name: name || code, unrealized: 0, realized: 0, dividends: 0, invested: 0, value: 0, shares: 0 }; byCompany.set(code, e); }
    else if (name && e.name === code) e.name = name;
    return e;
  };
  portfolio.forEach(p => { const e = ensure(p.companyCode, p.companyName); e.unrealized += p.unrealizedGain; e.invested += p.totalInvested; e.value += p.currentValue; e.shares += p.sharesHeld; });
  realized.forEach(r => { ensure(r.companyCode, r.companyName).realized += r.realizedGain; });
  dividends.filter(d => d.type === 'CASH').forEach(d => { ensure(d.companyCode).dividends += d.totalAmount; });
  // Total purchase cost = every buy-type transaction's cost (up to the selected date). This is
  // the return-% base: (unrealized + realized + dividends) / total purchase cost × 100.
  const purchaseByCompany = new Map<string, number>();
  // Everything that ever came in, before transfers took any of it away. Used only to
  // judge whether what is left is a real cost base or just rounding residue.
  const grossInflowByCompany = new Map<string, number>();
  transactions.forEach(t => {
    if (selectedDate && t.date > selectedDate) return;
    if (t.type === 'SELL') return;
    // The two transfer legs are symmetric — TRANSFER_IN adds the cost the shares
    // carry across, TRANSFER_OUT removes the same amount — so a transfer leaves the
    // total untouched, while each broker's own purchase cost still comes out right
    // when a broker filter is applied.
    if (t.type === 'TRANSFER_OUT') {
      purchaseByCompany.set(t.companyCode, (purchaseByCompany.get(t.companyCode) || 0) - t.count * t.price);
      return;
    }
    const inflow = t.count * t.price + (t.commission || 0);
    purchaseByCompany.set(t.companyCode, (purchaseByCompany.get(t.companyCode) || 0) + inflow);
    grossInflowByCompany.set(t.companyCode, (grossInflowByCompany.get(t.companyCode) || 0) + inflow);
  });
  const totalPurchaseCost = [...purchaseByCompany.values()].reduce((s, v) => s + v, 0);
  // Total brokerage actually paid on all recorded transactions (buys + sells), up to the date.
  const totalCommission = transactions.reduce((s, t) => (selectedDate && t.date > selectedDate ? s : s + (t.commission || 0)), 0);
  const companyRows = [...byCompany.values()].map(c => {
    const net = c.unrealized + c.realized + c.dividends;
    const capitalGain = c.unrealized + c.realized;
    const purchaseCost = purchaseByCompany.get(c.code) || 0;
    // A transfer removes count × the average price, rounded to 4dp by the server, so
    // it never cancels the original cost to the last cent. Transfer a holding out in
    // full and what is left is residue like 0.004 — positive enough to pass a "> 0"
    // test, small enough to turn any percentage taken against it into nonsense. Treat
    // anything under a thousandth of what ever came in as no base at all.
    const grossInflow = grossInflowByCompany.get(c.code) || 0;
    const hasBasis = purchaseCost > Math.max(0.01, grossInflow * 0.001);
    // Unrealized gain minus the commission to sell the current holding at market value.
    const unrealizedNet = c.unrealized - (c.value * SELL_PCT) / 100;
    return {
      ...c,
      net,
      purchaseCost,
      hasBasis,
      unrealizedNet,
      // That net unrealized gain as a % of what's invested in the open holding.
      unrealizedNetPct: c.invested > 0 ? (unrealizedNet / c.invested) * 100 : 0,
      // Realized return excludes unrealized (booked gains only): (realized + dividends) / cost.
      bookedPct: hasBasis ? ((c.realized + c.dividends) / purchaseCost) * 100 : 0,
      netPct: hasBasis ? (net / purchaseCost) * 100 : 0,
      // Price-driven gain (unrealized + realized) split out from dividend income, so
      // the two sources of return can be read separately. The two percentages are
      // taken on the same base as Return %, so they add up to it.
      // Net P/L with the cost of selling the open holding taken off, i.e. what the
      // position would actually be worth if closed today. Shown in place of Net P/L
      // on a phone, where only one of the two fits.
      netAfterComm: unrealizedNet + c.realized + c.dividends,
      // What the money tied up in this holding could have earned elsewhere. A cost,
      // so it is shown negative against the gains above it.
      opportunityCost: interestByCompany[c.code] || 0,
      opportunityCostPct: hasBasis ? ((interestByCompany[c.code] || 0) / purchaseCost) * 100 : 0,
      capitalGain,
      capitalGainPct: hasBasis ? (capitalGain / purchaseCost) * 100 : 0,
      dividendPct: hasBasis ? (c.dividends / purchaseCost) * 100 : 0,
    };
  });
  const compSort = useTableSort(companyRows, 'net');

  if (loading) return <p>Loading...</p>;

  const totalInvested = portfolio.reduce((s, p) => s + p.totalInvested, 0);
  const currentValue = portfolio.reduce((s, p) => s + p.currentValue, 0);
  const unrealized = portfolio.reduce((s, p) => s + p.unrealizedGain, 0);
  const realizedTotal = realized.reduce((s, r) => s + r.realizedGain, 0);
  const dividendsTotal = dividends.filter(d => d.type === 'CASH').reduce((s, d) => s + d.totalAmount, 0);
  const netCumulative = unrealized + realizedTotal + dividendsTotal;
  const opportunityCostTotal = Object.values(interestByCompany).reduce((s, v) => s + v, 0);
  const unrealizedPct = totalInvested > 0 ? (unrealized / totalInvested) * 100 : 0;
  const netPct = totalPurchaseCost > 0 ? (netCumulative / totalPurchaseCost) * 100 : 0;
  const realizedReturnPct = totalPurchaseCost > 0 ? ((realizedTotal + dividendsTotal) / totalPurchaseCost) * 100 : 0;
  const unrealizedNetTotal = unrealized - (currentValue * SELL_PCT) / 100;
  // Same total as netCumulative, with the cost of selling every open holding taken off.
  const netCumulativeAfterComm = unrealizedNetTotal + realizedTotal + dividendsTotal;
  const unrealizedReturnPct = totalInvested > 0 ? (unrealizedNetTotal / totalInvested) * 100 : 0;

  // Stable colour per sector (by a fixed order) so toggling Value/Invested doesn't reshuffle colours.
  const sectorColor = new Map<string, string>();
  [...sectors].sort((a, b) => a.sector.localeCompare(b.sector)).forEach((s, i) => sectorColor.set(s.sector, COLORS[i % COLORS.length]));
  const pieData = sectors
    .map(s => ({ name: s.sector, value: pieMetric === 'value' ? s.currentValue : s.totalInvested }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const rows: { label: string; value: number; note?: string }[] = [
    { label: 'Unrealized gain / loss', value: unrealized, note: 'Open positions (current value − invested)' },
    { label: 'Realized gain / loss', value: realizedTotal, note: 'Cumulative, from sells & lapsed rights' },
    { label: 'Dividends received', value: dividendsTotal, note: 'Cumulative cash dividends (net)' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Summary</h1>
        <MarketDatePicker availableDates={availableDates} selectedDate={selectedDate} onSelect={onSelectDate} align="left" />
        {refreshing && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading…</span>}
        {historicalMode && (
          <span style={{ fontSize: '0.75rem', color: '#3182ce', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            As of {selectedDate}
            <button
              onClick={() => onSelectDate('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3182ce', fontSize: '0.85rem', padding: '0 0.2rem' }}
              title="Back to today"
            >&times;</button>
          </span>
        )}
      </div>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
        Your cumulative performance — realized, unrealized and dividends combined{historicalMode ? `, as of ${selectedDate}` : ''}.
      </p>

      <div className="stats-grid">
        <div className="stat-card" title="Cost basis of your current open holdings"><h3>Invested (open)</h3><p className="stat-value">{fmt(totalInvested)}</p></div>
        <div className="stat-card" title="Market value of current holdings"><h3>Current Value</h3><p className="stat-value">{fmt(currentValue)}</p></div>
        {/* Space is tight on a phone, so only the after-commission figure is shown
            there — it is the one that reflects what selling would actually leave. */}
        {!isMobile && (
          <div className="stat-card" title="Unrealized gain/loss on open positions (current value − invested), before any cost of selling, and % of open invested">
            <h3>Pure Unrealized</h3>
            <p className={`stat-value ${cls(unrealized)}`}>{sign(unrealized)}{fmt(unrealized)}</p>
            <small className={cls(unrealized)}>{sign(unrealizedPct)}{unrealizedPct.toFixed(2)}%</small>
          </div>
        )}
        <div className="stat-card" title={`Unrealized gain/loss after deducting the ~${SELL_PCT}% commission it would cost to sell the current holding — what you would actually keep`}>
          {/* "Unrealized − Sell Comm." is too wide for a phone-sized card, and on
              mobile this is the only unrealized figure shown, so it gets the shorter
              name there. */}
          <h3>{isMobile ? 'Final Return' : <>Unrealized &minus; Sell Comm.</>}</h3>
          <p className={`stat-value ${cls(unrealizedNetTotal)}`}>{sign(unrealizedNetTotal)}{fmt(unrealizedNetTotal)}</p>
          <small className={cls(unrealizedNetTotal)}>{sign(unrealizedReturnPct)}{unrealizedReturnPct.toFixed(2)}%</small>
        </div>
        <div className="stat-card" title="Booked gains/losses from sells & lapsed rights (cumulative)"><h3>Realized</h3><p className={`stat-value ${cls(realizedTotal)}`}>{sign(realizedTotal)}{fmt(realizedTotal)}</p></div>
        <div className="stat-card" title="Cumulative cash dividends received (net of tax)"><h3>Dividends</h3><p className={`stat-value ${cls(dividendsTotal)}`}>{sign(dividendsTotal)}{fmt(dividendsTotal)}</p></div>
        <div className="stat-card" title="Interest the money tied up in your holdings could have earned instead, at the rate set in Settings. A cost, not a gain — it is not included in Net Cumulative P/L.">
          <h3>Opportunity Cost</h3>
          <p className={`stat-value ${opportunityCostTotal > 0 ? 'gain-negative' : ''}`}>
            {opportunityCostTotal > 0 ? `-${fmt(opportunityCostTotal)}` : fmt(0)}
          </p>
        </div>
        <div className="stat-card" title="Unrealized + Realized + Dividends, and that total ÷ total purchase cost">
          <h3>Net Cumulative P/L</h3>
          <p className={`stat-value ${cls(netCumulative)}`}>{sign(netCumulative)}{fmt(netCumulative)}</p>
          <small className={cls(netCumulative)}>{sign(netPct)}{netPct.toFixed(2)}%</small>
        </div>
        <div className="stat-card" title="Total brokerage/commission actually paid on all recorded transactions (buys + sells)">
          <h3>Total Commission</h3>
          <p className="stat-value gain-negative">{fmt(totalCommission)}</p>
        </div>
      </div>

      {pieData.length > 0 && (
        <div className="form-card" style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h2 style={{ margin: 0 }}>By Sector</h2>
            <div className="segmented-control">
              <button className={pieMetric === 'value' ? 'active' : ''} onClick={() => setPieMetric('value')}>Value</button>
              <button className={pieMetric === 'invested' ? 'active' : ''} onClick={() => setPieMetric('invested')}>Invested</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 400 : 340}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy={isMobile ? '42%' : '50%'} outerRadius={isMobile ? 95 : 115} innerRadius={isMobile ? 45 : 55} dataKey="value" label={false}>
                {pieData.map((d, i) => <Cell key={d.name} fill={sectorColor.get(d.name) || COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => {
                const pct = pieTotal > 0 ? ((v / pieTotal) * 100).toFixed(2) : '0.00';
                return `LKR ${fmt(v)} (${pct}%)`;
              }} />
              <Legend
                layout={isMobile ? 'horizontal' : 'vertical'}
                align={isMobile ? 'center' : 'right'}
                verticalAlign={isMobile ? 'bottom' : 'middle'}
                wrapperStyle={{ fontSize: '0.75rem', lineHeight: '1.6' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="portfolio-table-wrap" style={{ marginTop: '2rem' }}>
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Component</th>
              <th className="text-right">Amount (LKR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  {r.note && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.note}</div>}
                </td>
                <td className={`text-right mono ${cls(r.value)}`}>{sign(r.value)}{fmt(r.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="portfolio-total">
              <td>Net Cumulative Gain / Loss</td>
              <td className={`text-right mono ${cls(netCumulative)}`}>{sign(netCumulative)}{fmt(netCumulative)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '2rem 0 1rem' }}>
        <h2 style={{ margin: 0 }}>By Company ({companyRows.length})</h2>
        {isCompact && (
          <button
            type="button"
            className="summary-legend-toggle"
            aria-expanded={legendOpen}
            title="What the values in an expanded row mean"
            onClick={() => setLegendOpen(o => !o)}
          >
            &#9432;
          </button>
        )}
      </div>
      {isCompact && legendOpen && (
        <div className="summary-legend">
          <p style={{ margin: '0 0 0.4rem', fontWeight: 600 }}>Tap a row to expand. The values read:</p>
          <ol className="summary-legend-list">
            {CELL_LEGEND.map(item => <li key={item}>{item}</li>)}
          </ol>
        </div>
      )}
      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="sort-header" title="Company — click a row to open its page" onClick={() => compSort.handleSort('code')}>Company{compSort.sortIcon('code')}</th>
              <th className="sort-header text-right hide-sm" title="Shares currently held" onClick={() => compSort.handleSort('shares')}>Shares{compSort.sortIcon('shares')}</th>
              <th className="sort-header text-right hide-sm" title="Unrealized gain/loss on current holdings (market value − cost), before any cost of selling" onClick={() => compSort.handleSort('unrealized')}>Pure Unrealized{compSort.sortIcon('unrealized')}</th>
              <th className="sort-header text-right hide-sm" title={`Unrealized gain after deducting the ~${SELL_PCT}% commission to sell the current holding`} onClick={() => compSort.handleSort('unrealizedNet')}>Unrealized − Sell&nbsp;Comm.{compSort.sortIcon('unrealizedNet')}</th>
              <th className="sort-header text-right hide-sm" title="Realized gain/loss from sells and lapsed rights" onClick={() => compSort.handleSort('realized')}>Realized{compSort.sortIcon('realized')}</th>
              <th className="sort-header text-right hide-sm" title="Cash dividends received (net)" onClick={() => compSort.handleSort('dividends')}>Dividends{compSort.sortIcon('dividends')}</th>
              <th className="sort-header text-right hide-sm" title="Capital gain = Pure Unrealized + Realized (price-driven, excludes dividends)" onClick={() => compSort.handleSort('capitalGain')}>Capital Gain{compSort.sortIcon('capitalGain')}</th>
              <th
                className="sort-header text-right"
                title={isCompact
                  ? `P/L after deducting the ~${SELL_PCT}% commission to sell the open holding = (Unrealized − sell comm.) + Realized + Dividends`
                  : 'Net P/L = Unrealized + Realized + Dividends'}
                onClick={() => compSort.handleSort(isCompact ? 'netAfterComm' : 'net')}
              >
                {isCompact ? <>P/L &minus; Comm.</> : 'Net P/L'}
                {compSort.sortIcon(isCompact ? 'netAfterComm' : 'net')}
              </th>
              <th className="sort-header text-right hide-sm" title="Unrealized return = unrealized gain after sell commission ÷ open invested × 100" onClick={() => compSort.handleSort('unrealizedNetPct')}>Unrealized Return %{compSort.sortIcon('unrealizedNetPct')}</th>
              <th className="sort-header text-right hide-sm" title="Booked return = (Realized + Dividends) ÷ total purchase cost × 100. Counts everything already banked, so it is non-zero when dividends were received even if nothing was sold. Excludes unrealized." onClick={() => compSort.handleSort('bookedPct')}>Booked Return %{compSort.sortIcon('bookedPct')}</th>
              <th className="sort-header text-right" title="Return = (Unrealized + Realized + Dividends) ÷ total purchase cost × 100" onClick={() => compSort.handleSort('netPct')}>Return %{compSort.sortIcon('netPct')}</th>
              <th className="sort-header text-right hide-sm" title="Interest the money tied up in this holding could have earned instead, at the rate set in Settings" onClick={() => compSort.handleSort('opportunityCost')}>Opportunity Cost{compSort.sortIcon('opportunityCost')}</th>
            </tr>
          </thead>
          <tbody>
            {compSort.sorted.map(c => (
              <React.Fragment key={c.code}>
              <tr
                // On a compact screen most columns are hidden, so tapping the row opens
                // the breakdown instead of navigating; the company page is one tap further.
                onClick={isCompact ? () => setExpandedCode(prev => prev === c.code ? null : c.code) : undefined}
                style={isCompact ? { cursor: 'pointer' } : undefined}
                aria-expanded={isCompact ? expandedCode === c.code : undefined}
              >
                <td
                  style={{ cursor: 'pointer' }}
                  onClick={isCompact ? undefined : () => navigate(`/company/${c.code}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CompanyAvatar code={c.code} size={26} />
                    <span className="company-code">{c.code}</span>
                    {isCompact && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                        {expandedCode === c.code ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right mono hide-sm">{c.shares.toLocaleString('en-US')}</td>
                <td className={`text-right mono hide-sm ${c.invested > 0 ? cls(c.unrealized) : ''}`}>{c.invested > 0 ? `${sign(c.unrealized)}${fmt(c.unrealized)}` : '—'}</td>
                <td className={`text-right mono hide-sm ${c.invested > 0 ? cls(c.unrealizedNet) : ''}`}>{c.invested > 0 ? `${sign(c.unrealizedNet)}${fmt(c.unrealizedNet)}` : '—'}</td>
                <td className={`text-right mono hide-sm ${cls(c.realized)}`}>{sign(c.realized)}{fmt(c.realized)}</td>
                <td className={`text-right mono hide-sm ${c.dividends > 0 ? 'gain-positive' : ''}`}>{c.dividends > 0 ? `+${fmt(c.dividends)}` : '—'}</td>
                <td className={`text-right mono hide-sm ${cls(c.capitalGain)}`}>{sign(c.capitalGain)}{fmt(c.capitalGain)}</td>
                <td className={`text-right mono ${cls(isCompact ? c.netAfterComm : c.net)}`} style={{ fontWeight: 700 }}>
                  {sign(isCompact ? c.netAfterComm : c.net)}{fmt(isCompact ? c.netAfterComm : c.net)}
                </td>
                <td className={`text-right mono hide-sm ${c.invested > 0 ? cls(c.unrealizedNetPct) : ''}`}>{c.invested > 0 ? `${sign(c.unrealizedNetPct)}${c.unrealizedNetPct.toFixed(2)}%` : '—'}</td>
                <td className={`text-right mono hide-sm ${c.hasBasis ? cls(c.bookedPct) : ''}`}>{c.hasBasis ? `${sign(c.bookedPct)}${c.bookedPct.toFixed(2)}%` : '—'}</td>
                <td className={`text-right mono ${c.hasBasis ? cls(c.netPct) : ''}`}>{c.hasBasis ? `${sign(c.netPct)}${c.netPct.toFixed(2)}%` : '—'}</td>
                <td className={`text-right mono hide-sm ${c.opportunityCost > 0 ? 'gain-negative' : ''}`}>{c.opportunityCost > 0 ? `-${fmt(c.opportunityCost)}` : fmt(0)}</td>
              </tr>
              {isCompact && expandedCode === c.code && (
                <tr className="summary-expanded-row">
                  {/* Spans the three columns that survive the hide-sm breakpoint. */}
                  <td colSpan={3} style={{ padding: '0.25rem 0.5rem 0.75rem' }}>
                    <div className="summary-expanded">
                      {/* Shares currently held — 0 once a position is fully sold, where
                          the realized and dividend figures below still apply. */}
                      <div className="summary-expanded-shares">
                        {c.shares.toLocaleString('en-US')} shares
                      </div>
                      <div className="summary-expanded-line">
                        <span>Capital Gain</span>
                        <span className={`mono ${cls(c.capitalGain)}`}>{sign(c.capitalGain)}{fmt(c.capitalGain)}</span>
                        <span className={`mono ${c.hasBasis ? cls(c.capitalGainPct) : ''}`}>
                          {c.hasBasis ? `${sign(c.capitalGainPct)}${c.capitalGainPct.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                      <div className="summary-expanded-line">
                        <span>Dividend Gain</span>
                        <span className={`mono ${c.dividends > 0 ? 'gain-positive' : ''}`}>
                          {c.dividends > 0 ? `+${fmt(c.dividends)}` : fmt(c.dividends)}
                        </span>
                        <span className={`mono ${c.hasBasis && c.dividends > 0 ? 'gain-positive' : ''}`}>
                          {c.hasBasis ? `${sign(c.dividendPct)}${c.dividendPct.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                      <div className="summary-expanded-line">
                        <span>Opportunity Cost</span>
                        <span className={`mono ${c.opportunityCost > 0 ? 'gain-negative' : ''}`}>
                          {c.opportunityCost > 0 ? `-${fmt(c.opportunityCost)}` : fmt(0)}
                        </span>
                        <span className={`mono ${c.hasBasis && c.opportunityCost > 0 ? 'gain-negative' : ''}`}>
                          {c.hasBasis ? `-${c.opportunityCostPct.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                      {/* The six columns hide-sm removes on a phone. Each is labelled
                          so it stands alone; the info icon above the table explains
                          how they are worked out. */}
                      <div className="summary-expanded-cells">
                        <div className="summary-expanded-cell">
                          <span>Unrealized</span>
                          <span className={`mono ${c.invested > 0 ? cls(c.unrealized) : ''}`}>
                            {c.invested > 0 ? `${sign(c.unrealized)}${fmt(c.unrealized)}` : '—'}
                          </span>
                        </div>
                        <div className="summary-expanded-cell">
                          <span>Net of Comm.</span>
                          <span className={`mono ${c.invested > 0 ? cls(c.unrealizedNet) : ''}`}>
                            {c.invested > 0 ? `${sign(c.unrealizedNet)}${fmt(c.unrealizedNet)}` : '—'}
                          </span>
                        </div>
                        <div className="summary-expanded-cell">
                          <span>Unreal. %</span>
                          <span className={`mono ${c.invested > 0 ? cls(c.unrealizedNetPct) : ''}`}>
                            {c.invested > 0 ? `${sign(c.unrealizedNetPct)}${c.unrealizedNetPct.toFixed(2)}%` : '—'}
                          </span>
                        </div>
                        <div className="summary-expanded-cell">
                          <span>Booked %</span>
                          <span className={`mono ${c.hasBasis ? cls(c.bookedPct) : ''}`}>
                            {c.hasBasis ? `${sign(c.bookedPct)}${c.bookedPct.toFixed(2)}%` : '—'}
                          </span>
                        </div>
                        <div className="summary-expanded-cell">
                          <span>Realized</span>
                          <span className={`mono ${cls(c.realized)}`}>{sign(c.realized)}{fmt(c.realized)}</span>
                        </div>
                        <div className="summary-expanded-cell">
                          <span>Dividends</span>
                          <span className={`mono ${c.dividends > 0 ? 'gain-positive' : ''}`}>
                            {c.dividends > 0 ? `+${fmt(c.dividends)}` : fmt(c.dividends)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="portfolio-total">
              <td>Total</td>
              <td className="text-right mono hide-sm">—</td>
              <td className={`text-right mono hide-sm ${cls(unrealized)}`}>{sign(unrealized)}{fmt(unrealized)}</td>
              <td className={`text-right mono hide-sm ${cls(unrealizedNetTotal)}`}>{sign(unrealizedNetTotal)}{fmt(unrealizedNetTotal)}</td>
              <td className={`text-right mono hide-sm ${cls(realizedTotal)}`}>{sign(realizedTotal)}{fmt(realizedTotal)}</td>
              <td className={`text-right mono hide-sm ${cls(dividendsTotal)}`}>{sign(dividendsTotal)}{fmt(dividendsTotal)}</td>
              <td className={`text-right mono hide-sm ${cls(unrealized + realizedTotal)}`}>{sign(unrealized + realizedTotal)}{fmt(unrealized + realizedTotal)}</td>
              <td className={`text-right mono ${cls(isCompact ? netCumulativeAfterComm : netCumulative)}`}>
                {sign(isCompact ? netCumulativeAfterComm : netCumulative)}{fmt(isCompact ? netCumulativeAfterComm : netCumulative)}
              </td>
              <td className={`text-right mono hide-sm ${cls(unrealizedReturnPct)}`}>{sign(unrealizedReturnPct)}{unrealizedReturnPct.toFixed(2)}%</td>
              <td className={`text-right mono hide-sm ${cls(realizedReturnPct)}`}>{sign(realizedReturnPct)}{realizedReturnPct.toFixed(2)}%</td>
              <td className={`text-right mono ${cls(netPct)}`}>{sign(netPct)}{netPct.toFixed(2)}%</td>
              <td className={`text-right mono hide-sm ${opportunityCostTotal > 0 ? 'gain-negative' : ''}`}>{opportunityCostTotal > 0 ? `-${fmt(opportunityCostTotal)}` : fmt(0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
