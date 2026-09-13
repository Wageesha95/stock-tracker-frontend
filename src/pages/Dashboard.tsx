import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardAll, getDividends, getMarketData, getTransactions, getCompanies, getUserSettings, getAvailableDates, getMarketDataByDate, getAllDividendPayouts, getShareSplits, ShareSplitData, invalidate } from '../api';
import { sharesHeldAtDate } from '../utils/splits';
import { filterTxByBroker, filterByBroker } from '../utils/brokers';
import type { DividendPayoutData } from '../api';
import { PortfolioItem, Dividend, RealizedGainItem, Transaction, Company } from '../types';
import { SELL_COMMISSION_RATE, DEFAULT_OPPORTUNITY_COST_RATE } from '../constants';
import { DEFAULT_COLUMNS } from '../components/SettingsPanel';
import CompanyAvatar from '../components/CompanyAvatar';
import MarketDatePicker from '../components/MarketDatePicker';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, PieChart, Pie, Cell } from 'recharts';
import { compareTxDateBuysFirst, compareEventDateBuysFirst } from '../utils/transactionSort';
import { isAcquisition, isDisposal } from '../utils/transactionTypes';

import type { InterestBreakdownItem } from '../api';

type SortKey = 'companyCode' | 'sharesHeld' | 'avgBuyPrice' | 'lastTrade' | 'currentValue' | 'totalInvested' | 'unrealizedGain' | 'unrealizedGainPercent' | 'unrealizedDayGain' | 'changePercent' | 'realizedGain';
type SortDir = 'asc' | 'desc';

