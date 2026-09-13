import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTransactionsByCompany, getDividendsByCompany, getDashboardAll, getCompanies, getMarketDataHistory, getShareSplits, ShareSplitData, getDividendPayouts, DividendPayoutData, getDividendFinancials, DividendFinancialData } from '../api';
import { Transaction, Dividend, RealizedGainItem, Company, MarketData, PortfolioItem } from '../types';
import { useAuth } from '../context/AuthContext';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';
import ActionMenu from '../components/ActionMenu';
import NotesPanel from '../components/NotesPanel';
import NotesView from '../components/NotesView';
import { deleteTransaction, deleteDividend, getUserSettings, updateCompanyTtmWeeks, invalidate } from '../api';
import { LineChart, Line, Bar, ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { SELL_COMMISSION_RATE, DEFAULT_OPPORTUNITY_COST_RATE } from '../constants';
import { ttmWindow, resolveTtmWeeks } from '../utils/ttm';
import { compareTxDateBuysFirst, compareEventDateBuysFirst, txDateTieBreaker } from '../utils/transactionSort';
import { adjustedCount, adjustedPrice, adjustedHistPrice, sharesHeldAtDate } from '../utils/splits';
import { isAcquisition, isDisposal, shareDelta, txTypeLabel, txTypePillClass } from '../utils/transactionTypes';
import { useTableSort } from '../hooks/useTableSort';

type Tab = 'transactions' | 'dividends' | 'realized' | 'payouts' | 'notes';
type Period = '1d' | '2d' | '5d' | '2w' | '1m' | '3m' | '6m' | 'custom';
type VolumeRange = '1m' | '3m' | '6m' | '1y' | '2y' | 'all';
const VOLUME_RANGE_DAYS: Record<Exclude<VolumeRange, 'all'>, number> = {
  '1m': 30, '3m': 90, '6m': 180, '1y': 365, '2y': 730,
};

// Hollow shapes at buy/sell points. Circle = buy, square = sell.
// Hollow so the underlying price line stays visible. Area scales with share count.
const renderBuyDot = ({ cx, cy, payload, index }: any) => {
  if (!payload?.buyCount) return <g key={`bd-${index}`} />;
  const r = Math.max(3, Math.min(14, Math.sqrt(payload.buyCount) * 2));
  return <circle key={`bd-${index}`} cx={cx} cy={cy} r={r} fill="none" stroke="var(--text-primary, #333)" strokeWidth={1.5} />;
};
const renderSellDot = ({ cx, cy, payload, index }: any) => {
  if (!payload?.sellCount) return <g key={`sd-${index}`} />;
  const r = Math.max(3, Math.min(14, Math.sqrt(payload.sellCount) * 2));
  return <rect key={`sd-${index}`} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="none" stroke="var(--text-primary, #333)" strokeWidth={1.5} />;
};

const fmtVolumeAxis = (v: number) => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};

const volumeChartTooltip = (fmtLkr: (n: number) => string) => ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { volume?: number; high?: number; low?: number; close?: number };
  const row = (color: string, name: string, value: string) => (
    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
      <span style={{ color }}>{name}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px',
      padding: '0.5rem 0.6rem', fontSize: '0.75rem', lineHeight: 1.35, minWidth: '160px',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
      {d.volume != null && row('#4299e1', 'Volume', d.volume.toLocaleString('en-US'))}
      {d.high != null && row('#38a169', 'High', `LKR ${fmtLkr(d.high)}`)}
      {d.low != null && row('#e53e3e', 'Low', `LKR ${fmtLkr(d.low)}`)}
      {d.close != null && row('var(--text-primary, #333)', 'Close', `LKR ${fmtLkr(d.close)}`)}
    </div>
  );
};

// Compact tooltip for the Price/Avg chart — only renders rows we actually have,
// so non-buy days don't show an empty "Your Buy Price" row (Recharts' default
// tooltip leaves blank space for each Line in the chart).
const priceChartTooltip = (fmtLkr: (n: number) => string) => ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { sharePrice?: number; avgPrice?: number | null; buyPrice?: number | null; buyCount?: number; sellPrice?: number | null; sellCount?: number };
  const row = (color: string, name: string, value: string) => (
    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
      <span style={{ color }}>{name}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px',
      padding: '0.5rem 0.6rem', fontSize: '0.75rem', lineHeight: 1.35, minWidth: '140px',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
      {d.sharePrice != null && row('#e53e3e', 'Price', `LKR ${fmtLkr(d.sharePrice)}`)}
      {d.avgPrice != null && row('#3182ce', 'Avg Cost', `LKR ${fmtLkr(d.avgPrice)}`)}
      {d.buyCount ? row('var(--text-primary, #333)', 'Buy', `${d.buyCount} @ LKR ${fmtLkr(d.buyPrice ?? 0)}`) : null}
      {d.sellCount ? row('#dd6b20', 'Sell', `${d.sellCount} @ LKR ${fmtLkr(d.sellPrice ?? 0)}`) : null}
    </div>
  );
};

