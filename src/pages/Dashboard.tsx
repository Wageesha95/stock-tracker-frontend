import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardAll, getDividends, getMarketData, getTransactions, getCompanies, invalidate } from '../api';
import { PortfolioItem, Dividend, RealizedGainItem, Transaction, Company } from '../types';
import { SELL_COMMISSION_RATE } from '../constants';
import CompanyAvatar from '../components/CompanyAvatar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

interface InterestBreakdown {
  companyCode: string;
  companyName: string;
  date: string;
  amount: number;
  days: number;
  interest: number;
}

type SortKey = 'companyCode' | 'sharesHeld' | 'avgBuyPrice' | 'lastTrade' | 'currentValue' | 'totalInvested' | 'unrealizedGain' | 'unrealizedGainPercent' | 'unrealizedDayGain' | 'changePercent' | 'realizedGain';
type SortDir = 'asc' | 'desc';

export default function Dashboard() {
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [realizedItems, setRealizedItems] = useState<RealizedGainItem[]>([]);
  const [opportunityCost, setOpportunityCost] = useState(0);
  const [interestBreakdown, setInterestBreakdown] = useState<InterestBreakdown[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<'none' | 'holdings' | 'invested' | 'realized' | 'realizedProfit' | 'realizedLoss' | 'netRealized' | 'interest' | 'profit' | 'loss' | 'netUnrealized' | 'dayProfit' | 'dayLoss' | 'netDay' | 'cashDiv' | 'scripDiv' | 'adjustedPnl' | 'totalPnl'>('none');
  const [expandedInterest, setExpandedInterest] = useState<Set<string>>(new Set());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestTradeDate, setLatestTradeDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('companyCode');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [realizedViewMode, setRealizedViewMode] = useState<'list' | 'group'>('list');
  const [expandedRealizedCompanies, setExpandedRealizedCompanies] = useState<Set<string>>(new Set());
  const [subSortKey, setSubSortKey] = useState<string>('');
  const [subSortDir, setSubSortDir] = useState<SortDir>('desc');

  const loadData = useCallback(() => {
    return Promise.all([getDashboardAll(), getDividends(), getMarketData(), getTransactions(), getCompanies()])
      .then(([dash, d, md, txns, comps]) => {
        setPortfolio(dash.portfolio);
        setDividends(d);
        setRealizedItems(dash.realizedItems);
        setOpportunityCost(dash.opportunityCost);
        setInterestBreakdown(dash.interestBreakdown);
        setTransactions(txns);
        setAllCompanies(comps);
        if (md.length > 0) {
          const latest = md.reduce((a, b) => a.tradeDate > b.tradeDate ? a : b);
          setLatestTradeDate(latest.tradeDate);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    invalidate('dashboard', 'dividends');
    loadData().finally(() => setRefreshing(false));
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  const filtered = portfolio.filter(p => p.sharesHeld > 0);

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
  const v = (content: React.ReactNode) => loading ? loadingPulse : content;

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
        </div>
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

      {/* Row 1: Portfolio + Summary */}
      <div className="dashboard-groups">
        <div className="card-group">
          <div className="card-group-label">Portfolio</div>
          <div className="stats-grid">
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => !loading && setActiveSection(s => s === 'holdings' ? 'none' : 'holdings')} title="Click to show/hide holdings">
              <h3>Portfolio Value</h3>
              <p className="stat-value">{v(<>LKR {fmt(totalValue)}</>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{filtered.length} companies</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => !loading && setActiveSection(s => s === 'invested' ? 'none' : 'invested')} title="Click to show investment timeline">
              <h3>Total Invested</h3>
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
              <h3>Cash</h3>
              <p className="stat-value">{v(<span className="gain-positive">LKR {fmt(totalDividends)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{cashDividends.length} payments</>)}</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#805ad5' }} onClick={() => !loading && setActiveSection(s => s === 'scripDiv' ? 'none' : 'scripDiv')} title="Click to show scrip dividends">
              <h3>Scrip</h3>
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
              <h3>Total P&L</h3>
              <p className="stat-value">{v(<span className={gainClass(totalPnl)}>{gainSign(totalPnl)}LKR {fmt(totalPnl)}</span>)}</p>
              <small style={{ color: '#718096' }}>Unrealized + Realized + Dividends</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#d69e2e' }} onClick={() => !loading && setActiveSection(s => s === 'interest' ? 'none' : 'interest')} title="Click to see per-transaction interest breakdown">
              <h3>Opportunity Cost</h3>
              <p className="stat-value">{v(<span style={{ color: '#d69e2e' }}>LKR {fmt(opportunityCost)}</span>)}</p>
              <small style={{ color: '#718096' }}>6.5% FD rate</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: loading ? '#3182ce' : adjustedPnl >= 0 ? '#38a169' : '#e53e3e' }} onClick={() => !loading && setActiveSection(s => s === 'adjustedPnl' ? 'none' : 'adjustedPnl')} title="Click to show Adjusted P&L timeline">
              <h3>Adjusted P&L</h3>
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
        // Collect all events with dates
        const events: { date: string; type: 'tx' | 'div' | 'realized'; data: any }[] = [];
        transactions.forEach(t => events.push({ date: t.date, type: 'tx', data: t }));
        dividends.filter(d => d.type === 'CASH').forEach(d => events.push({ date: d.date, type: 'div', data: d }));
        realizedItems.forEach(r => events.push({ date: r.sellDate, type: 'realized', data: r }));
        events.sort((a, b) => a.date.localeCompare(b.date));

        const latestPriceMap: Record<string, number> = {};
        filtered.forEach(p => { latestPriceMap[p.companyCode] = p.lastTrade; });

        const companyState: Record<string, { shares: number; cost: number }> = {};
        let cumRealizedGain = 0;
        let cumDividends = 0;
        const annualRate = 0.065;
        let cumInterest = 0;
        let lastDate: string | null = null;

        const pnlPoints: { date: string; pnl: number }[] = [];

        for (const ev of events) {
          // Accumulate opportunity cost between dates
          if (lastDate && lastDate < ev.date) {
            let totalCost = 0;
            for (const c of Object.keys(companyState)) totalCost += companyState[c].cost;
            if (totalCost > 0) {
              const days = (new Date(ev.date).getTime() - new Date(lastDate).getTime()) / 86400000;
              cumInterest += totalCost * annualRate * days / 365;
            }
          }

          if (ev.type === 'tx') {
            const t = ev.data;
            const code = t.companyCode;
            if (!companyState[code]) companyState[code] = { shares: 0, cost: 0 };
            const st = companyState[code];
            if (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' || t.type === 'IPO') {
              st.cost += t.count * t.price + t.commission;
              st.shares += t.count;
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

          // Compute unrealized gain at this point
          let totalValue = 0;
          let totalInvested = 0;
          for (const c of Object.keys(companyState)) {
            const s = companyState[c];
            totalValue += s.shares * (latestPriceMap[c] || 0);
            totalInvested += s.cost;
          }
          const unrealized = totalValue - totalValue * SELL_COMMISSION_RATE - totalInvested;
          const adjPnl = unrealized + cumRealizedGain + cumDividends - cumInterest;

          pnlPoints.push({
            date: ev.date,
            pnl: Math.round(adjPnl * 10000) / 10000,
          });
          lastDate = ev.date;
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
        const events: { date: string; type: 'tx' | 'div' | 'realized'; data: any }[] = [];
        transactions.forEach(t => events.push({ date: t.date, type: 'tx', data: t }));
        dividends.filter(d => d.type === 'CASH').forEach(d => events.push({ date: d.date, type: 'div', data: d }));
        realizedItems.forEach(r => events.push({ date: r.sellDate, type: 'realized', data: r }));
        events.sort((a, b) => a.date.localeCompare(b.date));

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
            if (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' || t.type === 'IPO') {
              st.cost += t.count * t.price + t.commission;
              st.shares += t.count;
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
        const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
        let netCashOut = 0;
        const chartData = sorted.map(t => {
          if (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' || t.type === 'IPO') {
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
        const grouped = interestBreakdown.reduce<Record<string, InterestBreakdown[]>>((acc, b) => {
          (acc[b.companyCode] = acc[b.companyCode] || []).push(b);
          return acc;
        }, {});
        const toggleExpand = (code: string) => {
          setExpandedInterest(prev => {
            const next = new Set(prev);
            next.has(code) ? next.delete(code) : next.add(code);
            return next;
          });
        };
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h2 style={{ margin: 0 }}>Opportunity Cost Breakdown (6.5% Annual)</h2>
              {tableSearchBar(Object.keys(grouped).length)}
            </div>
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => handleSubSort('code')}>Company{subSortIcon('code')}</th>
                    <th>Buy Date</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('totalAmount')}>Amount Invested{subSortIcon('totalAmount')}</th>
                    <th className="text-right">Days</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('totalInterest')}>Interest Earned (FD){subSortIcon('totalInterest')}</th>
                  </tr>
                </thead>
                <tbody>
                  {applySubSort(Object.entries(grouped).filter(([code]) => ms(code)).map(([code, txns]) => ({
                    code,
                    companyName: txns[0].companyName,
                    txns,
                    totalAmount: txns.reduce((s, t) => s + t.amount, 0),
                    totalInterest: txns.reduce((s, t) => s + t.interest, 0),
                  })), 'totalInterest').map(({ code, companyName, txns, totalAmount, totalInterest }) => {
                    const isExpanded = expandedInterest.has(code);
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
                          <td className="text-muted">{txns.length} transaction{txns.length > 1 ? 's' : ''}</td>
                          <td className="text-right mono" style={{ fontWeight: 600 }}>{fmt(totalAmount)}</td>
                          <td className="text-right mono">—</td>
                          <td className="text-right mono" style={{ color: '#d69e2e', fontWeight: 600 }}>
                            {fmt(totalInterest)}
                          </td>
                        </tr>
                        {isExpanded && txns.map((b, i) => (
                          <tr key={`${code}-${i}`} style={{ background: 'var(--bg-row-zebra)' }}>
                            <td style={{ paddingLeft: '3.5rem' }}>
                              <span className="company-name">↳</span>
                            </td>
                            <td>{b.date}</td>
                            <td className="text-right mono">{fmt(b.amount)}</td>
                            <td className="text-right mono">{b.days}</td>
                            <td className="text-right mono" style={{ color: '#d69e2e' }}>
                              {fmt(b.interest)}
                            </td>
                          </tr>
                        ))}
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
                <th className="sort-header" onClick={() => handleSort('companyCode')}>
                  Company{sortIcon('companyCode')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('sharesHeld')}>
                  Shares{sortIcon('sharesHeld')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('avgBuyPrice')}>
                  Avg Buy{sortIcon('avgBuyPrice')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('lastTrade')}>
                  Last Trade{sortIcon('lastTrade')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('currentValue')}>
                  Value{sortIcon('currentValue')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('totalInvested')}>
                  Invested{sortIcon('totalInvested')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('unrealizedGain')}>
                  Unrealized{sortIcon('unrealizedGain')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('unrealizedGainPercent')}>
                  Gain %{sortIcon('unrealizedGainPercent')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('unrealizedDayGain')}>
                  Day Gain{sortIcon('unrealizedDayGain')}
                </th>
                <th className="sort-header text-right" onClick={() => handleSort('changePercent')}>
                  Day %{sortIcon('changePercent')}
                </th>
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
                    <td className="text-right mono">{p.sharesHeld}</td>
                    <td className="text-right mono">{fmt(p.avgBuyPrice)}</td>
                    <td className="text-right mono">{hasMarket ? fmt(p.lastTrade) : 'N/A'}</td>
                    <td className="text-right mono">{hasMarket ? fmt(p.currentValue) : 'N/A'}</td>
                    <td className="text-right mono">{fmt(p.totalInvested)}</td>
                    <td className={`text-right mono ${hasMarket ? gainClass(p.unrealizedGain) : ''}`}>
                      {hasMarket ? `${gainSign(p.unrealizedGain)}${fmt(p.unrealizedGain)}` : 'N/A'}
                    </td>
                    <td className={`text-right mono ${hasMarket ? gainClass(p.unrealizedGainPercent) : ''}`}>
                      {hasMarket ? (
                        <span className={`gain-pill ${p.unrealizedGainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                          {gainSign(p.unrealizedGainPercent)}{fmt(p.unrealizedGainPercent)}%
                        </span>
                      ) : 'N/A'}
                    </td>
                    <td className={`text-right mono ${hasMarket ? gainClass(p.unrealizedDayGain) : ''}`}>
                      {hasMarket ? `${gainSign(p.unrealizedDayGain)}${fmt(p.unrealizedDayGain)}` : 'N/A'}
                    </td>
                    <td className={`text-right mono ${hasMarket ? gainClass(p.changePercent) : ''}`}>
                      {hasMarket ? (
                        <span className={`gain-pill ${p.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                          {gainSign(p.changePercent)}{fmt(p.changePercent)}%
                        </span>
                      ) : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="portfolio-total">
                <td>Total</td>
                <td className="text-right"></td>
                <td className="text-right"></td>
                <td className="text-right"></td>
                <td className="text-right mono">{fmt(totalValue)}</td>
                <td className="text-right mono">{fmt(totalInvested)}</td>
                <td className={`text-right mono ${gainClass(totalGain)}`}>
                  {gainSign(totalGain)}{fmt(totalGain)}
                </td>
                <td className={`text-right mono ${gainClass(totalGainPct)}`}>
                  <span className={`gain-pill ${totalGainPct >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                    {gainSign(totalGainPct)}{fmt(totalGainPct)}%
                  </span>
                </td>
                <td className={`text-right mono ${gainClass(totalDayGain)}`}>
                  {gainSign(totalDayGain)}{fmt(totalDayGain)}
                </td>
                <td className={`text-right mono ${gainClass(totalDayGainPct)}`}>
                  <span className={`gain-pill ${totalDayGainPct >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                    {gainSign(totalDayGainPct)}{fmt(totalDayGainPct)}%
                  </span>
                </td>
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
        const filteredUItems = items.filter(p => ms(p.companyCode) || ms(p.companyName));
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
                    <th className="sort-header text-right" onClick={() => handleSubSort('sharesHeld')}>Shares{subSortIcon('sharesHeld')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('avgBuyPrice')}>Avg Buy{subSortIcon('avgBuyPrice')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('lastTrade')}>Last Trade{subSortIcon('lastTrade')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('totalInvested')}>Invested{subSortIcon('totalInvested')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('currentValue')}>Value{subSortIcon('currentValue')}</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('unrealizedGain')}>Unrealized{subSortIcon('unrealizedGain')}</th>
                    <th className="text-right">Adj. Gain</th>
                    <th className="sort-header text-right" onClick={() => handleSubSort('unrealizedGainPercent')}>Gain %{subSortIcon('unrealizedGainPercent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map(p => {
                    const adjGain = p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested;
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
                      <td className="text-right mono">{p.sharesHeld}</td>
                      <td className="text-right mono">{fmt(p.avgBuyPrice)}</td>
                      <td className="text-right mono">{fmt(p.lastTrade)}</td>
                      <td className="text-right mono">{fmt(p.totalInvested)}</td>
                      <td className="text-right mono">{fmt(p.currentValue)}</td>
                      <td className={`text-right mono ${gainClass(p.unrealizedGain)}`}>
                        {gainSign(p.unrealizedGain)}{fmt(p.unrealizedGain)}
                      </td>
                      <td className={`text-right mono ${gainClass(adjGain)}`}>
                        {gainSign(adjGain)}{fmt(adjGain)}
                      </td>
                      <td className="text-right mono">
                        <span className={`gain-pill ${p.unrealizedGainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                          {gainSign(p.unrealizedGainPercent)}{fmt(p.unrealizedGainPercent)}%
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="portfolio-total">
                    <td colSpan={4}>Total ({items.length} companies)</td>
                    <td className="text-right mono">{fmt(items.reduce((s, p) => s + p.totalInvested, 0))}</td>
                    <td className="text-right mono">{fmt(items.reduce((s, p) => s + p.currentValue, 0))}</td>
                    <td className={`text-right mono ${gainClass(total)}`}>
                      {gainSign(total)}{fmt(total)}
                    </td>
                    <td className={`text-right mono ${gainClass(items.reduce((s, p) => s + (p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested), 0))}`}>
                      {gainSign(items.reduce((s, p) => s + (p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested), 0))}{fmt(items.reduce((s, p) => s + (p.currentValue - p.currentValue * SELL_COMMISSION_RATE - p.totalInvested), 0))}
                    </td>
                    <td></td>
                  </tr>
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
                      <td className="text-right mono">{d.amount.toFixed(2)}</td>
                      <td className="text-right mono">{d.shares}</td>
                      <td className="text-right mono">{d.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="portfolio-total">
                    <td colSpan={4}>Total ({cashDividends.length} payments)</td>
                    <td className="text-right mono">{cashDividends.reduce((s, d) => s + d.shares, 0)}</td>
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
    </div>
  );
}