export default function Dashboard() {
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [realizedItems, setRealizedItems] = useState<RealizedGainItem[]>([]);
  const [origDividends, setOrigDividends] = useState<Dividend[]>([]);
  const [origRealizedItems, setOrigRealizedItems] = useState<RealizedGainItem[]>([]);
  const [opportunityCost, setOpportunityCost] = useState(0);
  // Annual % the user reckons their money could have earned elsewhere; drives every
  // accrued-interest figure on this page.
  const [opportunityCostRate, setOpportunityCostRate] = useState(DEFAULT_OPPORTUNITY_COST_RATE);
  const [interestBreakdown, setInterestBreakdown] = useState<InterestBreakdownItem[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<'none' | 'holdings' | 'invested' | 'realized' | 'realizedProfit' | 'realizedLoss' | 'netRealized' | 'interest' | 'profit' | 'loss' | 'netUnrealized' | 'dayProfit' | 'dayLoss' | 'netDay' | 'cashDiv' | 'scripDiv' | 'adjustedPnl' | 'totalPnl'>('none');
  const [expandedInterest, setExpandedInterest] = useState<Set<string>>(new Set());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shareSplits, setShareSplits] = useState<ShareSplitData[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [dividendPayouts, setDividendPayouts] = useState<DividendPayoutData[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestTradeDate, setLatestTradeDate] = useState('');
  const [originalLatestDate, setOriginalLatestDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('companyCode');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [realizedViewMode, setRealizedViewMode] = useState<'list' | 'group'>('list');
  const [expandedRealizedCompanies, setExpandedRealizedCompanies] = useState<Set<string>>(new Set());
  const [subSortKey, setSubSortKey] = useState<string>('');
  const [subSortDir, setSubSortDir] = useState<SortDir>('desc');
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [historicalMode, setHistoricalMode] = useState(false);

  const colVisible = (table: string, col: string) => {
    const cols = tableColumns[table] || DEFAULT_COLUMNS[table];
    return !cols || cols.includes(col);
  };

  const loadData = useCallback(() => {
    // Settings first so we know the broker filter before requesting the dashboard.
    return getUserSettings().then(settings => {
      const dataBrokers = settings.selectedDataBrokerIds || [];
      setOpportunityCostRate(settings.opportunityCostRate ?? DEFAULT_OPPORTUNITY_COST_RATE);
      return Promise.all([getDashboardAll(dataBrokers), getDividends(), getMarketData(), getTransactions(), getCompanies(), getAvailableDates(), getAllDividendPayouts().catch(() => [] as DividendPayoutData[]), getShareSplits()])
        .then(([dash, d, md, txns, comps, dates, payouts, splits]) => {
          setPortfolio(dash.portfolio);
          // Dividends carry a brokerId — filter them to match the broker data filter.
          const filteredDivs = filterByBroker(d, dataBrokers);
          setDividends(filteredDivs);
          setOrigDividends(filteredDivs);
          setRealizedItems(dash.realizedItems);
          setOrigRealizedItems(dash.realizedItems);
          setOpportunityCost(dash.opportunityCost);
          setInterestBreakdown(dash.interestBreakdown);
          // Client-side timeline uses raw transactions — apply the same broker filter
          // (and exclude disabled) the backend applied to the computed dashboard.
          setTransactions(filterTxByBroker(txns.filter(t => !t.disabled), dataBrokers));
          setShareSplits(splits);
          setAllCompanies(comps);
          setDividendPayouts(payouts);
          setTableColumns(settings.tableColumns || {});
          setAvailableDates(dates);
          if (md.length > 0) {
            const latest = md.reduce((a, b) => a.tradeDate > b.tradeDate ? a : b);
            setLatestTradeDate(latest.tradeDate);
            setOriginalLatestDate(latest.tradeDate);
          }
        });
    }).catch(console.error);
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const loadHistoricalData = useCallback(async (finalDate: string) => {
    const md = await getMarketDataByDate(finalDate);
    const priceMap: Record<string, number> = {};
    md.forEach(m => { priceMap[m.companyCode] = m.lastTrade; });
    const txUpToDate = transactions.filter(t => t.date <= finalDate);
    const grouped: Record<string, typeof txUpToDate> = {};
    txUpToDate.forEach(t => { (grouped[t.companyCode] = grouped[t.companyCode] || []).push(t); });
    const histPortfolio: PortfolioItem[] = [];
    for (const [code, txns] of Object.entries(grouped)) {
      const sorted = [...txns].sort(compareTxDateBuysFirst);
      let shares = 0, cost = 0, realized = 0;
      for (const t of sorted) {
        if (isAcquisition(t.type)) {
          cost += t.count * t.price + t.commission;
          shares += t.count;
        } else if (t.type === 'TRANSFER_OUT') {
          // Not a disposal: removes exactly the cost its own price represents and
          // realizes nothing, so an out/in pair leaves cost and avg untouched.
          cost -= t.count * t.price;
          shares -= t.count;
        } else if (t.type === 'SELL') {
          const avg = shares > 0 ? cost / shares : 0;
          const sellRev = t.count * t.price - t.commission;
          realized += sellRev - avg * t.count;
          cost -= avg * t.count;
          shares -= t.count;
        }
      }
      if (shares <= 0) continue;
      const avgBuy = shares > 0 ? cost / shares : 0;
      const price = priceMap[code] || 0;
      const currentValue = shares * price;
      const totalInv = shares * avgBuy;
      const unrealized = currentValue - totalInv;
      const unrealizedPct = totalInv !== 0 ? (unrealized / totalInv) * 100 : 0;
      const comp = allCompanies.find(c => c.code === code);
      const mdItem = md.find(m => m.companyCode === code);
      histPortfolio.push({
        companyCode: code,
        companyName: comp?.name || mdItem?.companyName || code,
        sharesHeld: shares,
        avgBuyPrice: avgBuy,
        lastTrade: price,
        change: mdItem?.change || 0,
        changePercent: mdItem?.changePercent || 0,
        currentValue,
        totalInvested: totalInv,
        unrealizedGain: unrealized,
        unrealizedGainPercent: unrealizedPct,
        unrealizedDayGain: currentValue * (mdItem?.changePercent || 0) / 100,
        realizedGain: realized,
      });
    }
    setPortfolio(histPortfolio);
    setLatestTradeDate(finalDate);
    setDividends(origDividends.filter(d => d.date <= finalDate));
    setRealizedItems(origRealizedItems.filter(r => r.sellDate <= finalDate));

    // Per-lot FIFO opportunity cost up to the selected date — produces both
    // the total and the per-lot breakdown rendered in the Interest table, so
    // historical mode and live mode stay consistent.
    const annualRate = opportunityCostRate / 100;
    const sortedAllTx = [...txUpToDate].sort(compareTxDateBuysFirst);
    type HistLot = {
      buyDate: string;
      shares: number;
      remaining: number;
      costPerShare: number;
      lotCost: number;
      status: 'held' | 'sold' | 'partial' | 'transferred';
      endDate: string | null;
      accruedInterest: number;
    };
    const allLotsByCode: Record<string, HistLot[]> = {};
    const activeLotsByCode: Record<string, HistLot[]> = {};
    let totalInterest = 0;
    let lastAccrualMs: number | null = null;
    const accrueTo = (dateStr: string) => {
      const ms = new Date(dateStr).getTime();
      if (lastAccrualMs === null) { lastAccrualMs = ms; return; }
      const days = (ms - lastAccrualMs) / 86400000;
      if (days > 0) {
        for (const code of Object.keys(activeLotsByCode)) {
          for (const lot of activeLotsByCode[code]) {
            const inc = lot.remaining * lot.costPerShare * annualRate * days / 365;
            lot.accruedInterest += inc;
            totalInterest += inc;
          }
        }
      }
      lastAccrualMs = ms;
    };

    for (const t of sortedAllTx) {
      accrueTo(t.date);
      const code = t.companyCode;
      if (!allLotsByCode[code]) allLotsByCode[code] = [];
      if (!activeLotsByCode[code]) activeLotsByCode[code] = [];
      const open = activeLotsByCode[code];
      if (isAcquisition(t.type)) {
        if (t.count > 0) {
          const lotCost = t.count * t.price + t.commission;
          // Transferred shares keep the date their money was committed, and are
          // credited up front with the interest built up before the move. The
          // matching TRANSFER_OUT hands that same amount over, so nothing doubles.
          const opened = t.costBasisDate || t.date;
          const carriedDays = (new Date(t.date).getTime() - new Date(opened).getTime()) / 86400000;
          const carried = carriedDays > 0 ? lotCost * annualRate * carriedDays / 365 : 0;
          const lot: HistLot = {
            buyDate: opened,
            shares: t.count,
            remaining: t.count,
            costPerShare: lotCost / t.count,
            lotCost,
            status: 'held',
            endDate: null,
            accruedInterest: carried,
          };
          totalInterest += carried;
          allLotsByCode[code].push(lot);
          open.push(lot);
        }
      } else if (isDisposal(t.type)) {
        // TRANSFER_OUT consumes lots the same way a SELL does, so the out/in pair
        // stays balanced even when a broker filter hides one of the two legs.
        const transferred = t.type === 'TRANSFER_OUT';
        let toSell = t.count;
        while (toSell > 0 && open.length > 0) {
          const lot = open[0];
          if (lot.remaining <= toSell) {
            toSell -= lot.remaining;
            if (transferred) {
              // Interest leaves with the shares — the TRANSFER_IN lot already took it.
              totalInterest -= lot.accruedInterest;
              lot.accruedInterest = 0;
            }
            lot.remaining = 0;
            lot.endDate = t.date;
            lot.status = transferred ? 'transferred' : 'sold';
            open.shift();
          } else {
            if (transferred) {
              const movedShare = lot.accruedInterest * (toSell / lot.remaining);
              totalInterest -= movedShare;
              lot.accruedInterest -= movedShare;
            }
            lot.remaining -= toSell;
            lot.status = 'partial';
            toSell = 0;
          }
        }
      }
    }
    accrueTo(finalDate);
    setOpportunityCost(totalInterest);

    // Build the per-lot breakdown in the same shape as the backend response.
    const finalMs = new Date(finalDate).getTime();
    const histBreakdown: InterestBreakdownItem[] = [];
    for (const code of Object.keys(allLotsByCode)) {
      const lots = allLotsByCode[code];
      if (lots.length === 0) continue;
      let currentCost = 0;
      let companyInterest = 0;
      for (const lot of lots) {
        currentCost += lot.remaining * lot.costPerShare;
        companyInterest += lot.accruedInterest;
      }
      if (currentCost <= 0 && companyInterest < 0.005) continue;

      const comp = allCompanies.find(c => c.code === code);
      const firstDate = lots[0].buyDate;
      const days = Math.max(0, Math.round((finalMs - new Date(firstDate).getTime()) / 86400000));

      histBreakdown.push({
        companyCode: code,
        companyName: comp?.name || code,
        date: firstDate,
        amount: currentCost,
        days,
        interest: companyInterest,
        lots: lots.map(l => {
          const endMs = l.endDate ? new Date(l.endDate).getTime() : finalMs;
          return {
            buyDate: l.buyDate,
            shares: l.shares,
            remaining: l.remaining,
            costPerShare: l.costPerShare,
            lotCost: l.lotCost,
            status: l.status,
            endDate: l.endDate,
            days: Math.max(0, Math.round((endMs - new Date(l.buyDate).getTime()) / 86400000)),
            interest: l.accruedInterest,
          };
        }),
      });
    }
    histBreakdown.sort((a, b) => b.interest - a.interest);
    setInterestBreakdown(histBreakdown);
  }, [transactions, allCompanies, origDividends, origRealizedItems, opportunityCostRate]);

  const handleRefresh = () => {
    setRefreshing(true);
    if (historicalMode && selectedDate) {
      // Reload data for the selected historical date.
      invalidate(`market-by-date:${selectedDate}`, 'transactions', 'companies', 'dividends', 'market', 'market-dates');
      loadHistoricalData(selectedDate).catch(console.error).finally(() => setRefreshing(false));
    } else {
      invalidate('dashboard', 'dividends');
      loadData().finally(() => setRefreshing(false));
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  const filtered = portfolio.filter(p => p.sharesHeld > 0);

  // Announced dividends with a future XD date for companies currently held —
  // these are payouts the user could still receive, ordered by XD date.
  const upcomingPayouts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sharesByCode: Record<string, number> = {};
    filtered.forEach(p => { sharesByCode[p.companyCode] = p.sharesHeld; });
    return dividendPayouts
      .filter(p => p.exDividendDate >= today && sharesByCode[p.companyCode] > 0)
      .map(p => ({
        ...p,
        sharesHeld: sharesByCode[p.companyCode],
        estimatedAmount: p.amountPerShare != null ? p.amountPerShare * sharesByCode[p.companyCode] : null,
      }))
      .sort((a, b) => a.exDividendDate.localeCompare(b.exDividendDate));
  }, [dividendPayouts, filtered]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const [companySearch, setCompanySearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  useEffect(() => {
    setTableSearch('');
    setSubSortKey('');
    setSubSortDir('desc');
    if (activeSection !== 'none') {
      setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [activeSection]);
  const tableSearchBar = (count: number) => count >= 5 ? (
    <input className="search-bar" value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Search..." />
  ) : null;
  const ms = (s: string) => tableSearch === '' || s.toLowerCase().includes(tableSearch.toLowerCase());
  const companySuggestions = companySearch.length > 0
    ? allCompanies.filter(c =>
        c.code.toLowerCase().includes(companySearch.toLowerCase()) ||
        c.name.toLowerCase().includes(companySearch.toLowerCase())
      ).slice(0, 8)
    : [];
  const holdingsFiltered = useMemo(() => {
    if (tableSearch === '') return sorted;
    return sorted.filter(p => ms(p.companyCode) || ms(p.companyName));
  }, [sorted, tableSearch]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'companyCode' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const handleSubSort = (key: string) => {
    if (subSortKey === key) {
      setSubSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSubSortKey(key);
      setSubSortDir('desc');
    }
  };

  const subSortIcon = (key: string) => {
    if (subSortKey !== key) return ' \u2195';
    return subSortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const applySubSort = <T extends Record<string, any>>(items: T[], defaultKey: string, defaultDir: SortDir = 'desc'): T[] => {
    const key = subSortKey || defaultKey;
    const dir = subSortKey ? subSortDir : defaultDir;
    return [...items].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === 'asc' ? cmp : -cmp;
    });
  };

  const totalValue = filtered.reduce((s, p) => s + p.currentValue, 0);
  const totalInvested = filtered.reduce((s, p) => s + p.totalInvested, 0);
  const totalGain = filtered.reduce((s, p) => s + (p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested), 0);
  const totalDayGain = filtered.reduce((s, p) => s + p.unrealizedDayGain, 0);
  const totalRealized = realizedItems.reduce((s, r) => s + r.realizedGain, 0);
  const totalGainPct = totalInvested !== 0 ? (totalGain / totalInvested) * 100 : 0;
  const totalDayGainPct = totalValue !== 0 ? (totalDayGain / (totalValue - totalDayGain)) * 100 : 0;
  // Re-express each cash dividend's shares in the split basis in effect on its XD
  // date (split-aware, all transaction types), rebasing per-share gross so the net
  // total stays invariant. Keeps dividend share counts consistent with every other
  // split-adjusted view. Falls back to stored values when the XD holding isn't
  // derivable (no XD date or no transaction history for the company).
  const divShares = (d: Dividend): number => {
    if (d.type !== 'CASH' || !d.xdDate) return d.shares;
    const held = sharesHeldAtDate(
      transactions.filter(t => t.companyCode === d.companyCode),
      shareSplits.filter(s => s.companyCode === d.companyCode),
      d.xdDate,
    );
    return held > 0 ? held : d.shares;
  };
  const divAmountPerShare = (d: Dividend): number => {
    const shares = divShares(d);
    return shares > 0 ? (d.amount * d.shares) / shares : d.amount;
  };

  const cashDividends = dividends.filter(d => d.type === 'CASH');
  const scripDividends = dividends.filter(d => d.type === 'SCRIP');
  const totalDividends = cashDividends.reduce((s, d) => s + d.totalAmount, 0);
  const totalScripShares = scripDividends.reduce((s, d) => s + d.scripShares, 0);
  const adjGain = (p: PortfolioItem) => p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested;
  const profitItems = filtered.filter(p => adjGain(p) > 0);
  const lossItems = filtered.filter(p => adjGain(p) < 0);
  const totalProfit = profitItems.reduce((s, p) => s + adjGain(p), 0);
  const totalLoss = lossItems.reduce((s, p) => s + adjGain(p), 0);
  const dayProfitItems = filtered.filter(p => p.unrealizedDayGain > 0);
  const dayLossItems = filtered.filter(p => p.unrealizedDayGain < 0);
  const totalDayProfit = dayProfitItems.reduce((s, p) => s + p.unrealizedDayGain, 0);
  const totalDayLoss = dayLossItems.reduce((s, p) => s + p.unrealizedDayGain, 0);
  const realizedProfitItems = realizedItems.filter(r => r.realizedGain > 0);
  const realizedLossItems = realizedItems.filter(r => r.realizedGain < 0);
  const totalRealizedProfit = realizedProfitItems.reduce((s, r) => s + r.realizedGain, 0);
  const totalRealizedLoss = realizedLossItems.reduce((s, r) => s + r.realizedGain, 0);
  const totalPnl = totalGain + totalRealized + totalDividends;
  const adjustedPnl = totalPnl - opportunityCost;

  const loadingPulse = <span className="loading-pulse" />;
  const v = (content: React.ReactNode) => loading || refreshing ? loadingPulse : content;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: 'transparent',
              border: '1.5px solid var(--border-input)',
              borderRadius: '8px',
              padding: '0.35rem 0.75rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
            title="Refresh data"
          >
            {refreshing ? 'Refreshing...' : '\u21BB Refresh'}
          </button>
          {historicalMode && (
            <span style={{ fontSize: '0.75rem', color: '#3182ce', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              Viewing {selectedDate}
              <button
                onClick={() => {
                  setSelectedDate('');
                  setHistoricalMode(false);
                  setRefreshing(true);
                  invalidate('dashboard-all', 'dividends', 'market', 'transactions', 'companies', 'settings', 'market-dates');
                  loadData().finally(() => setRefreshing(false));
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3182ce', fontSize: '0.85rem', padding: '0 0.2rem' }}
                title="Back to today"
              >&times;</button>
            </span>
          )}
        </div>
        <div className="dashboard-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MarketDatePicker
            availableDates={availableDates}
            selectedDate={selectedDate}
            onSelect={async (finalDate) => {
              if (finalDate === originalLatestDate) {
                setSelectedDate('');
                setHistoricalMode(false);
                setRefreshing(true);
                await new Promise(r => setTimeout(r, 0));
                invalidate('dashboard-all', 'dividends', 'market', 'transactions', 'companies', 'settings', 'market-dates');
                loadData().finally(() => setRefreshing(false));
                return;
              }
              setSelectedDate(finalDate);
              setHistoricalMode(true);
              setRefreshing(true);
              await new Promise(r => setTimeout(r, 0));
              loadHistoricalData(finalDate)
                .catch(console.error)
                .finally(() => setRefreshing(false));
            }}
          />
          <div style={{ position: 'relative' }}>
            <input
              className="search-bar"
              value={companySearch}
            onChange={e => { setCompanySearch(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Find company..."
            style={{ width: '280px' }}
          />
          {showSuggestions && companySuggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 100,
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: '8px', boxShadow: 'var(--shadow-dropdown)',
              width: '280px', maxHeight: '300px', overflow: 'auto', marginTop: '0.25rem',
            }}>
              {companySuggestions.map(c => (
                <div
                  key={c.code}
                  onMouseDown={() => { navigate(`/company/${c.code}`); setCompanySearch(''); setShowSuggestions(false); }}
                  style={{
                    padding: '0.5rem 0.75rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-dropdown-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <CompanyAvatar code={c.code} size={24} />
                  <span style={{ fontWeight: 600 }}>{c.code}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Row 1: Portfolio + Summary */}
      <div className="dashboard-groups">
        <div className="card-group">
          <div className="card-group-label">Portfolio</div>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => !loading && setActiveSection(s => s === 'holdings' ? 'none' : 'holdings')} title="Click to show/hide holdings">
              <h3>{'\uD83D\uDCB0'} Portfolio Value</h3>
              <p className="stat-value">{v(<>LKR {fmt(totalValue)}</>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{filtered.length} companies</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => !loading && setActiveSection(s => s === 'invested' ? 'none' : 'invested')} title="Click to show investment timeline">
              <h3>{'\uD83D\uDCB3'} Total Invested</h3>
              <p className="stat-value">{v(<>LKR {fmt(totalInvested)}</>)}</p>
            </div>
          </div>
        </div>

        <div className="card-group">
          <div className="card-group-label">Unrealized</div>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: loading ? '#3182ce' : totalGain >= 0 ? '#38a169' : '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'netUnrealized' ? 'none' : 'netUnrealized')} title="Click to show all unrealized">
              <h3>Net</h3>
              <p className="stat-value">{v(<span className={gainClass(totalGain)}>{gainSign(totalGain)}LKR {fmt(totalGain)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{gainSign(totalGainPct)}{fmt(totalGainPct)}%</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#38a169' }} onClick={() => !loading && setActiveSection(s => s === 'profit' ? 'none' : 'profit')} title="Click to show unrealized profits">
              <h3>Profit</h3>
              <p className="stat-value">{v(<span className="gain-positive">+LKR {fmt(totalProfit)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{profitItems.length} companies</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'loss' ? 'none' : 'loss')} title="Click to show unrealized losses">
              <h3>Loss</h3>
              <p className="stat-value">{v(<span className="gain-negative">LKR {fmt(totalLoss)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{lossItems.length} companies</>)}</small>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Dividends + Realized */}
      <div className="dashboard-groups">
        <div className="card-group">
          <div className="card-group-label">Dividends</div>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#38a169' }} onClick={() => !loading && setActiveSection(s => s === 'cashDiv' ? 'none' : 'cashDiv')} title="Click to show cash dividends">
              <h3>{'\uD83D\uDCB5'} Cash</h3>
              <p className="stat-value">{v(<span className="gain-positive">LKR {fmt(totalDividends)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{cashDividends.length} payments</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#805ad5' }} onClick={() => !loading && setActiveSection(s => s === 'scripDiv' ? 'none' : 'scripDiv')} title="Click to show scrip dividends">
              <h3>{'\uD83C\uDFAB'} Scrip</h3>
              <p className="stat-value">{v(<span style={{ color: '#805ad5' }}>{totalScripShares} shares</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{scripDividends.length} issues</>)}</small>
            </div>
          </div>
        </div>
        <div className="card-group">
          <div className="card-group-label">Realized</div>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: loading ? '#3182ce' : totalRealized >= 0 ? '#38a169' : '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'netRealized' ? 'none' : 'netRealized')} title="Click to show all realized">
              <h3>Net</h3>
              <p className="stat-value">{v(<span className={gainClass(totalRealized)}>{gainSign(totalRealized)}LKR {fmt(totalRealized)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{realizedItems.length} trades</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#38a169' }} onClick={() => !loading && setActiveSection(s => s === 'realizedProfit' ? 'none' : 'realizedProfit')} title="Click to show realized profits">
              <h3>Profit</h3>
              <p className="stat-value">{v(<span className="gain-positive">+LKR {fmt(totalRealizedProfit)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{realizedProfitItems.length} trades</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'realizedLoss' ? 'none' : 'realizedLoss')} title="Click to show realized losses">
              <h3>Loss</h3>
              <p className="stat-value">{v(<span className="gain-negative">LKR {fmt(totalRealizedLoss)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{realizedLossItems.length} trades</>)}</small>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Summary + Day Change */}
      <div className="dashboard-groups">
        <div className="card-group">
          <div className="card-group-label">Summary</div>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: loading ? '#3182ce' : totalPnl >= 0 ? '#38a169' : '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'totalPnl' ? 'none' : 'totalPnl')} title="Click to show Total P&L timeline">
              <h3>{'\uD83E\uDDEE'} Total P&L</h3>
              <p className="stat-value">{v(<span className={gainClass(totalPnl)}>{gainSign(totalPnl)}LKR {fmt(totalPnl)}</span>)}</p>
              <small style={{ color: '#718096' }}>Unr. + Real. + Div.</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#d69e2e' }} onClick={() => !loading && setActiveSection(s => s === 'interest' ? 'none' : 'interest')} title="Click to see per-transaction interest breakdown">
              <h3>{'\u231B'} Opp. Cost</h3>
              <p className="stat-value">{v(<span style={{ color: '#d69e2e' }}>LKR {fmt(opportunityCost)}</span>)}</p>
              <small style={{ color: '#718096' }}>{opportunityCostRate}% FD rate</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: loading ? '#3182ce' : adjustedPnl >= 0 ? '#38a169' : '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'adjustedPnl' ? 'none' : 'adjustedPnl')} title="Click to show Adjusted P&L timeline">
              <h3>{adjustedPnl >= 0 ? '\uD83C\uDFAF' : '\u26A0\uFE0F'} Adjusted P&L</h3>
              <p className="stat-value">{v(<span className={gainClass(adjustedPnl)}>{gainSign(adjustedPnl)}LKR {fmt(adjustedPnl)}</span>)}</p>
              <small style={{ color: '#718096' }}>P&L - Opportunity Cost</small>
            </div>
          </div>
        </div>
        <div className="card-group">
          <div className="card-group-label">Day Change{latestTradeDate ? ` (${latestTradeDate})` : ''}</div>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: loading ? '#3182ce' : totalDayGain >= 0 ? '#38a169' : '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'netDay' ? 'none' : 'netDay')} title="Click to show all day changes">
              <h3>Net</h3>
              <p className="stat-value">{v(<span className={gainClass(totalDayGain)}>{gainSign(totalDayGain)}LKR {fmt(totalDayGain)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{gainSign(totalDayGainPct)}{fmt(totalDayGainPct)}%</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#38a169' }} onClick={() => !loading && setActiveSection(s => s === 'dayProfit' ? 'none' : 'dayProfit')} title="Click to show day gainers">
              <h3>Profit</h3>
              <p className="stat-value">{v(<span className="gain-positive">+LKR {fmt(totalDayProfit)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{dayProfitItems.length} companies</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'dayLoss' ? 'none' : 'dayLoss')} title="Click to show day losers">
              <h3>Loss</h3>
              <p className="stat-value">{v(<span className="gain-negative">LKR {fmt(totalDayLoss)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{dayLossItems.length} companies</>)}</small>
            </div>
          </div>
        </div>
      </div>

      {activeSection === 'adjustedPnl' && !loading && filtered.length > 0 && (() => {
        // Build adjusted P&L timeline: unrealized + realized + dividends - opportunity cost
        // In historical mode, cap events at the selected date so future-dated
        // transactions don't appear on the timeline.
        const cutoff = historicalMode && selectedDate ? selectedDate : null;
        const events: { date: string; type: 'tx' | 'div' | 'realized'; data: any }[] = [];
        transactions.filter(t => !cutoff || t.date <= cutoff).forEach(t => events.push({ date: t.date, type: 'tx', data: t }));
        dividends.filter(d => d.type === 'CASH').forEach(d => events.push({ date: d.date, type: 'div', data: d }));
        realizedItems.forEach(r => events.push({ date: r.sellDate, type: 'realized', data: r }));
        events.sort(compareEventDateBuysFirst);

        const latestPriceMap: Record<string, number> = {};
        filtered.forEach(p => { latestPriceMap[p.companyCode] = p.lastTrade; });

        // Per-company FIFO lot queues. Opportunity-cost interest accrues on
        // each individual lot for exactly the time it remains in the queue.
        const companyLots: Record<string, { count: number; costPerShare: number }[]> = {};
        let cumRealizedGain = 0;
        let cumDividends = 0;
        const annualRate = opportunityCostRate / 100;
        let cumInterest = 0;
        let lastAccrualMs: number | null = null;

        const pnlPoints: { date: string; pnl: number }[] = [];

        const accrueTo = (dateStr: string) => {
          const ms = new Date(dateStr).getTime();
          if (lastAccrualMs === null) { lastAccrualMs = ms; return; }
          const days = (ms - lastAccrualMs) / 86400000;
          if (days > 0) {
            for (const code of Object.keys(companyLots)) {
              for (const lot of companyLots[code]) {
                cumInterest += lot.count * lot.costPerShare * annualRate * days / 365;
              }
            }
          }
          lastAccrualMs = ms;
        };

        for (const ev of events) {
          accrueTo(ev.date);

          if (ev.type === 'tx') {
            const t = ev.data;
            const code = t.companyCode;
            if (!companyLots[code]) companyLots[code] = [];
            const lots = companyLots[code];
            if (isAcquisition(t.type)) {
              if (t.count > 0) {
                const lotCost = t.count * t.price + t.commission;
                lots.push({ count: t.count, costPerShare: lotCost / t.count });
              }
            } else if (isDisposal(t.type)) {
              // TRANSFER_OUT consumes lots like a SELL, keeping the out/in pair
              // balanced even when a broker filter hides one leg.
              let toSell = t.count;
              while (toSell > 0 && lots.length > 0) {
                const lot = lots[0];
                if (lot.count <= toSell) { toSell -= lot.count; lots.shift(); }
                else { lot.count -= toSell; toSell = 0; }
              }
            }
          } else if (ev.type === 'div') {
            cumDividends += ev.data.totalAmount;
          } else if (ev.type === 'realized') {
            cumRealizedGain += ev.data.realizedGain;
          }

          // Compute unrealized gain at this point (sum across all lots)
          let totalValue = 0;
          let totalInvested = 0;
          for (const c of Object.keys(companyLots)) {
            let shares = 0;
            let cost = 0;
            for (const lot of companyLots[c]) { shares += lot.count; cost += lot.count * lot.costPerShare; }
            totalValue += shares * (latestPriceMap[c] || 0);
            totalInvested += cost;
          }
          const unrealized = totalValue - totalValue * SELL_COMMISSION_RATE - totalInvested;
          const adjPnl = unrealized + cumRealizedGain + cumDividends - cumInterest;

          pnlPoints.push({
            date: ev.date,
            pnl: Math.round(adjPnl * 10000) / 10000,
          });
        }

        // Merge same-date (keep last)
        const merged = pnlPoints.reduce<typeof pnlPoints>((acc, item) => {
          if (acc.length > 0 && acc[acc.length - 1].date === item.date) {
            acc[acc.length - 1].pnl = item.pnl;
          } else {
            acc.push(item);
          }
          return acc;
        }, []);

        return merged.length > 1 ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2>Adjusted P&L Timeline</h2>
            <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)' }}>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }}
                    formatter={(value: any) => [`LKR ${fmt(value)}`, 'Adjusted P&L']}
                    labelFormatter={l => `Date: ${l}`}
                  />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="pnl" stroke="#dd6b20" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null;
      })()}

      {activeSection === 'totalPnl' && !loading && filtered.length > 0 && (() => {
        // Total P&L timeline: unrealized + realized + dividends (no opportunity cost)
        const cutoff = historicalMode && selectedDate ? selectedDate : null;
        const events: { date: string; type: 'tx' | 'div' | 'realized'; data: any }[] = [];
        transactions.filter(t => !cutoff || t.date <= cutoff).forEach(t => events.push({ date: t.date, type: 'tx', data: t }));
        dividends.filter(d => d.type === 'CASH').forEach(d => events.push({ date: d.date, type: 'div', data: d }));
        realizedItems.forEach(r => events.push({ date: r.sellDate, type: 'realized', data: r }));
        events.sort(compareEventDateBuysFirst);

        const latestPriceMap: Record<string, number> = {};
        filtered.forEach(p => { latestPriceMap[p.companyCode] = p.lastTrade; });

        const companyState: Record<string, { shares: number; cost: number }> = {};
        let cumRealizedGain = 0;
        let cumDividends = 0;
        const pnlPoints: { date: string; pnl: number }[] = [];

        for (const ev of events) {
          if (ev.type === 'tx') {
            const t = ev.data;
            const code = t.companyCode;
            if (!companyState[code]) companyState[code] = { shares: 0, cost: 0 };
            const st = companyState[code];
            if (isAcquisition(t.type)) {
              st.cost += t.count * t.price + t.commission;
              st.shares += t.count;
            } else if (t.type === 'TRANSFER_OUT') {
              // Not a disposal: removes exactly the cost its own price represents.
              st.cost -= t.count * t.price;
              st.shares -= t.count;
            } else if (t.type === 'SELL') {
              const avg = st.shares > 0 ? st.cost / st.shares : 0;
              st.cost -= avg * t.count;
              st.shares -= t.count;
            }
          } else if (ev.type === 'div') {
            cumDividends += ev.data.totalAmount;
          } else if (ev.type === 'realized') {
            cumRealizedGain += ev.data.realizedGain;
          }

          let totalValue = 0;
          let totalInvested = 0;
          for (const c of Object.keys(companyState)) {
            const s = companyState[c];
            totalValue += s.shares * (latestPriceMap[c] || 0);
            totalInvested += s.cost;
          }
          const unrealized = totalValue - totalValue * SELL_COMMISSION_RATE - totalInvested;
          pnlPoints.push({
            date: ev.date,
            pnl: Math.round((unrealized + cumRealizedGain + cumDividends) * 10000) / 10000,
          });
        }

        const merged = pnlPoints.reduce<typeof pnlPoints>((acc, item) => {
          if (acc.length > 0 && acc[acc.length - 1].date === item.date) {
            acc[acc.length - 1].pnl = item.pnl;
          } else {
            acc.push(item);
          }
          return acc;
        }, []);

        return merged.length > 1 ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <h2>Total P&L Timeline</h2>
            <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)' }}>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }}
                    formatter={(value: any) => [`LKR ${fmt(value)}`, 'Total P&L']}
                    labelFormatter={l => `Date: ${l}`}
                  />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="pnl" stroke="#3182ce" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null;
      })()}

      <div ref={sectionRef} />
      {activeSection === 'invested' && (() => {
        const cutoff = historicalMode && selectedDate ? selectedDate : null;
        const sorted = [...transactions]
          .filter(t => !cutoff || t.date <= cutoff)
          .sort((a, b) => a.date.localeCompare(b.date));
        let netCashOut = 0;
        const chartData = sorted.map(t => {
          // This line tracks cash, not shares. A broker-to-broker transfer moves no
          // money, so neither leg shifts it — counting TRANSFER_IN as cash out would
          // invent an investment that never happened.
          if (t.type === 'TRANSFER_IN' || t.type === 'TRANSFER_OUT') {
            // no cash movement
          } else if (isAcquisition(t.type)) {
            netCashOut += t.count * t.price + t.commission;
          } else if (t.type === 'SELL') {
            netCashOut -= t.count * t.price - t.commission;
          } else {
            throw new Error(`Unknown transaction type: ${t.type}`);
          }
          return { date: t.date, invested: Math.round(netCashOut * 10000) / 10000 };
        });
        // Merge same-date entries (keep last cumulative value per date)
        const merged = chartData.reduce<{ date: string; invested: number }[]>((acc, item) => {
          if (acc.length > 0 && acc[acc.length - 1].date === item.date) {
            acc[acc.length - 1].invested = item.invested;
          } else {
            acc.push(item);
          }
          return acc;
        }, []);
        return (
          <>
            <h2 style={{ marginTop: '2rem' }}>Investment Timeline</h2>
            <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)' }}>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={merged}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={d => d.substring(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.85rem' }}
                    formatter={(value: any) => [`LKR ${fmt(value)}`, 'Cumulative Invested']}
                    labelFormatter={l => `Date: ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="invested"
                    stroke="#3182ce"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#3182ce' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        );
      })()}

      {activeSection === 'interest' && (() => {
        // Backend now returns one row per company with `lots[]` for detail.
        const byCode: Record<string, InterestBreakdownItem> = {};
        for (const b of interestBreakdown) byCode[b.companyCode] = b;
        const toggleExpand = (code: string) => {
          setExpandedInterest(prev => {
            const next = new Set(prev);
            next.has(code) ? next.delete(code) : next.add(code);
            return next;
          });
        };
        // Pie chart data: group interest by company, merge <2% into "Others"
        const rawPieData = Object.entries(byCode).map(([code, item]) => ({
          name: code,
          value: Math.round(item.interest * 100) / 100,
        })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
        const rawTotal = rawPieData.reduce((s, d) => s + d.value, 0);
        const major = rawPieData.filter(d => rawTotal > 0 && (d.value / rawTotal) * 100 >= 2);
        const minor = rawPieData.filter(d => rawTotal > 0 && (d.value / rawTotal) * 100 < 2);
        const pieData = minor.length > 0
          ? [...major, { name: 'Others', value: Math.round(minor.reduce((s, d) => s + d.value, 0) * 100) / 100 }]
          : major;
        const othersDetail = minor.map(d => `${d.name}: LKR ${fmt(d.value)} (${rawTotal > 0 ? ((d.value / rawTotal) * 100).toFixed(1) : '0.0'}%)`);
        const pieTotal = pieData.reduce((s, d) => s + d.value, 0);
        const PIE_COLORS = ['#3182ce', '#38a169', '#dd6b20', '#805ad5', '#e53e3e', '#d69e2e', '#319795', '#b83280', '#2b6cb0', '#c05621', '#6b46c1', '#c53030'];

        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Opportunity Cost Breakdown ({opportunityCostRate}% Annual)</h2>
              {tableSearchBar(Object.keys(byCode).length)}
            </div>
            {pieData.length > 0 && (
              <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)', marginBottom: '1.25rem' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                      labelLine={{ stroke: 'var(--text-muted)' }}
                      style={{ fontSize: '0.75rem' }}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }}
                      content={({ active, payload }: any) => {
                        if (!active || !payload || !payload[0]) return null;
                        const entry = payload[0];
                        const name = entry.name;
                        const value = entry.value;
                        const pct = pieTotal > 0 ? ((value / pieTotal) * 100).toFixed(1) : '0.0';
                        return (
                          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{name}</div>
                            <div>LKR {fmt(value)} ({pct}%)</div>
                            {name === 'Others' && othersDetail.length > 0 && (
                              <div style={{ marginTop: '0.35rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {othersDetail.map((line, i) => <div key={i}>{line}</div>)}
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => handleSubSort('code')}>Company{subSortIcon('code')}</th>
                    <th>First Buy / Lot</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('totalAmount')}>Cost Basis{subSortIcon('totalAmount')}</th>
                    <th className="text-right">Days Held</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('totalInterest')}>Interest @ {opportunityCostRate}%{subSortIcon('totalInterest')}</th>
                  </tr>
                </thead>
                <tbody>
                  {applySubSort(Object.values(byCode).filter(item => ms(item.companyCode)).map(item => ({
                    code: item.companyCode,
                    companyName: item.companyName,
                    item,
                    totalAmount: item.amount,
                    totalInterest: item.interest,
                  })), 'totalInterest').map(({ code, companyName, item, totalAmount, totalInterest }) => {
                    const isExpanded = expandedInterest.has(code);
                    const lots = item.lots || [];
                    const lotCount = lots.length;
                    const heldLots = lots.filter(l => l.status !== 'sold').length;
                    return (
                      <>{/* Fragment needed for adjacent rows */}
                        <tr
                          key={code}
                          onClick={() => toggleExpand(code)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.7rem', width: 16 }}>{isExpanded ? '▼' : '▶'}</span>
                              <CompanyAvatar code={code} size={32} />
                              <div className="company-cell">
                                <span className="company-code">{code}</span>
                                {companyName !== code && (
                                  <span className="company-name">{companyName}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-muted">
                            {item.date}
                            {lotCount > 0 && (
                              <span style={{ fontSize: '0.7rem', marginLeft: '0.5rem' }}>
                                ({lotCount} lot{lotCount > 1 ? 's' : ''}{heldLots !== lotCount ? `, ${heldLots} open` : ''})
                              </span>
                            )}
                          </td>
                          <td className="text-right mono" style={{ fontWeight: 600 }}>{fmt(totalAmount)}</td>
                          <td className="text-right mono">{item.days}</td>
                          <td className="text-right mono" style={{ color: '#d69e2e', fontWeight: 600 }}>
                            {fmt(totalInterest)}
                          </td>
                        </tr>
                        {isExpanded && lots.map((l, i) => {
                          const sold = l.status === 'sold';
                          const partial = l.status === 'partial';
                          return (
                            <tr key={`${code}-${i}`} style={{ background: 'var(--bg-row-zebra)' }}>
                              <td style={{ paddingLeft: '3.5rem' }}>
                                <span className="company-name">
                                  ↳ {l.shares}{partial ? ` (${l.remaining} held)` : ''} @ {fmt(l.costPerShare)}
                                </span>
                              </td>
                              <td>
                                {l.buyDate}
                                {sold && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>→ sold {l.endDate}</span>}
                                {partial && <span style={{ fontSize: '0.7rem', color: '#d69e2e', marginLeft: '0.4rem' }}>partial</span>}
                                {!sold && !partial && <span style={{ fontSize: '0.7rem', color: '#38a169', marginLeft: '0.4rem' }}>held</span>}
                              </td>
                              <td className="text-right mono">{fmt(l.lotCost)}</td>
                              <td className="text-right mono">{l.days}</td>
                              <td className="text-right mono" style={{ color: '#d69e2e' }}>
                                {fmt(l.interest)}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="portfolio-total">
                    <td colSpan={4}>Total Opportunity Cost</td>
                    <td className="text-right mono" style={{ color: '#d69e2e' }}>
                      {fmt(opportunityCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        );
      })()}

      {activeSection === 'holdings' && (<>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Portfolio Holdings</h2>
        {tableSearchBar(filtered.length)}
      </div>
      {holdingsFiltered.length === 0 ? (
        <p>{filtered.length === 0 ? 'No holdings yet.' : 'No holdings match your search.'}</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleSort('companyCode')}>Company{sortIcon('companyCode')}</th>
                {colVisible('portfolio', 'sharesHeld') && <th className="sort-header text-right" onClick={() => handleSort('sharesHeld')}>Shares{sortIcon('sharesHeld')}</th>}
                {colVisible('portfolio', 'avgBuyPrice') && <th className="sort-header text-right" onClick={() => handleSort('avgBuyPrice')}>Avg Buy{sortIcon('avgBuyPrice')}</th>}
                {colVisible('portfolio', 'lastTrade') && <th className="sort-header text-right" onClick={() => handleSort('lastTrade')}>Last Trade{sortIcon('lastTrade')}</th>}
                {colVisible('portfolio', 'currentValue') && <th className="sort-header text-right" onClick={() => handleSort('currentValue')}>Value{sortIcon('currentValue')}</th>}
                {colVisible('portfolio', 'totalInvested') && <th className="sort-header text-right" onClick={() => handleSort('totalInvested')}>Invested{sortIcon('totalInvested')}</th>}
                {colVisible('portfolio', 'unrealizedGain') && <th className="sort-header text-right" onClick={() => handleSort('unrealizedGain')}>Unrealized{sortIcon('unrealizedGain')}</th>}
                {colVisible('portfolio', 'unrealizedGainPercent') && <th className="sort-header text-right" onClick={() => handleSort('unrealizedGainPercent')}>Gain %{sortIcon('unrealizedGainPercent')}</th>}
                {colVisible('portfolio', 'unrealizedDayGain') && <th className="sort-header text-right" onClick={() => handleSort('unrealizedDayGain')}>Day Gain{sortIcon('unrealizedDayGain')}</th>}
                {colVisible('portfolio', 'changePercent') && <th className="sort-header text-right" onClick={() => handleSort('changePercent')}>Day %{sortIcon('changePercent')}</th>}
              </tr>
            </thead>
            <tbody>
              {holdingsFiltered.map(p => {
                const hasMarket = p.lastTrade > 0;
                return (
                  <tr key={p.companyCode}>
                    <td
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/company/${p.companyCode}`)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <CompanyAvatar code={p.companyCode} />
                        <div className="company-cell">
                          <span className="company-code">{p.companyCode}</span>
                          {p.companyName && p.companyName !== p.companyCode && (
                            <span className="company-name">{p.companyName}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {colVisible('portfolio', 'sharesHeld') && <td className="text-right mono">{p.sharesHeld}</td>}
                    {colVisible('portfolio', 'avgBuyPrice') && <td className="text-right mono">{fmt(p.avgBuyPrice)}</td>}
                    {colVisible('portfolio', 'lastTrade') && <td className="text-right mono">{hasMarket ? fmt(p.lastTrade) : 'N/A'}</td>}
                    {colVisible('portfolio', 'currentValue') && <td className="text-right mono">{hasMarket ? fmt(p.currentValue) : 'N/A'}</td>}
                    {colVisible('portfolio', 'totalInvested') && <td className="text-right mono">{fmt(p.totalInvested)}</td>}
                    {colVisible('portfolio', 'unrealizedGain') && <td className={`text-right mono ${hasMarket ? gainClass(p.unrealizedGain) : ''}`}>{hasMarket ? `${gainSign(p.unrealizedGain)}${fmt(p.unrealizedGain)}` : 'N/A'}</td>}
                    {colVisible('portfolio', 'unrealizedGainPercent') && <td className={`text-right mono ${hasMarket ? gainClass(p.unrealizedGainPercent) : ''}`}>{hasMarket ? <span className={`gain-pill ${p.unrealizedGainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>{gainSign(p.unrealizedGainPercent)}{fmt(p.unrealizedGainPercent)}%</span> : 'N/A'}</td>}
                    {colVisible('portfolio', 'unrealizedDayGain') && <td className={`text-right mono ${hasMarket ? gainClass(p.unrealizedDayGain) : ''}`}>{hasMarket ? `${gainSign(p.unrealizedDayGain)}${fmt(p.unrealizedDayGain)}` : 'N/A'}</td>}
                    {colVisible('portfolio', 'changePercent') && <td className={`text-right mono ${hasMarket ? gainClass(p.changePercent) : ''}`}>{hasMarket ? <span className={`gain-pill ${p.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>{gainSign(p.changePercent)}{fmt(p.changePercent)}%</span> : 'N/A'}</td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="portfolio-total">
                <td>Total</td>
                {colVisible('portfolio', 'sharesHeld') && <td className="text-right"></td>}
                {colVisible('portfolio', 'avgBuyPrice') && <td className="text-right"></td>}
                {colVisible('portfolio', 'lastTrade') && <td className="text-right"></td>}
                {colVisible('portfolio', 'currentValue') && <td className="text-right mono">{fmt(totalValue)}</td>}
                {colVisible('portfolio', 'totalInvested') && <td className="text-right mono">{fmt(totalInvested)}</td>}
                {colVisible('portfolio', 'unrealizedGain') && <td className={`text-right mono ${gainClass(totalGain)}`}>{gainSign(totalGain)}{fmt(totalGain)}</td>}
                {colVisible('portfolio', 'unrealizedGainPercent') && <td className={`text-right mono ${gainClass(totalGainPct)}`}><span className={`gain-pill ${totalGainPct >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>{gainSign(totalGainPct)}{fmt(totalGainPct)}%</span></td>}
                {colVisible('portfolio', 'unrealizedDayGain') && <td className={`text-right mono ${gainClass(totalDayGain)}`}>{gainSign(totalDayGain)}{fmt(totalDayGain)}</td>}
                {colVisible('portfolio', 'changePercent') && <td className={`text-right mono ${gainClass(totalDayGainPct)}`}><span className={`gain-pill ${totalDayGainPct >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>{gainSign(totalDayGainPct)}{fmt(totalDayGainPct)}%</span></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      </>)}
      {(activeSection === 'realizedProfit' || activeSection === 'realizedLoss' || activeSection === 'netRealized') && (() => {
        const items = activeSection === 'netRealized' ? realizedItems : activeSection === 'realizedProfit' ? realizedProfitItems : realizedLossItems;
        const title = activeSection === 'netRealized' ? 'All Realized Trades' : activeSection === 'realizedProfit' ? 'Realized Profits' : 'Realized Losses';
        const total = items.reduce((s, r) => s + r.realizedGain, 0);
        const filteredItems = items.filter(r => ms(r.companyCode) || ms(r.companyName));
        const sortedItems = applySubSort(filteredItems, 'realizedGain');

        // Group by company
        const grouped = items.reduce<Record<string, typeof items>>((acc, r) => {
          (acc[r.companyCode] = acc[r.companyCode] || []).push(r);
          return acc;
        }, {});
        const groupedEntries = applySubSort(Object.entries(grouped).map(([code, trades]) => ({
          code,
          name: trades[0].companyName,
          trades,
          totalGain: trades.reduce((s, r) => s + r.realizedGain, 0),
          totalShares: trades.reduce((s, r) => s + r.sharesSold, 0),
        })), 'totalGain');

        const toggleCompany = (code: string) => {
          setExpandedRealizedCompanies(prev => {
            const next = new Set(prev);
            next.has(code) ? next.delete(code) : next.add(code);
            return next;
          });
        };

        return items.length > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2rem', marginBottom: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h2 style={{ margin: 0 }}>{title}</h2>
                <div className="segmented-control">
                <button className={realizedViewMode === 'list' ? 'active' : ''} onClick={() => setRealizedViewMode('list')}>
                  List
                </button>
                <button className={realizedViewMode === 'group' ? 'active' : ''} onClick={() => setRealizedViewMode('group')}>
                  By Company
                </button>
              </div>
              </div>
              {tableSearchBar(items.length)}
            </div>

            {realizedViewMode === 'list' ? (
              <div className="portfolio-table-wrap">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th className="sort-header" onClick={() => handleSubSort('companyCode')}>Company{subSortIcon('companyCode')}</th>
                      <th className="sort-header" onClick={() => handleSubSort('sellDate')}>Sell Date{subSortIcon('sellDate')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('sharesSold')}>Shares{subSortIcon('sharesSold')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('avgBuyPrice')}>Avg Buy{subSortIcon('avgBuyPrice')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('sellPrice')}>Sell Price{subSortIcon('sellPrice')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('commission')}>Commission{subSortIcon('commission')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('realizedGain')}>Realized{subSortIcon('realizedGain')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('gainPercent')}>Gain %{subSortIcon('gainPercent')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((r, i) => (
                      <tr key={i}>
                        <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${r.companyCode}`)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CompanyAvatar code={r.companyCode} size={32} />
                            <div className="company-cell">
                              <span className="company-code">{r.companyCode}</span>
                              {r.companyName && r.companyName !== r.companyCode && (
                                <span className="company-name">{r.companyName}</span>
                              )}
                            </div>
                          </div>
                        </td>
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
                      <td colSpan={6}>Total ({items.length} trades)</td>
                      <td className={`text-right mono ${gainClass(total)}`}>
                        {gainSign(total)}{fmt(total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="portfolio-table-wrap">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th className="sort-header" onClick={() => handleSubSort('code')}>Company{subSortIcon('code')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('trades')}>Trades{subSortIcon('trades')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('totalShares')}>Total Shares{subSortIcon('totalShares')}</th>
                      <th className="sort-header text-right" onClick={() => handleSubSort('totalGain')}>Total Realized{subSortIcon('totalGain')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedEntries.map(g => {
                      const isExpanded = expandedRealizedCompanies.has(g.code);
                      return (
                        <>{/* Fragment for adjacent rows */}
                          <tr
                            key={g.code}
                            onClick={() => toggleCompany(g.code)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.7rem', width: 16 }}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                                <CompanyAvatar code={g.code} size={32} />
                                <div className="company-cell">
                                  <span className="company-code">{g.code}</span>
                                  {g.name && g.name !== g.code && (
                                    <span className="company-name">{g.name}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="text-right mono">{g.trades.length}</td>
                            <td className="text-right mono">{g.totalShares}</td>
                            <td className={`text-right mono ${gainClass(g.totalGain)}`} style={{ fontWeight: 600 }}>
                              {gainSign(g.totalGain)}{fmt(g.totalGain)}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${g.code}-subheader`} style={{ background: 'var(--bg-thead)', fontSize: '0.75rem' }}>
                              <td style={{ paddingLeft: '3rem', fontWeight: 600 }}>Sell Date</td>
                              <td className="text-right" style={{ fontWeight: 600 }}>Shares</td>
                              <td className="text-right" style={{ fontWeight: 600 }}>Avg Buy / Sell</td>
                              <td className="text-right" style={{ fontWeight: 600 }}>Realized</td>
                            </tr>
                          )}
                          {isExpanded && g.trades.map((r, i) => (
                            <tr key={`${g.code}-${i}`} style={{ background: 'var(--bg-row-zebra)' }}>
                              <td style={{ paddingLeft: '3rem' }}>{r.sellDate}</td>
                              <td className="text-right mono">{r.sharesSold}</td>
                              <td className="text-right mono">{fmt(r.avgBuyPrice)} / {fmt(r.sellPrice)}</td>
                              <td className={`text-right mono ${gainClass(r.realizedGain)}`}>
                                {gainSign(r.realizedGain)}{fmt(r.realizedGain)}
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> ({gainSign(r.gainPercent)}{fmt(r.gainPercent)}%)</span>
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="portfolio-total">
                      <td>Total ({groupedEntries.length} companies)</td>
                      <td className="text-right mono">{items.length} trades</td>
                      <td className="text-right mono">{items.reduce((s, r) => s + r.sharesSold, 0)}</td>
                      <td className={`text-right mono ${gainClass(total)}`}>
                        {gainSign(total)}{fmt(total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        ) : (
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
            No realized {activeSection === 'realizedProfit' ? 'profits' : 'losses'} to show.
          </p>
        );
      })()}
      {(activeSection === 'profit' || activeSection === 'loss' || activeSection === 'netUnrealized') && (() => {
        const items = activeSection === 'netUnrealized' ? filtered.filter(p => p.unrealizedGain !== 0) : activeSection === 'profit' ? profitItems : lossItems;
        const title = activeSection === 'netUnrealized' ? 'All Unrealized' : activeSection === 'profit' ? 'Unrealized Profits' : 'Unrealized Losses';
        const total = items.reduce((s, p) => s + p.unrealizedGain, 0);
        const enriched = items.map(p => {
          const adjGain = p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested;
          const adjGainPct = p.totalInvested !== 0 ? (adjGain / p.totalInvested) * 100 : 0;
          return { ...p, adjGain, adjGainPct };
        });
        const filteredUItems = enriched.filter(p => ms(p.companyCode) || ms(p.companyName));
        const sortedItems = applySubSort(filteredUItems, 'unrealizedGain');
        return items.length > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>{title}</h2>
              {tableSearchBar(items.length)}
            </div>
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => handleSubSort('companyCode')}>Company{subSortIcon('companyCode')}</th>
                    {colVisible('unrealized', 'sharesHeld') && <th className="sort-header text-right" onClick={() => handleSubSort('sharesHeld')}>Shares{subSortIcon('sharesHeld')}</th>}
                    {colVisible('unrealized', 'avgBuyPrice') && <th className="sort-header text-right" onClick={() => handleSubSort('avgBuyPrice')}>Avg Buy{subSortIcon('avgBuyPrice')}</th>}
                    {colVisible('unrealized', 'lastTrade') && <th className="sort-header text-right" onClick={() => handleSubSort('lastTrade')}>Last Trade{subSortIcon('lastTrade')}</th>}
                    {colVisible('unrealized', 'totalInvested') && <th className="sort-header text-right" onClick={() => handleSubSort('totalInvested')}>Invested{subSortIcon('totalInvested')}</th>}
                    {colVisible('unrealized', 'currentValue') && <th className="sort-header text-right" onClick={() => handleSubSort('currentValue')}>Value{subSortIcon('currentValue')}</th>}
                    {colVisible('unrealized', 'unrealizedGain') && <th className="sort-header text-right" onClick={() => handleSubSort('unrealizedGain')}>Unrealized{subSortIcon('unrealizedGain')}</th>}
                    {colVisible('unrealized', 'unrealizedGainPercent') && <th className="sort-header text-right" onClick={() => handleSubSort('unrealizedGainPercent')}>Gain %{subSortIcon('unrealizedGainPercent')}</th>}
                    {colVisible('unrealized', 'adjGain') && <th className="sort-header text-right" onClick={() => handleSubSort('adjGain')}>Adj. Gain{subSortIcon('adjGain')}</th>}
                    {colVisible('unrealized', 'adjGainPct') && <th className="sort-header text-right" onClick={() => handleSubSort('adjGainPct')}>Adj. Gain %{subSortIcon('adjGainPct')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(p => {
                    return (
                    <tr key={p.companyCode}>
                      <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${p.companyCode}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <CompanyAvatar code={p.companyCode} />
                          <div className="company-cell">
                            <span className="company-code">{p.companyCode}</span>
                            {p.companyName && p.companyName !== p.companyCode && (
                              <span className="company-name">{p.companyName}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      {colVisible('unrealized', 'sharesHeld') && <td className="text-right mono">{p.sharesHeld}</td>}
                      {colVisible('unrealized', 'avgBuyPrice') && <td className="text-right mono">{fmt(p.avgBuyPrice)}</td>}
                      {colVisible('unrealized', 'lastTrade') && <td className="text-right mono">{fmt(p.lastTrade)}</td>}
                      {colVisible('unrealized', 'totalInvested') && <td className="text-right mono">{fmt(p.totalInvested)}</td>}
                      {colVisible('unrealized', 'currentValue') && <td className="text-right mono">{fmt(p.currentValue)}</td>}
                      {colVisible('unrealized', 'unrealizedGain') && <td className={`text-right mono ${gainClass(p.unrealizedGain)}`}>{gainSign(p.unrealizedGain)}{fmt(p.unrealizedGain)}</td>}
                      {colVisible('unrealized', 'unrealizedGainPercent') && <td className="text-right mono"><span className={`gain-pill ${p.unrealizedGainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>{gainSign(p.unrealizedGainPercent)}{fmt(p.unrealizedGainPercent)}%</span></td>}
                      {colVisible('unrealized', 'adjGain') && <td className={`text-right mono ${gainClass(p.adjGain)}`}>{gainSign(p.adjGain)}{fmt(p.adjGain)}</td>}
                      {colVisible('unrealized', 'adjGainPct') && <td className="text-right mono"><span className={`gain-pill ${p.adjGainPct >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>{gainSign(p.adjGainPct)}{fmt(p.adjGainPct)}%</span></td>}
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const totInv = items.reduce((s, p) => s + p.totalInvested, 0);
                    const totVal = items.reduce((s, p) => s + p.currentValue, 0);
                    const totAdj = items.reduce((s, p) => s + (p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested), 0);
                    const totGainPct = totInv !== 0 ? (total / totInv) * 100 : 0;
                    const totAdjPct = totInv !== 0 ? (totAdj / totInv) * 100 : 0;
                    // Count visible columns before "totalInvested" for colSpan
                    const preColSpan = 1 + ['sharesHeld', 'avgBuyPrice', 'lastTrade'].filter(c => colVisible('unrealized', c)).length;
                    return (
                    <tr className="portfolio-total">
                      <td colSpan={preColSpan}>Total ({items.length} companies)</td>
                      {colVisible('unrealized', 'totalInvested') && <td className="text-right mono">{fmt(totInv)}</td>}
                      {colVisible('unrealized', 'currentValue') && <td className="text-right mono">{fmt(totVal)}</td>}
                      {colVisible('unrealized', 'unrealizedGain') && <td className={`text-right mono ${gainClass(total)}`}>{gainSign(total)}{fmt(total)}</td>}
                      {colVisible('unrealized', 'unrealizedGainPercent') && <td className={`text-right mono ${gainClass(totGainPct)}`}>{gainSign(totGainPct)}{fmt(totGainPct)}%</td>}
                      {colVisible('unrealized', 'adjGain') && <td className={`text-right mono ${gainClass(totAdj)}`}>{gainSign(totAdj)}{fmt(totAdj)}</td>}
                      {colVisible('unrealized', 'adjGainPct') && <td className={`text-right mono ${gainClass(totAdjPct)}`}>{gainSign(totAdjPct)}{fmt(totAdjPct)}%</td>}
                    </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
            No {activeSection === 'profit' ? 'profits' : 'losses'} to show.
          </p>
        );
      })()}
      {(activeSection === 'dayProfit' || activeSection === 'dayLoss' || activeSection === 'netDay') && (() => {
        const items = activeSection === 'netDay' ? filtered.filter(p => p.unrealizedDayGain !== 0) : activeSection === 'dayProfit' ? dayProfitItems : dayLossItems;
        const title = activeSection === 'netDay' ? 'All Day Changes' : activeSection === 'dayProfit' ? 'Day Gainers' : 'Day Losers';
        const total = items.reduce((s, p) => s + p.unrealizedDayGain, 0);
        const filteredDItems = items.filter(p => ms(p.companyCode) || ms(p.companyName));
        const sortedItems = applySubSort(filteredDItems, 'unrealizedDayGain');
        return items.length > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>{title}</h2>
              {tableSearchBar(items.length)}
            </div>
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => handleSubSort('companyCode')}>Company{subSortIcon('companyCode')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('sharesHeld')}>Shares{subSortIcon('sharesHeld')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('lastTrade')}>Last Trade{subSortIcon('lastTrade')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('change')}>Change{subSortIcon('change')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('changePercent')}>Change %{subSortIcon('changePercent')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('unrealizedDayGain')}>Day Gain{subSortIcon('unrealizedDayGain')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(p => (
                    <tr key={p.companyCode}>
                      <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${p.companyCode}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <CompanyAvatar code={p.companyCode} />
                          <div className="company-cell">
                            <span className="company-code">{p.companyCode}</span>
                            {p.companyName && p.companyName !== p.companyCode && (
                              <span className="company-name">{p.companyName}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-right mono">{p.sharesHeld}</td>
                      <td className="text-right mono">{fmt(p.lastTrade)}</td>
                      <td className={`text-right mono ${gainClass(p.change)}`}>
                        {gainSign(p.change)}{fmt(p.change)}
                      </td>
                      <td className="text-right mono">
                        <span className={`gain-pill ${p.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                          {gainSign(p.changePercent)}{fmt(p.changePercent)}%
                        </span>
                      </td>
                      <td className={`text-right mono ${gainClass(p.unrealizedDayGain)}`}>
                        {gainSign(p.unrealizedDayGain)}{fmt(p.unrealizedDayGain)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="portfolio-total">
                    <td colSpan={5}>Total ({items.length} companies)</td>
                    <td className={`text-right mono ${gainClass(total)}`}>
                      {gainSign(total)}{fmt(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
            No day {activeSection === 'dayProfit' ? 'gainers' : 'losers'} to show.
          </p>
        );
      })()}
      {activeSection === 'cashDiv' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Cash Dividends</h2>
            {tableSearchBar(cashDividends.length)}
          </div>
          {cashDividends.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No cash dividends yet.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => handleSubSort('date')}>Date{subSortIcon('date')}</th>
                    <th className="sort-header" onClick={() => handleSubSort('companyCode')}>Company{subSortIcon('companyCode')}</th>
                    <th>Tax</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('amount')}>Amount/Share{subSortIcon('amount')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('shares')}>Shares{subSortIcon('shares')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('totalAmount')}>Total{subSortIcon('totalAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {applySubSort([...cashDividends].filter(d => ms(d.companyCode)), 'date').map((d, i) => (
                    <tr key={i}>
                      <td>{d.date}</td>
                      <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${d.companyCode}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CompanyAvatar code={d.companyCode} size={26} />
                          <span className="company-code">{d.companyCode}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {d.taxed !== false ? <span className="gain-pill gain-pill-taxed" style={{ fontSize: '0.65rem' }}>Taxed</span> : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td className="text-right mono">{divAmountPerShare(d).toFixed(2)}</td>
                      <td className="text-right mono">{divShares(d)}</td>
                      <td className="text-right mono">{d.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="portfolio-total">
                    <td colSpan={4}>Total ({cashDividends.length} payments)</td>
                    <td className="text-right mono">{cashDividends.reduce((s, d) => s + divShares(d), 0)}</td>
                    <td className="text-right mono">{fmt(cashDividends.reduce((s, d) => s + d.totalAmount, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
      {activeSection === 'scripDiv' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Scrip Dividends</h2>
            {tableSearchBar(scripDividends.length)}
          </div>
          {scripDividends.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No scrip dividends yet.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => handleSubSort('date')}>Date{subSortIcon('date')}</th>
                    <th className="sort-header" onClick={() => handleSubSort('companyCode')}>Company{subSortIcon('companyCode')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('scripShares')}>Shares Received{subSortIcon('scripShares')}</th>
                  </tr>
                </thead>
                <tbody>
                  {applySubSort([...scripDividends].filter(d => ms(d.companyCode)), 'date').map((d, i) => (
                    <tr key={i}>
                      <td>{d.date}</td>
                      <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${d.companyCode}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CompanyAvatar code={d.companyCode} size={26} />
                          <span className="company-code">{d.companyCode}</span>
                        </div>
                      </td>
                      <td className="text-right mono">{d.scripShares}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="portfolio-total">
                    <td colSpan={2}>Total ({scripDividends.length} issues)</td>
                    <td className="text-right mono">{scripDividends.reduce((s, d) => s + d.scripShares, 0)} shares</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* Upcoming announced dividends the user could still receive, by XD date */}
      {activeSection === 'none' && !loading && upcomingPayouts.length > 0 && (
        <>
          <h2 style={{ marginTop: '2.5rem', marginBottom: '1rem' }}>
            {'📅'} Upcoming Announced Dividends
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '-0.5rem 0 1rem', fontSize: '0.85rem' }}>
            Announced dividends with a future XD date for companies you currently hold.
          </p>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th><span className="udiv-date-full">XD Date</span><span className="udiv-date-short">XD</span></th>
                  <th>Company</th>
                  <th className="udiv-hide-mobile">Type</th>
                  <th className="text-right"><span className="udiv-date-full">Amount/Share</span><span className="udiv-date-short">Amt/Sh</span></th>
                  <th className="text-right"><span className="udiv-date-full">Shares Held</span><span className="udiv-date-short">Shares</span></th>
                  <th className="text-right"><span className="udiv-date-full">Est. Amount</span><span className="udiv-date-short">Est.</span></th>
                  <th className="udiv-hide-mobile">Payment Date</th>
                </tr>
              </thead>
              <tbody>
                {upcomingPayouts.map((p, i) => (
                  <tr key={`${p.companyCode}-${p.exDividendDate}-${i}`}>
                    <td className="mono">
                      <span className="udiv-date-full">{p.exDividendDate}</span>
                      <span className="udiv-date-short">{p.exDividendDate.substring(5)}</span>
                    </td>
                    <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${p.companyCode}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CompanyAvatar code={p.companyCode} size={26} />
                        <span className="company-code">{p.companyCode}</span>
                      </div>
                    </td>
                    <td className="udiv-hide-mobile" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.dividendType || p.type || '—'}</td>
                    <td className="text-right mono">{p.amountPerShare != null ? p.amountPerShare.toFixed(2) : '—'}</td>
                    <td className="text-right mono">{p.sharesHeld}</td>
                    <td className="text-right mono">{p.estimatedAmount != null ? fmt(p.estimatedAmount) : '—'}</td>
                    <td className="udiv-hide-mobile" style={{ fontSize: '0.85rem' }}>{p.paymentDate || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="portfolio-total">
                  <td colSpan={5}>Total ({upcomingPayouts.length} payouts)</td>
                  <td className="text-right mono">
                    {fmt(upcomingPayouts.reduce((s, p) => s + (p.estimatedAmount || 0), 0))}
                  </td>
                  <td className="udiv-hide-mobile"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