export default function CompanyView() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isReadMode, dividendPayoutsEnabled } = useAuth();
  const [tab, setTab] = useState<Tab>('transactions');
  const [notesOpen, setNotesOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [realizedItems, setRealizedItems] = useState<RealizedGainItem[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [portfolioItem, setPortfolioItem] = useState<PortfolioItem | null>(null);
  const [marketHistory, setMarketHistory] = useState<MarketData[]>([]);
  const [shareSplits, setShareSplits] = useState<ShareSplitData[]>([]);
  const [payouts, setPayouts] = useState<DividendPayoutData[]>([]);
  const [financials, setFinancials] = useState<DividendFinancialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowPeriod, setLowPeriod] = useState<Period>('1d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedChart, setExpandedChart] = useState<'shares' | 'value' | 'priceAvg' | 'pnl' | 'volume' | 'yearly' | 'yearlyChart' | null>(null);
  const [showBuyDots, setShowBuyDots] = useState(true);
  const [showBuyBars, setShowBuyBars] = useState(true);
  const [volumeRange, setVolumeRange] = useState<VolumeRange>('3m');
  const [priceFromFirstBuy, setPriceFromFirstBuy] = useState(true);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [ttmWeeksInput, setTtmWeeksInput] = useState<string>('');
  const [savedTtmWeeks, setSavedTtmWeeks] = useState<number | undefined>(undefined);
  // Annual % used for this company's opportunity-cost line; set in Settings.
  const [opportunityCostRate, setOpportunityCostRate] = useState(DEFAULT_OPPORTUNITY_COST_RATE);
  const [savingTtmWeeks, setSavingTtmWeeks] = useState(false);
  const [ttmEditorOpen, setTtmEditorOpen] = useState(false);
  const [payoutsLoaded, setPayoutsLoaded] = useState(false);
  const [financialsLoaded, setFinancialsLoaded] = useState(false);

  const loadData = () => {
    if (!code) return Promise.resolve();

    // Critical path — hide spinner as soon as these resolve.
    const companiesP = getCompanies().then(comps => {
      setCompanies(comps);
      const found = comps.find(c => c.code === code) || null;
      setCompany(found);
    });
    // User-scoped TTM weeks for this company
    getUserSettings().then(settings => {
      const weeks = settings.companyTtmWeeks?.[code];
      setSavedTtmWeeks(weeks);
      setTtmWeeksInput(weeks ? String(weeks) : '');
      setOpportunityCostRate(settings.opportunityCostRate ?? DEFAULT_OPPORTUNITY_COST_RATE);
    }).catch(console.error);
    const transactionsP = getTransactionsByCompany(code).then(txns => {
      // Disabled (e.g. converted ".R") transactions are excluded from all calculations.
      setTransactions(txns.filter(t => !t.disabled).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });
    const dividendsP = getDividendsByCompany(code).then(divs => {
      setDividends(divs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });
    const marketHistoryP = getMarketDataHistory(code).then(mh => setMarketHistory(mh));

    // Non-critical — fill in progressively, don't block initial render.
    getDashboardAll().then(dash => {
      setRealizedItems(dash.realizedItems.filter(r => r.companyCode === code));
      setPortfolioItem(dash.portfolio.find((p: PortfolioItem) => p.companyCode === code) || null);
    }).catch(console.error);
    getShareSplits()
      .then(splits => setShareSplits(splits.filter(s => s.companyCode === code)))
      .catch(console.error);
    getDividendPayouts(code)
      .then(p => setPayouts(p as DividendPayoutData[]))
      .catch(() => setPayouts([]))
      .finally(() => setPayoutsLoaded(true));
    getDividendFinancials(code)
      .then(f => setFinancials(f as DividendFinancialData[]))
      .catch(() => setFinancials([]))
      .finally(() => setFinancialsLoaded(true));

    return Promise.all([companiesP, transactionsP, dividendsP, marketHistoryP]);
  };

  useEffect(() => {
    setLoading(true);
    setTransactions([]);
    setDividends([]);
    setRealizedItems([]);
    setPortfolioItem(null);
    setMarketHistory([]);
    setShareSplits([]);
    setPayouts([]);
    setFinancials([]);
    setCompany(null);
    setSavedTtmWeeks(undefined);
    setTtmWeeksInput('');
    setPayoutsLoaded(false);
    setFinancialsLoaded(false);
    loadData().catch(console.error).finally(() => setLoading(false));
  }, [code]);

  const handleSaveTtmWeeks = async () => {
    if (!code) return;
    const trimmed = ttmWeeksInput.trim();
    const weeks = trimmed === '' ? null : Number(trimmed);
    if (weeks !== null && (!Number.isFinite(weeks) || weeks <= 0 || weeks > 520)) {
      alert('TTM weeks must be between 1 and 520');
      return;
    }
    setSavingTtmWeeks(true);
    try {
      await updateCompanyTtmWeeks(code, weeks);
      setSavedTtmWeeks(weeks ?? undefined);
      invalidate('settings');
    } catch (err) {
      console.error('Failed to save TTM weeks', err);
      alert('Failed to save TTM weeks');
    } finally {
      setSavingTtmWeeks(false);
    }
  };

  const handleDeleteTx = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    await deleteTransaction(id);
    invalidate('transactions', 'portfolio', 'realized', 'summary', 'dashboard-all');
    loadData();
  };

  const handleDeleteDiv = async (id: string) => {
    if (!confirm('Delete this dividend?')) return;
    await deleteDividend(id);
    invalidate('dividends');
    loadData();
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  // Sortable rows for tab tables
  const txRows = useMemo(() => transactions.map(t => ({
    ...t,
    total: t.count * t.price + t.commission,
  })), [transactions]);
  // Re-express each cash dividend in the split basis in effect on its XD date:
  // shares held at XD (split-aware) with the per-share gross rebased so net cash
  // (totalAmount) stays invariant. Falls back to stored values when the XD holding
  // isn't derivable. transactions/shareSplits here are already company-scoped.
  const divRows = useMemo(() => dividends.map(d => {
    const held = d.type === 'CASH' && d.xdDate ? sharesHeldAtDate(transactions, shareSplits, d.xdDate) : 0;
    const shares = d.type === 'CASH' ? (held > 0 ? held : d.shares) : 0;
    const amountPerShare = d.type === 'CASH' ? (shares > 0 ? (d.amount * d.shares) / shares : d.amount) : 0;
    return {
      ...d,
      amountPerShare,
      sharesCount: shares,
      scripSharesCount: d.type === 'SCRIP' ? d.scripShares : 0,
      totalValue: d.type === 'CASH' ? d.totalAmount : d.scripShares,
    };
  }), [dividends, transactions, shareSplits]);
  const { sorted: sortedTx, handleSort: sortTx, sortIcon: txIcon } = useTableSort(txRows, 'date', 'desc', txDateTieBreaker);
  const { sorted: sortedDivs, handleSort: sortDiv, sortIcon: divIcon } = useTableSort(divRows, 'date');
  const { sorted: sortedRealized, handleSort: sortRealized, sortIcon: realizedIcon } = useTableSort(realizedItems, 'sellDate');

  const periodDays: Record<Period, number> = { '1d': 1, '2d': 2, '5d': 5, '2w': 14, '1m': 30, '3m': 90, '6m': 180, 'custom': 0 };
  const periodLabels: Record<Period, string> = { '1d': 'Last Trade Day', '2d': 'Last 2 Days', '5d': 'Last 5 Days', '2w': 'Last 2 Weeks', '1m': 'Last Month', '3m': 'Last 3 Months', '6m': 'Last 6 Months', 'custom': 'Custom Range' };

  const { lowestData, highestData, splitsInPeriod } = useMemo(() => {
    if (marketHistory.length === 0) return { lowestData: null, highestData: null, splitsInPeriod: [] as ShareSplitData[] };

    let filtered: MarketData[];
    let cutoffStr: string;
    if (lowPeriod === 'custom') {
      filtered = marketHistory.filter(m => {
        if (customFrom && m.tradeDate < customFrom) return false;
        if (customTo && m.tradeDate > customTo) return false;
        return true;
      });
      cutoffStr = customFrom || '1900-01-01';
    } else if (lowPeriod === '1d') {
      const latestDate = marketHistory.reduce((max, m) => m.tradeDate > max ? m.tradeDate : max, '');
      filtered = marketHistory.filter(m => m.tradeDate === latestDate);
      cutoffStr = latestDate;
    } else {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDays[lowPeriod]);
      cutoffStr = cutoff.toISOString().split('T')[0];
      filtered = marketHistory.filter(m => m.tradeDate >= cutoffStr);
    }

    const filteredLow = filtered.filter(m => m.low > 0);
    const filteredHigh = filtered.filter(m => m.high > 0);
    const count = filtered.length;
    // Compare/return in current basis so a range spanning a split is apples-to-apples.
    const adjLow = (m: MarketData) => adjustedHistPrice(m.low, m.tradeDate, shareSplits);
    const adjHigh = (m: MarketData) => adjustedHistPrice(m.high, m.tradeDate, shareSplits);
    const lowest = filteredLow.length > 0 ? filteredLow.reduce((min, m) => adjLow(m) < adjLow(min) ? m : min) : null;
    const highest = filteredHigh.length > 0 ? filteredHigh.reduce((max, m) => adjHigh(m) > adjHigh(max) ? m : max) : null;
    const splits = shareSplits.filter(s => s.date >= cutoffStr);
    return {
      lowestData: lowest ? { value: adjLow(lowest), date: lowest.tradeDate, count } : null,
      highestData: highest ? { value: adjHigh(highest), date: highest.tradeDate, count } : null,
      splitsInPeriod: splits,
    };
  }, [marketHistory, lowPeriod, customFrom, customTo, shareSplits]);

  const { valueChartData, sharesChartData, priceVsAvgChartData, adjPnlChartData, volumeChartData } = useMemo(() => {
    const sortedTx = [...transactions].sort(compareTxDateBuysFirst);

    // Build cumulative invested + shares over time (FIFO)
    let cumInvested = 0;
    let cumShares = 0;
    const txPoints: { date: string; invested: number; shares: number }[] = [];
    for (const t of sortedTx) {
      // Post-split basis so share counts stay continuous across a split.
      const adjCount = adjustedCount(t, shareSplits);
      const adjPrice = adjustedPrice(t, shareSplits);
      if (isAcquisition(t.type)) {
        cumInvested += adjCount * adjPrice + t.commission;
        cumShares += adjCount;
      } else if (t.type === 'TRANSFER_OUT') {
        // Not a disposal: removes exactly the cost its own price represents, so an
        // out/in pair leaves the invested line flat across the transfer.
        cumInvested -= adjCount * adjPrice;
        cumShares -= adjCount;
      } else if (t.type === 'SELL') {
        const avgAtSell = cumShares > 0 ? cumInvested / cumShares : 0;
        cumInvested -= avgAtSell * adjCount;
        cumShares -= adjCount;
      } else {
        throw new Error(`Unknown transaction type: ${t.type}`);
      }
      txPoints.push({ date: t.date, invested: Math.round(cumInvested * 10000) / 10000, shares: cumShares });
    }
    // Merge same-date
    const mergedTx = txPoints.reduce<typeof txPoints>((acc, item) => {
      if (acc.length > 0 && acc[acc.length - 1].date === item.date) {
        acc[acc.length - 1] = item;
      } else {
        acc.push(item);
      }
      return acc;
    }, []);

    // Build market price map by date, prices in current basis so shares×price is
    // continuous and comparable to the (current-basis) average cost.
    const priceByDate: Record<string, number> = {};
    marketHistory.forEach(m => { priceByDate[m.tradeDate] = adjustedHistPrice(m.lastTrade, m.tradeDate, shareSplits); });

    // Collect all dates (from transactions + market data), sorted
    const allDates = [...new Set([...mergedTx.map(t => t.date), ...marketHistory.map(m => m.tradeDate)])].sort();

    // Build value chart: for each date, get invested + portfolio value
    let lastInvested = 0;
    let lastShares = 0;
    const txByDate: Record<string, { invested: number; shares: number }> = {};
    mergedTx.forEach(t => { txByDate[t.date] = { invested: t.invested, shares: t.shares }; });

    const valueData: { date: string; invested: number; portfolio: number; price: number }[] = [];
    let lastPrice = 0;
    for (const date of allDates) {
      if (txByDate[date]) {
        lastInvested = txByDate[date].invested;
        lastShares = txByDate[date].shares;
      }
      if (priceByDate[date]) {
        lastPrice = priceByDate[date];
      }
      const portfolio = lastShares * lastPrice;
      if (lastInvested > 0 || portfolio > 0) {
        valueData.push({
          date,
          invested: Math.round(lastInvested * 10000) / 10000,
          portfolio: Math.round(portfolio * 10000) / 10000,
          price: Math.round(lastPrice * 10000) / 10000,
        });
      }
    }

    // Build adjusted P&L timeline: unrealized + realized + dividends - opportunity cost
    const annualRate = opportunityCostRate / 100;
    const events: { date: string; type: 'tx' | 'div' | 'realized'; data: any }[] = [];
    sortedTx.forEach(t => events.push({ date: t.date, type: 'tx', data: t }));
    dividends.filter(d => d.type === 'CASH').forEach(d => events.push({ date: d.date, type: 'div', data: d }));
    realizedItems.forEach(r => events.push({ date: r.sellDate, type: 'realized', data: r }));
    events.sort(compareEventDateBuysFirst);

    // Per-lot FIFO opportunity cost: each buy-lot accrues interest on its own
    // purchase cost for exactly the time it was held (until consumed by a SELL,
    // or until "now" while still held).
    const lots: { count: number; costPerShare: number }[] = [];
    let cumRealized = 0;
    let cumDividends = 0;
    let cumInterest = 0;
    let lastAccrualMs: number | null = null;
    const adjPnlPoints: { date: string; pnl: number }[] = [];

    const accrueTo = (dateStr: string) => {
      const ms = new Date(dateStr).getTime();
      if (lastAccrualMs === null) { lastAccrualMs = ms; return; }
      const days = (ms - lastAccrualMs) / 86400000;
      if (days > 0 && lots.length > 0) {
        for (const lot of lots) {
          cumInterest += lot.count * lot.costPerShare * annualRate * days / 365;
        }
      }
      lastAccrualMs = ms;
    };

    for (const ev of events) {
      accrueTo(ev.date);

      if (ev.type === 'tx') {
        const t = ev.data;
        const adjCount = adjustedCount(t, shareSplits);
        const adjPrice = adjustedPrice(t, shareSplits);
        if (isAcquisition(t.type)) {
          if (adjCount > 0) {
            const lotCost = adjCount * adjPrice + t.commission;
            lots.push({ count: adjCount, costPerShare: lotCost / adjCount });
          }
        } else if (isDisposal(t.type)) {
          // TRANSFER_OUT consumes lots the same way, so the out/in pair leaves the
          // lot book balanced whether or not a broker filter is hiding one leg.
          let toSell = adjCount;
          while (toSell > 0 && lots.length > 0) {
            const lot = lots[0];
            if (lot.count <= toSell) { toSell -= lot.count; lots.shift(); }
            else { lot.count -= toSell; toSell = 0; }
          }
        }
      } else if (ev.type === 'div') {
        cumDividends += ev.data.totalAmount;
      } else if (ev.type === 'realized') {
        cumRealized += ev.data.realizedGain;
      }

      let cumShares2 = 0;
      let cumCost = 0;
      for (const lot of lots) { cumShares2 += lot.count; cumCost += lot.count * lot.costPerShare; }

      const price = priceByDate[ev.date] || lastPrice;
      const portfolioVal = cumShares2 * price;
      const unrealized = portfolioVal - portfolioVal * SELL_COMMISSION_RATE - cumCost;
      const adjPnl = unrealized + cumRealized + cumDividends - cumInterest;
      adjPnlPoints.push({ date: ev.date, pnl: Math.round(adjPnl * 10000) / 10000 });
    }

    const mergedAdjPnl = adjPnlPoints.reduce<typeof adjPnlPoints>((acc, item) => {
      if (acc.length > 0 && acc[acc.length - 1].date === item.date) {
        acc[acc.length - 1].pnl = item.pnl;
      } else {
        acc.push(item);
      }
      return acc;
    }, []);

    // Build share price vs avg buy price chart data
    const investedByDate: Record<string, { invested: number; shares: number }> = {};
    mergedTx.forEach(t => { investedByDate[t.date] = { invested: t.invested, shares: t.shares }; });
    // For each transaction date, aggregate shares (for bar height / dot size)
    // and weighted-avg price (for dot Y-position). Zero-price types like
    // SCRIP_DIVIDEND are counted in shares but excluded from the price calc.
    const buyCountByDate: Record<string, number> = {};
    const paidBuyCountByDate: Record<string, number> = {};
    const paidBuyCostByDate: Record<string, number> = {};
    const sellCountByDate: Record<string, number> = {};
    const sellCountPricedByDate: Record<string, number> = {};
    const sellProceedsByDate: Record<string, number> = {};
    for (const t of sortedTx) {
      // Markers in current basis so they sit on the (adjusted) price/avg lines.
      const adjCount = adjustedCount(t, shareSplits);
      const adjPrice = adjustedPrice(t, shareSplits);
      if (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' || t.type === 'IPO') {
        buyCountByDate[t.date] = (buyCountByDate[t.date] || 0) + adjCount;
        if (t.price > 0) {
          paidBuyCountByDate[t.date] = (paidBuyCountByDate[t.date] || 0) + adjCount;
          paidBuyCostByDate[t.date] = (paidBuyCostByDate[t.date] || 0) + adjCount * adjPrice;
        }
      } else if (t.type === 'SELL') {
        sellCountByDate[t.date] = (sellCountByDate[t.date] || 0) + adjCount;
        if (t.price > 0) {
          sellCountPricedByDate[t.date] = (sellCountPricedByDate[t.date] || 0) + adjCount;
          sellProceedsByDate[t.date] = (sellProceedsByDate[t.date] || 0) + adjCount * adjPrice;
        }
      }
    }
    let lastAvgShares = 0;
    let lastAvgInvested = 0;
    let lastMktPrice = 0;
    const priceVsAvgData: { date: string; sharePrice: number; avgPrice: number | null; buyCount: number; buyPrice: number | null; sellCount: number; sellPrice: number | null }[] = [];
    for (const date of allDates) {
      if (investedByDate[date]) {
        lastAvgShares = investedByDate[date].shares;
        lastAvgInvested = investedByDate[date].invested;
      }
      if (priceByDate[date]) lastMktPrice = priceByDate[date];
      if (lastMktPrice > 0) {
        const avgPrice = lastAvgShares > 0 ? lastAvgInvested / lastAvgShares : null;
        const paidBuyCount = paidBuyCountByDate[date];
        const buyPrice = paidBuyCount ? paidBuyCostByDate[date] / paidBuyCount : null;
        const pricedSellCount = sellCountPricedByDate[date];
        const sellPrice = pricedSellCount ? sellProceedsByDate[date] / pricedSellCount : null;
        priceVsAvgData.push({
          date,
          sharePrice: Math.round(lastMktPrice * 100) / 100,
          avgPrice: avgPrice !== null ? Math.round(avgPrice * 100) / 100 : null,
          buyCount: buyCountByDate[date] || 0,
          buyPrice: buyPrice !== null ? Math.round(buyPrice * 100) / 100 : null,
          sellCount: sellCountByDate[date] || 0,
          sellPrice: sellPrice !== null ? Math.round(sellPrice * 100) / 100 : null,
        });
      }
    }

    const volumeData = [...marketHistory]
      .filter(m => m.volume != null && m.volume > 0)
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
      .map(m => ({
        date: m.tradeDate,
        volume: m.volume as number,
        high: m.high,
        low: m.low,
        close: m.lastTrade,
      }));

    return { valueChartData: valueData, sharesChartData: mergedTx, priceVsAvgChartData: priceVsAvgData, adjPnlChartData: mergedAdjPnl, volumeChartData: volumeData };
  }, [transactions, marketHistory, dividends, realizedItems, shareSplits, opportunityCostRate]);

  const firstBuyDate = useMemo(() => {
    // Only real acquisitions date the holding — a TRANSFER_OUT is not a buy.
    const buys = transactions.filter(t => isAcquisition(t.type));
    if (buys.length === 0) return null;
    return buys.reduce((min, t) => t.date < min ? t.date : min, buys[0].date);
  }, [transactions]);

  const priceVsAvgChartDataFiltered = useMemo(() => {
    if (!priceFromFirstBuy || !firstBuyDate) return priceVsAvgChartData;
    return priceVsAvgChartData.filter(d => d.date >= firstBuyDate);
  }, [priceVsAvgChartData, priceFromFirstBuy, firstBuyDate]);

  const volumeChartDataRanged = useMemo(() => {
    if (volumeRange === 'all' || volumeChartData.length === 0) return volumeChartData;
    const days = VOLUME_RANGE_DAYS[volumeRange];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const y = cutoff.getFullYear();
    const m = String(cutoff.getMonth() + 1).padStart(2, '0');
    const d = String(cutoff.getDate()).padStart(2, '0');
    const cutoffStr = `${y}-${m}-${d}`;
    return volumeChartData.filter(b => b.date >= cutoffStr);
  }, [volumeChartData, volumeRange]);

  const [navCode, setNavCode] = useState('');

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div className="company-view-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'transparent', border: '1.5px solid var(--border-input)',
              borderRadius: '8px', padding: '0.3rem 0.6rem', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '0.85rem',
            }}
          >
            &larr; Back
          </button>
          <div className="company-view-avatar" style={{ display: 'inline-block' }}>
            <CompanyAvatar code={code || ''} size={56} />
          </div>
          <div>
            <h1 style={{ margin: 0 }}>{code}</h1>
            {company && company.name !== code && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{company.name}</span>
            )}
          </div>
        </div>
        <div className="company-view-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className="btn-settings-gear"
            onClick={() => navigate(`/market-data?tab=byCompany&code=${code}`)}
            aria-label="Daily price movement"
            title="Daily price movement"
          >
            &#128200;
          </button>
          <button
            className="btn-settings-gear"
            onClick={() => setNotesOpen(true)}
            aria-label="Notes"
            title="Notes"
          >
            &#128221;
          </button>
          <div className="company-view-header-search" style={{ width: '220px' }}>
            <CompanySearchSelect
              companies={companies}
              value={navCode}
              onChange={c => { if (c) { setNavCode(''); navigate(`/company/${c}`); } else { setNavCode(''); } }}
            />
          </div>
          {/* Price */}
          {(() => {
            const latestMd = marketHistory.length > 0
              ? marketHistory.reduce((a, b) => a.tradeDate > b.tradeDate ? a : b)
              : null;
            return latestMd && latestMd.lastTrade > 0 ? (
              <div className="company-view-price" style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-stat-value)' }}>
                  {fmt(latestMd.lastTrade)}
                </div>
                <div className={gainClass(latestMd.change)} style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {gainSign(latestMd.change)}{fmt(latestMd.change)} ({gainSign(latestMd.changePercent)}{fmt(latestMd.changePercent)}%)
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{latestMd.tradeDate}</div>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      {/* Portfolio stats - full width grid */}
      {portfolioItem && (
        <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}><h3>Shares Held</h3><p className="stat-value">{portfolioItem.sharesHeld}</p></div>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}><h3>Avg. Buy Price</h3><p className="stat-value">{fmt(portfolioItem.avgBuyPrice)}</p></div>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}><h3>Total Invested</h3><p className="stat-value">{fmt(portfolioItem.totalInvested)}</p></div>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}><h3>Current Value</h3><p className="stat-value">{fmt(portfolioItem.currentValue)}</p></div>
          <div className="stat-card" style={{ borderLeftColor: portfolioItem.unrealizedGain >= 0 ? '#38a169' : '#e53e3e' }}>
            <h3>Unrealized Gain</h3>
            <p className={`stat-value ${gainClass(portfolioItem.unrealizedGain)}`}>{gainSign(portfolioItem.unrealizedGain)}{fmt(portfolioItem.unrealizedGain)}</p>
            <small style={{ color: '#718096' }}>{gainSign(portfolioItem.unrealizedGainPercent)}{fmt(portfolioItem.unrealizedGainPercent)}%</small>
          </div>
          <div className="stat-card" style={{ borderLeftColor: portfolioItem.realizedGain >= 0 ? '#38a169' : '#e53e3e' }}>
            <h3>Realized Gain</h3>
            <p className={`stat-value ${gainClass(portfolioItem.realizedGain)}`}>{gainSign(portfolioItem.realizedGain)}{fmt(portfolioItem.realizedGain)}</p>
          </div>
        </div>
      )}

      {/* Two-column: Price Range | Dividend Yield + Yearly Summary */}
      <div className="company-view-two-col" style={{ display: 'grid', gridTemplateColumns: marketHistory.length > 0 && dividendPayoutsEnabled ? '1fr 1fr' : '1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Price Range */}
        {marketHistory.length > 0 && (
          <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                Price Range {lowestData && <span style={{ fontWeight: 400, fontSize: '0.75rem', textTransform: 'none' }}>({lowestData.count} day{lowestData.count !== 1 ? 's' : ''})</span>}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                <div className="segmented-control" style={{ fontSize: '0.75rem' }}>
                  {(['1d', '2d', '5d', '2w', '1m', '3m', '6m'] as Period[]).map(p => (
                    <button key={p} className={lowPeriod === p ? 'active' : ''} onClick={() => setLowPeriod(p)}>
                      {p === '1d' ? 'LTD' : p === '2d' ? '2D' : p === '5d' ? '5D' : p === '2w' ? '2W' : p === '1m' ? '1M' : p === '3m' ? '3M' : '6M'}
                    </button>
                  ))}
                  <button className={lowPeriod === 'custom' ? 'active' : ''} onClick={() => setLowPeriod('custom')}>Custom</button>
                </div>
              </div>
            </div>
            {lowPeriod === 'custom' && (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>to</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  style={{ padding: '0.25rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
              </div>
            )}
            {lowestData || highestData ? (() => {
              const ltdPrice = marketHistory.length > 0
                ? marketHistory.reduce((a, b) => a.tradeDate > b.tradeDate ? a : b).lastTrade : 0;
              const lowPct = lowestData && ltdPrice > 0 ? ((ltdPrice - lowestData.value) / lowestData.value) * 100 : null;
              const highPct = highestData && ltdPrice > 0 ? ((ltdPrice - highestData.value) / highestData.value) * 100 : null;
              return <>
                <div className="cv-pair-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', letterSpacing: '0.5px' }}>{'\u25BC'} Lowest</div>
                    {lowestData ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e53e3e' }}>{fmt(lowestData.value)}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lowestData.date}</span>
                        </div>
                        {lowPct != null && (
                          <span className={`gain-pill ${lowPct >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`} style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'inline-block' }}>
                            {lowPct >= 0 ? '+' : ''}{lowPct.toFixed(2)}% vs LTD
                          </span>
                        )}
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)' }}>No data</span>}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', letterSpacing: '0.5px' }}>{'\u25B2'} Highest</div>
                    {highestData ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38a169' }}>{fmt(highestData.value)}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{highestData.date}</span>
                        </div>
                        {highPct != null && (
                          <span className={`gain-pill ${highPct >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`} style={{ fontSize: '0.75rem', marginTop: '0.25rem', display: 'inline-block' }}>
                            {highPct >= 0 ? '+' : ''}{highPct.toFixed(2)}% vs LTD
                          </span>
                        )}
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)' }}>No data</span>}
                  </div>
                </div>
                {dividendPayoutsEnabled && (() => {
                  if (!payoutsLoaded) {
                    return (
                      <div className="cv-pair-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>TTM Yield @ Low</div>
                          <span className="loading-pulse" />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>TTM Yield @ High</div>
                          <span className="loading-pulse" />
                        </div>
                      </div>
                    );
                  }
                  if (payouts.length === 0) return null;
                  const w = ttmWindow(payouts, savedTtmWeeks);
                  if (!w) return null;
                  const ttm2 = payouts
                    .filter(p => p.exDividendDate >= w.cutoff && p.exDividendDate <= w.anchor)
                    .reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
                  if (ttm2 <= 0) return null;
                  return (
                    <div className="cv-pair-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>TTM Yield @ Low</div>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#805ad5' }}>{lowestData ? (ttm2 / lowestData.value * 100).toFixed(2) + '%' : '-'}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>TTM Yield @ High</div>
                        <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#805ad5' }}>{highestData ? (ttm2 / highestData.value * 100).toFixed(2) + '%' : '-'}</span>
                      </div>
                    </div>
                  );
                })()}
              </>;
            })() : (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No data for {periodLabels[lowPeriod].toLowerCase()}</p>
            )}
            {splitsInPeriod.length > 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#fefcbf', color: '#744210', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid #ecc94b' }}>
                {splitsInPeriod.map((s, i) => (
                  <div key={i}>{s.type === 'SUBDIVISION' ? 'Subdivision' : 'Merge'} ({s.fromShares}:{s.toShares}) on {s.date}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dividend Yield + Yearly Summary */}
        {dividendPayoutsEnabled && (() => {
          const now = new Date();
          const weeks = resolveTtmWeeks(savedTtmWeeks);
          const w = ttmWindow(payouts, weeks);
          const ttmPayouts = w
            ? payouts.filter(p => p.exDividendDate >= w.cutoff && p.exDividendDate <= w.anchor)
            : [];
          const ttmTotal = ttmPayouts.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
          // Latest market price: marketHistory is ordered by tradeDate desc, so [0] is newest.
          const curPrice = marketHistory.length > 0 ? marketHistory[0].lastTrade
            : portfolioItem?.currentValue && portfolioItem?.sharesHeld ? portfolioItem.currentValue / portfolioItem.sharesHeld : 0;
          const yieldPct = curPrice > 0 ? (ttmTotal / curPrice) * 100 : 0;

          const byYear: Record<string, typeof payouts> = {};
          payouts.forEach(p => { const y = p.exDividendDate.substring(0, 4); (byYear[y] = byYear[y] || []).push(p); });
          const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
          const currentYear = String(now.getFullYear());

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* TTM cards */}
              <div className="cv-pair-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="stat-card" style={{ borderLeftColor: '#805ad5', margin: 0, position: 'relative' }}>
                  <h3 style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span>Yield (TTM)</span>
                    {w && <span style={{ fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', fontSize: '0.7rem' }} title={`${weeks} weeks`}>({w.cutoff} → {w.anchor})</span>}
                    {!isReadMode && company && (
                      <button
                        onClick={() => setTtmEditorOpen(o => !o)}
                        title="Configure TTM weeks"
                        aria-label="Configure TTM weeks"
                        style={{ marginLeft: 'auto', padding: '0 0.25rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                      >⋮</button>
                    )}
                  </h3>
                  <p className="stat-value">{!payoutsLoaded ? <span className="loading-pulse" /> : payouts.length > 0 && ttmTotal > 0 ? yieldPct.toFixed(2) + '%' : <span style={{ color: 'var(--text-muted)' }}>No data</span>}</p>
                  {!isReadMode && company && ttmEditorOpen && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TTM weeks:</label>
                      <input
                        type="number"
                        min={1}
                        max={520}
                        value={ttmWeeksInput}
                        onChange={e => setTtmWeeksInput(e.target.value)}
                        placeholder="52"
                        style={{ width: '64px', padding: '0.15rem 0.3rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                      />
                      <button
                        onClick={handleSaveTtmWeeks}
                        disabled={savingTtmWeeks || ttmWeeksInput === (savedTtmWeeks ? String(savedTtmWeeks) : '')}
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid #805ad5', background: '#805ad5', color: 'white', cursor: 'pointer' }}
                      >
                        {savingTtmWeeks ? '...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="stat-card" style={{ borderLeftColor: '#805ad5', margin: 0 }}>
                  <h3 style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span>TTM Dividends</span>
                    {w && <span style={{ fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', fontSize: '0.7rem' }} title={`${weeks} weeks`}>({w.cutoff} → {w.anchor})</span>}
                  </h3>
                  <p className="stat-value">{!payoutsLoaded ? <span className="loading-pulse" /> : payouts.length > 0 ? fmt(ttmTotal) : <span style={{ color: 'var(--text-muted)' }}>No data</span>}</p>
                  {ttmPayouts.length > 0 && <small style={{ color: '#718096' }}>{ttmPayouts.length} payout{ttmPayouts.length !== 1 ? 's' : ''}</small>}
                </div>
              </div>
              {/* Yearly table */}
              {(() => {
                if (!financialsLoaded) return (
                  <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)' }}>
                    <h3 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>Yearly Summary</h3>
                    <span className="loading-pulse" />
                  </div>
                );
                const finByYear: Record<number, DividendFinancialData> = {};
                financials.forEach(f => { finByYear[f.year] = f; });
                const summaryYears = financials.length > 0
                  ? financials.filter(f => f.year < now.getFullYear()).map(f => f.year).sort((a, b) => b - a)
                  : years.filter(y => y !== currentYear).map(Number).sort((a, b) => b - a);
                if (summaryYears.length === 0) return null;
                const displayYears = summaryYears.slice(0, 7);
                const hasMore = summaryYears.length > 7;
                const renderTable = (yrs: number[]) => (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 600 }}></th>
                          {yrs.map(y => <th key={y} style={{ textAlign: 'right', padding: '0.3rem 0.5rem', fontWeight: 600 }}>{y}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>DPS</td>
                          {yrs.map(y => {
                            const fin = finByYear[y];
                            const payoutTotal = byYear[String(y)]?.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
                            const val = fin?.dividendPerShare ?? payoutTotal;
                            return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{val != null && val > 0 ? fmt(val) : '-'}</td>;
                          })}
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>EPS</td>
                          {yrs.map(y => {
                            const fin = finByYear[y];
                            return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{fin?.earningsPerShare != null ? fmt(fin.earningsPerShare) : '-'}</td>;
                          })}
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Yield %</td>
                          {yrs.map(y => {
                            const fin = finByYear[y];
                            return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{fin?.dividendYield != null ? fin.dividendYield.toFixed(2) + '%' : '-'}</td>;
                          })}
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Payout %</td>
                          {yrs.map(y => {
                            const fin = finByYear[y];
                            const payout = fin?.dividendPerShare && fin?.earningsPerShare && fin.earningsPerShare !== 0
                              ? (fin.dividendPerShare / fin.earningsPerShare * 100) : null;
                            return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{payout != null ? payout.toFixed(2) + '%' : '-'}</td>;
                          })}
                        </tr>
                        <tr>
                          <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Payouts</td>
                          {yrs.map(y => {
                            const count = byYear[String(y)]?.length || 0;
                            return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{count > 0 ? count : '-'}</td>;
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
                return (
                  <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Yearly Summary</h3>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {hasMore && (
                          <button onClick={() => setExpandedChart('yearly' as any)} style={{
                            background: 'none', border: '1px solid var(--border-input)', borderRadius: '4px',
                            color: 'var(--text-muted)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', cursor: 'pointer',
                          }}>All {summaryYears.length} years</button>
                        )}
                        <button onClick={() => setExpandedChart('yearlyChart' as any)} style={{
                          background: 'none', border: '1px solid var(--border-input)', borderRadius: '4px',
                          color: 'var(--text-muted)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', cursor: 'pointer',
                        }}>Chart</button>
                      </div>
                    </div>
                    {renderTable(displayYears)}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>

      {(valueChartData.length > 1 || sharesChartData.length > 1 || priceVsAvgChartData.length > 1 || adjPnlChartData.length > 1 || volumeChartData.length > 1) && (
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <div className="chart-scroll-container" ref={chartScrollRef}>
          {sharesChartData.length > 1 && (
            <div className="chart-scroll-item" onClick={() => setExpandedChart('shares')} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)', cursor: 'pointer' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Shares Held</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={sharesChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                  <Line type="monotone" dataKey="shares" stroke="#805ad5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {valueChartData.length > 1 && (
            <div className="chart-scroll-item" onClick={() => setExpandedChart('value')} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)', cursor: 'pointer' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                <span style={{ color: '#3182ce' }}>Invested</span> / <span style={{ color: '#38a169' }}>Portfolio</span>
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={valueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Line type="monotone" dataKey="invested" stroke="#3182ce" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="portfolio" stroke="#38a169" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {priceVsAvgChartData.length > 1 && (
            <div className="chart-scroll-item" onClick={() => setExpandedChart('priceAvg')} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)', cursor: 'pointer' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                <span style={{ color: '#e53e3e' }}>Price</span> / <span style={{ color: '#3182ce' }}>Avg Cost</span>
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={priceVsAvgChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis yAxisId="price" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={v => v.toFixed(0)} />
                  <YAxis yAxisId="count" orientation="right" hide tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={v => v.toFixed(0)} />
                  <Tooltip content={priceChartTooltip(fmt)} />
                  <Bar yAxisId="count" dataKey="buyCount" fill="#805ad5" opacity={0.5} barSize={6} isAnimationActive={false} />
                  <Bar yAxisId="count" dataKey="sellCount" fill="#dd6b20" opacity={0.5} barSize={6} isAnimationActive={false} />
                  <Line yAxisId="price" type="monotone" dataKey="sharePrice" stroke="#e53e3e" strokeWidth={2} dot={false} />
                  <Line yAxisId="price" type="monotone" dataKey="avgPrice" stroke="#3182ce" strokeWidth={2} dot={false} strokeDasharray="4 2" connectNulls={false} />
                  <Line yAxisId="price" type="monotone" dataKey="buyPrice" stroke="transparent" dot={renderBuyDot} activeDot={false} isAnimationActive={false} connectNulls={false} legendType="none" />
                  <Line yAxisId="price" type="monotone" dataKey="sellPrice" stroke="transparent" dot={renderSellDot} activeDot={false} isAnimationActive={false} connectNulls={false} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {adjPnlChartData.length > 1 && (
            <div className="chart-scroll-item" onClick={() => setExpandedChart('pnl')} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)', cursor: 'pointer' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Adjusted P&L</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={adjPnlChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="pnl" stroke="#dd6b20" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {volumeChartData.length > 1 && (
            <div className="chart-scroll-item" onClick={() => setExpandedChart('volume')} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)', cursor: 'pointer' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                <span style={{ color: '#4299e1' }}>Volume</span> / <span style={{ color: '#e53e3e' }}>Price</span>
              </h3>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={volumeChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis yAxisId="vol" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={fmtVolumeAxis} />
                  <YAxis yAxisId="price" orientation="right" hide domain={['auto', 'auto']} />
                  <Tooltip content={volumeChartTooltip(fmt)} />
                  <Bar yAxisId="vol" dataKey="volume" fill="#4299e1" isAnimationActive={false} />
                  <Line yAxisId="price" type="monotone" dataKey="close" stroke="#e53e3e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          </div>
          <button className="chart-scroll-arrow chart-scroll-left" onClick={() => chartScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })} aria-label="Scroll left">&lsaquo;</button>
          <button className="chart-scroll-arrow chart-scroll-right" onClick={() => chartScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })} aria-label="Scroll right">&rsaquo;</button>
        </div>
      )}

      {/* Expanded chart modal */}
      {expandedChart && (
        <div className="cv-chart-modal-overlay" onClick={() => setExpandedChart(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        }}>
          <div className="cv-chart-modal-card" onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '900px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div className="cv-chart-modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                {expandedChart === 'shares' && 'Shares Held'}
                {expandedChart === 'value' && <><span style={{ color: '#3182ce' }}>Invested</span> / <span style={{ color: '#38a169' }}>Portfolio Value</span></>}
                {expandedChart === 'priceAvg' && <><span style={{ color: '#e53e3e' }}>Share Price</span> / <span style={{ color: '#3182ce' }}>Avg Buy Price</span></>}
                {expandedChart === 'pnl' && 'Adjusted P&L'}
                {expandedChart === 'volume' && 'Volume'}
                {expandedChart === 'yearly' && 'Yearly Summary — All Years'}
                {expandedChart === 'yearlyChart' && 'Dividend History Chart'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {expandedChart === 'priceAvg' && (
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={showBuyDots} onChange={e => setShowBuyDots(e.target.checked)} />
                      Dots
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={showBuyBars} onChange={e => setShowBuyBars(e.target.checked)} />
                      Bars
                    </label>
                    {firstBuyDate && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={priceFromFirstBuy} onChange={e => setPriceFromFirstBuy(e.target.checked)} />
                        From 1st buy
                      </label>
                    )}
                  </div>
                )}
                {expandedChart === 'volume' && (
                  <div className="segmented-control" style={{ fontSize: '0.75rem' }}>
                    {(['1m', '3m', '6m', '1y', '2y', 'all'] as VolumeRange[]).map(r => (
                      <button key={r} className={volumeRange === r ? 'active' : ''} onClick={() => setVolumeRange(r)}>
                        {r === 'all' ? 'ALL' : r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setExpandedChart(null)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '1.5rem', lineHeight: 1,
                }}>&times;</button>
              </div>
            </div>
            {expandedChart === 'yearlyChart' ? (() => {
              const finByYear: Record<number, DividendFinancialData> = {};
              financials.forEach(f => { finByYear[f.year] = f; });
              const byYearP: Record<string, DividendPayoutData[]> = {};
              payouts.forEach(p => { const y = p.exDividendDate.substring(0, 4); (byYearP[y] = byYearP[y] || []).push(p); });
              const allYears = financials.length > 0
                ? financials.filter(f => f.year < new Date().getFullYear()).map(f => f.year).sort((a, b) => a - b)
                : [...new Set(payouts.map(p => parseInt(p.exDividendDate.substring(0, 4))))].filter(y => y < new Date().getFullYear()).sort((a, b) => a - b);
              const chartData = allYears.map(y => {
                const fin = finByYear[y];
                const pt = byYearP[String(y)]?.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
                const dps = fin?.dividendPerShare ?? pt ?? 0;
                const eps = fin?.earningsPerShare ?? 0;
                const yld = fin?.dividendYield ?? 0;
                const payout = dps && eps && eps !== 0 ? Math.round(dps / eps * 10000) / 100 : 0;
                return { year: String(y), dps, eps, yield: yld, payout };
              });
              return (
                <div className="cv-chart-modal-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                      <YAxis yAxisId="val" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                      <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => v + '%'} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                        formatter={(v: any, name: any) => {
                          if (name === 'yield' || name === 'payout') return [v.toFixed(2) + '%', name === 'yield' ? 'Yield' : 'Payout'];
                          return ['LKR ' + fmt(v), name === 'dps' ? 'DPS' : 'EPS'];
                        }}
                      />
                      <Line yAxisId="val" type="monotone" dataKey="dps" stroke="#3182ce" strokeWidth={2} dot={{ r: 3 }} name="dps" />
                      <Line yAxisId="val" type="monotone" dataKey="eps" stroke="#38a169" strokeWidth={2} dot={{ r: 3 }} name="eps" />
                      <Line yAxisId="pct" type="monotone" dataKey="yield" stroke="#e53e3e" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" name="yield" />
                      <Line yAxisId="pct" type="monotone" dataKey="payout" stroke="#dd6b20" strokeWidth={1.5} dot={{ r: 3 }} strokeDasharray="4 2" name="payout" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })() : expandedChart === 'yearly' ? (() => {
              const finByYear: Record<number, DividendFinancialData> = {};
              financials.forEach(f => { finByYear[f.year] = f; });
              const byYearP: Record<string, DividendPayoutData[]> = {};
              payouts.forEach(p => { const y = p.exDividendDate.substring(0, 4); (byYearP[y] = byYearP[y] || []).push(p); });
              const allYears = financials.length > 0
                ? financials.filter(f => f.year < new Date().getFullYear()).map(f => f.year).sort((a, b) => b - a)
                : [...new Set(payouts.map(p => parseInt(p.exDividendDate.substring(0, 4))))].filter(y => y < new Date().getFullYear()).sort((a, b) => b - a);
              return (
                <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 600, position: 'sticky', top: 0, background: 'var(--bg-card)' }}></th>
                        {allYears.map(y => <th key={y} style={{ textAlign: 'right', padding: '0.3rem 0.5rem', fontWeight: 600, position: 'sticky', top: 0, background: 'var(--bg-card)' }}>{y}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>DPS</td>
                        {allYears.map(y => {
                          const fin = finByYear[y];
                          const pt = byYearP[String(y)]?.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
                          const val = fin?.dividendPerShare ?? pt;
                          return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{val != null && val > 0 ? fmt(val) : '-'}</td>;
                        })}
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>EPS</td>
                        {allYears.map(y => {
                          const fin = finByYear[y];
                          return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{fin?.earningsPerShare != null ? fmt(fin.earningsPerShare) : '-'}</td>;
                        })}
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Yield %</td>
                        {allYears.map(y => {
                          const fin = finByYear[y];
                          return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{fin?.dividendYield != null ? fin.dividendYield.toFixed(2) + '%' : '-'}</td>;
                        })}
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Payout %</td>
                        {allYears.map(y => {
                          const fin = finByYear[y];
                          const payout = fin?.dividendPerShare && fin?.earningsPerShare && fin.earningsPerShare !== 0
                            ? (fin.dividendPerShare / fin.earningsPerShare * 100) : null;
                          return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{payout != null ? payout.toFixed(2) + '%' : '-'}</td>;
                        })}
                      </tr>
                      <tr>
                        <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Payouts</td>
                        {allYears.map(y => {
                          const count = byYearP[String(y)]?.length || 0;
                          return <td key={y} className="mono" style={{ textAlign: 'right', padding: '0.3rem 0.5rem' }}>{count > 0 ? count : '-'}</td>;
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })() : (
            <div className="cv-chart-modal-chart">
            <ResponsiveContainer width="100%" height="100%">
              {expandedChart === 'shares' ? (
                <LineChart data={sharesChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} formatter={(v: any) => [v, 'Shares']} labelFormatter={l => l} />
                  <Line type="monotone" dataKey="shares" stroke="#805ad5" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              ) : expandedChart === 'value' ? (
                <LineChart data={valueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} formatter={(v: any, n: any) => [`LKR ${fmt(v)}`, n === 'invested' ? 'Invested' : 'Portfolio']} labelFormatter={l => l} />
                  <Line type="monotone" dataKey="invested" stroke="#3182ce" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="portfolio" stroke="#38a169" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              ) : expandedChart === 'priceAvg' ? (
                <ComposedChart data={priceVsAvgChartDataFiltered}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis yAxisId="price" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => v.toFixed(0)} />
                  <YAxis yAxisId="count" orientation="right" hide tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => v.toFixed(0)} />
                  <Tooltip content={priceChartTooltip(fmt)} />
                  {showBuyBars && <Bar yAxisId="count" dataKey="buyCount" fill="#805ad5" opacity={0.5} barSize={10} isAnimationActive={false} />}
                  {showBuyBars && <Bar yAxisId="count" dataKey="sellCount" fill="#dd6b20" opacity={0.5} barSize={10} isAnimationActive={false} />}
                  <Line yAxisId="price" type="monotone" dataKey="sharePrice" stroke="#e53e3e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line yAxisId="price" type="monotone" dataKey="avgPrice" stroke="#3182ce" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" connectNulls={false} />
                  {showBuyDots && <Line yAxisId="price" type="monotone" dataKey="buyPrice" stroke="transparent" dot={renderBuyDot} activeDot={false} isAnimationActive={false} connectNulls={false} legendType="none" />}
                  {showBuyDots && <Line yAxisId="price" type="monotone" dataKey="sellPrice" stroke="transparent" dot={renderSellDot} activeDot={false} isAnimationActive={false} connectNulls={false} legendType="none" />}
                </ComposedChart>
              ) : expandedChart === 'volume' ? (
                <ComposedChart data={volumeChartDataRanged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis yAxisId="vol" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={fmtVolumeAxis} />
                  <YAxis yAxisId="price" orientation="right" hide domain={['auto', 'auto']} />
                  <Tooltip content={volumeChartTooltip(fmt)} />
                  <Bar yAxisId="vol" dataKey="volume" fill="#4299e1" isAnimationActive={false} />
                  <Line yAxisId="price" type="monotone" dataKey="close" stroke="#e53e3e" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              ) : (
                <LineChart data={adjPnlChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} formatter={(v: any) => [`LKR ${fmt(v)}`, 'Adjusted P&L']} labelFormatter={l => l} />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="pnl" stroke="#dd6b20" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
            </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <div className="segmented-control company-view-tabs">
          <button className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')}>
            Transactions ({transactions.length})
          </button>
          <button className={tab === 'dividends' ? 'active' : ''} onClick={() => setTab('dividends')}>
            Dividends ({dividends.length})
          </button>
          <button className={tab === 'realized' ? 'active' : ''} onClick={() => setTab('realized')}>
            Realized Gains ({realizedItems.length})
          </button>
          {dividendPayoutsEnabled && (
            <button className={tab === 'payouts' ? 'active' : ''} onClick={() => setTab('payouts')}>
              Payouts ({payouts.length})
            </button>
          )}
          <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
            Notes
          </button>
        </div>
      </div>

      {tab === 'notes' && code && (
        <NotesView companyCode={code} />
      )}

      {tab === 'transactions' && (
        transactions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No transactions for {code}.</p>
        ) : (
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => sortTx('date')}>Date{txIcon('date')}</th>
                  <th className="sort-header" onClick={() => sortTx('type')}>Type{txIcon('type')}</th>
                  <th className="sort-header text-right" onClick={() => sortTx('count')}>Count{txIcon('count')}</th>
                  <th className="sort-header text-right" onClick={() => sortTx('price')}>Price{txIcon('price')}</th>
                  <th className="sort-header text-right" onClick={() => sortTx('commission')}>Commission{txIcon('commission')}</th>
                  <th className="sort-header text-right" onClick={() => sortTx('total')}>Total{txIcon('total')}</th>
                  {!isReadMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {sortedTx.map(t => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>
                      <span className={`gain-pill ${txTypePillClass(t.type)}`}>
                        {txTypeLabel(t.type)}
                      </span>
                    </td>
                    <td className="text-right mono">{t.count}</td>
                    <td className="text-right mono">{fmt(t.price)}</td>
                    <td className="text-right mono">{fmt(t.commission)}</td>
                    <td className="text-right mono">{fmt(t.count * t.price + t.commission)}</td>
                    {!isReadMode && (
                    <td>
                      <ActionMenu actions={[
                        { label: 'Delete', onClick: () => handleDeleteTx(t.id), danger: true },
                      ]} />
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="portfolio-total">
                  <td colSpan={2}>Summary</td>
                  <td className="text-right mono">
                    {transactions.reduce((s, t) => s + shareDelta(t, adjustedCount(t, shareSplits)), 0)} net
                  </td>
                  <td></td>
                  <td className="text-right mono">
                    {fmt(transactions.reduce((s, t) => s + t.commission, 0))}
                  </td>
                  <td className="text-right mono">
                    {fmt(transactions.reduce((s, t) => s + (t.count * t.price + t.commission) * (isDisposal(t.type) ? -1 : 1), 0))}
                  </td>
                  {!isReadMode && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {tab === 'dividends' && (
        dividends.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No dividends for {code}.</p>
        ) : (
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => sortDiv('date')}>Date{divIcon('date')}</th>
                  <th className="sort-header" onClick={() => sortDiv('type')}>Type{divIcon('type')}</th>
                  <th className="sort-header text-right" onClick={() => sortDiv('amountPerShare')}>Amount/Share{divIcon('amountPerShare')}</th>
                  <th className="sort-header text-right" onClick={() => sortDiv('sharesCount')}>Shares{divIcon('sharesCount')}</th>
                  <th className="sort-header text-right" onClick={() => sortDiv('scripSharesCount')}>Scrip Shares{divIcon('scripSharesCount')}</th>
                  <th className="sort-header text-right" onClick={() => sortDiv('totalValue')}>Total{divIcon('totalValue')}</th>
                  {!isReadMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {sortedDivs.map(d => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>
                      <span className={`gain-pill ${d.type === 'CASH' ? 'gain-pill-cash' : 'gain-pill-scrip'}`}>
                        {d.type}
                      </span>
                    </td>
                    <td className="text-right mono">{d.type === 'CASH' ? fmt(d.amountPerShare) : '\u2014'}</td>
                    <td className="text-right mono">{d.type === 'CASH' ? d.sharesCount : '\u2014'}</td>
                    <td className="text-right mono">{d.type === 'SCRIP' ? d.scripShares : '\u2014'}</td>
                    <td className="text-right mono">{d.type === 'CASH' ? fmt(d.totalAmount) : `${d.scripShares} shares`}</td>
                    {!isReadMode && (
                    <td>
                      <ActionMenu actions={[
                        { label: 'Delete', onClick: () => handleDeleteDiv(d.id), danger: true },
                      ]} />
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="portfolio-total">
                  <td colSpan={5}>Total Cash Dividends</td>
                  <td className="text-right mono">
                    {fmt(dividends.filter(d => d.type === 'CASH').reduce((s, d) => s + d.totalAmount, 0))}
                  </td>
                  {!isReadMode && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {tab === 'payouts' && (
        payouts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No dividend payout data for {code}.</p>
        ) : (() => {
          const byYear: Record<string, DividendPayoutData[]> = {};
          payouts.forEach(p => {
            const y = p.exDividendDate?.substring(0, 4) || 'Unknown';
            (byYear[y] = byYear[y] || []).push(p);
          });
          const sortedYears = Object.keys(byYear).sort().reverse();
          const grandTotal = payouts.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
          return (
            <div>
              <div className="portfolio-table-wrap">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Type</th>
                      <th>XD Date</th>
                      <th className="text-right">XD Price</th>
                      <th className="text-right">XD Yield</th>
                      <th>Announced</th>
                      <th className="text-right">Ann. Price</th>
                      <th className="text-right">Ann. Yield</th>
                      <th>Payment</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const yld = (amt: number | null, price: number | null) => {
                        if (!amt || !price || price === 0) return '-';
                        return ((amt / price) * 100).toFixed(2) + '%';
                      };
                      const payoutRow = (p: DividendPayoutData, showYear?: string) => (
                        <>
                          {showYear !== undefined && <td style={{ fontWeight: showYear ? 600 : undefined }}>{showYear}</td>}
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.dividendType || '-'}</td>
                          <td>{p.exDividendDate || '-'}</td>
                          <td className="text-right mono">{p.priceOnXdDate != null ? fmt(p.priceOnXdDate) : '-'}</td>
                          <td className="text-right mono">{yld(p.amountPerShare, p.priceOnXdDate)}</td>
                          <td>{p.announcementDate || '-'}</td>
                          <td className="text-right mono">{p.priceOnAnnouncementDate != null ? fmt(p.priceOnAnnouncementDate) : '-'}</td>
                          <td className="text-right mono">{yld(p.amountPerShare, p.priceOnAnnouncementDate)}</td>
                          <td>{p.paymentDate || '-'}</td>
                          <td className="text-right mono">{p.amountPerShare != null ? Number(p.amountPerShare).toFixed(2) : '-'}</td>
                        </>
                      );
                      return sortedYears.map(year => {
                        const items = byYear[year];
                        const yearTotal = items.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
                        if (items.length === 1) {
                          return <tr key={year}>{payoutRow(items[0], year)}</tr>;
                        }
                        return (
                          <React.Fragment key={year}>
                            <tr style={{ background: 'var(--bg-thead)' }}>
                              <td style={{ fontWeight: 700 }}>{year}</td>
                              <td colSpan={8} style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{items.length} payouts</td>
                              <td className="text-right mono" style={{ fontWeight: 700 }}>{fmt(yearTotal)}</td>
                            </tr>
                            {items.map((p, i) => (
                              <tr key={`${year}-${i}`}>{payoutRow(p, '')}</tr>
                            ))}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="portfolio-total">
                      <td colSpan={9}>{payouts.length} payouts across {sortedYears.length} years</td>
                      <td className="text-right mono">{fmt(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })()
      )}

      {tab === 'realized' && (
        realizedItems.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No realized gains for {code}.</p>
        ) : (
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => sortRealized('sellDate')}>Sell Date{realizedIcon('sellDate')}</th>
                  <th className="sort-header text-right" onClick={() => sortRealized('sharesSold')}>Shares Sold{realizedIcon('sharesSold')}</th>
                  <th className="sort-header text-right" onClick={() => sortRealized('avgBuyPrice')}>Avg Buy{realizedIcon('avgBuyPrice')}</th>
                  <th className="sort-header text-right" onClick={() => sortRealized('sellPrice')}>Sell Price{realizedIcon('sellPrice')}</th>
                  <th className="sort-header text-right" onClick={() => sortRealized('commission')}>Commission{realizedIcon('commission')}</th>
                  <th className="sort-header text-right" onClick={() => sortRealized('realizedGain')}>Realized Gain{realizedIcon('realizedGain')}</th>
                  <th className="sort-header text-right" onClick={() => sortRealized('gainPercent')}>Gain %{realizedIcon('gainPercent')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRealized.map((r, i) => (
                  <tr key={i}>
                    <td>{r.sellDate}</td>
                    <td className="text-right mono">{r.sharesSold}</td>
                    <td className="text-right mono">{fmt(r.avgBuyPrice)}</td>
                    <td className="text-right mono">{fmt(r.sellPrice)}</td>
                    <td className="text-right mono">{fmt(r.commission)}</td>
                    <td className={`text-right mono ${gainClass(r.realizedGain)}`}>
                      {gainSign(r.realizedGain)}{fmt(r.realizedGain)}
                    </td>
                    <td className="text-right mono">
                      <span className={`gain-pill ${r.gainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                        {gainSign(r.gainPercent)}{fmt(r.gainPercent)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="portfolio-total">
                  <td colSpan={5}>Total Realized</td>
                  <td className={`text-right mono ${gainClass(realizedItems.reduce((s, r) => s + r.realizedGain, 0))}`}>
                    {gainSign(realizedItems.reduce((s, r) => s + r.realizedGain, 0))}{fmt(realizedItems.reduce((s, r) => s + r.realizedGain, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
      <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} companyCode={code} />
    </div>
  );
}
