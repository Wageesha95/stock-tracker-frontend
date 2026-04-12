import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTransactionsByCompany, getDividendsByCompany, getDashboardAll, getCompanies, getMarketDataHistory, getShareSplits, ShareSplitData, getDividendPayouts, DividendPayoutData, getDividendFinancials, DividendFinancialData } from '../api';
import { Transaction, Dividend, RealizedGainItem, Company, MarketData, PortfolioItem } from '../types';
import { useAuth } from '../context/AuthContext';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';
import ActionMenu from '../components/ActionMenu';
import { deleteTransaction, deleteDividend, invalidate } from '../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { SELL_COMMISSION_RATE } from '../constants';

type Tab = 'transactions' | 'dividends' | 'realized' | 'payouts';
type Period = '1d' | '2d' | '5d' | '2w' | '1m' | '3m' | '6m' | 'custom';

export default function CompanyView() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isReadMode, dividendPayoutsEnabled } = useAuth();
  const [tab, setTab] = useState<Tab>('transactions');
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
  const [expandedChart, setExpandedChart] = useState<'shares' | 'value' | 'priceAvg' | 'pnl' | 'yearly' | 'yearlyChart' | null>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  const loadData = () => {
    if (!code) return Promise.resolve();
    return Promise.all([
      getTransactionsByCompany(code),
      getDividendsByCompany(code),
      getDashboardAll(),
      getCompanies(),
      getMarketDataHistory(code),
      getShareSplits(),
      getDividendPayouts(code).catch(() => [] as DividendPayoutData[]),
      getDividendFinancials(code).catch(() => [] as DividendFinancialData[]),
    ]).then(([txns, divs, dash, comps, mh, splits, payoutData, finData]) => {
      setTransactions(txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setDividends(divs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setRealizedItems(dash.realizedItems.filter(r => r.companyCode === code));
      setPortfolioItem(dash.portfolio.find((p: PortfolioItem) => p.companyCode === code) || null);
      setCompanies(comps);
      setCompany(comps.find(c => c.code === code) || null);
      setMarketHistory(mh);
      setShareSplits(splits.filter(s => s.companyCode === code));
      setPayouts(payoutData as DividendPayoutData[]);
      setFinancials(finData as DividendFinancialData[]);
    });
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
    loadData().catch(console.error).finally(() => setLoading(false));
  }, [code]);

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
    const lowest = filteredLow.length > 0 ? filteredLow.reduce((min, m) => m.low < min.low ? m : min) : null;
    const highest = filteredHigh.length > 0 ? filteredHigh.reduce((max, m) => m.high > max.high ? m : max) : null;
    const splits = shareSplits.filter(s => s.date >= cutoffStr);
    return {
      lowestData: lowest ? { value: lowest.low, date: lowest.tradeDate, count } : null,
      highestData: highest ? { value: highest.high, date: highest.tradeDate, count } : null,
      splitsInPeriod: splits,
    };
  }, [marketHistory, lowPeriod, customFrom, customTo, shareSplits]);

  const { valueChartData, sharesChartData, priceVsAvgChartData, adjPnlChartData } = useMemo(() => {
    const sortedTx = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    // Build cumulative invested + shares over time (FIFO)
    let cumInvested = 0;
    let cumShares = 0;
    const txPoints: { date: string; invested: number; shares: number }[] = [];
    for (const t of sortedTx) {
      if (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' || t.type === 'IPO') {
        cumInvested += t.count * t.price + t.commission;
        cumShares += t.count;
      } else if (t.type === 'SELL') {
        const avgAtSell = cumShares > 0 ? cumInvested / cumShares : 0;
        cumInvested -= avgAtSell * t.count;
        cumShares -= t.count;
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

    // Build market price map by date
    const priceByDate: Record<string, number> = {};
    marketHistory.forEach(m => { priceByDate[m.tradeDate] = m.lastTrade; });

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
    const annualRate = 0.065;
    const events: { date: string; type: 'tx' | 'div' | 'realized'; data: any }[] = [];
    sortedTx.forEach(t => events.push({ date: t.date, type: 'tx', data: t }));
    dividends.filter(d => d.type === 'CASH').forEach(d => events.push({ date: d.date, type: 'div', data: d }));
    realizedItems.forEach(r => events.push({ date: r.sellDate, type: 'realized', data: r }));
    events.sort((a, b) => a.date.localeCompare(b.date));

    let cumShares2 = 0;
    let cumCost = 0;
    let cumRealized = 0;
    let cumDividends = 0;
    let cumInterest = 0;
    let prevDate: string | null = null;
    const adjPnlPoints: { date: string; pnl: number }[] = [];

    for (const ev of events) {
      if (prevDate && prevDate < ev.date && cumCost > 0) {
        const days = (new Date(ev.date).getTime() - new Date(prevDate).getTime()) / 86400000;
        cumInterest += cumCost * annualRate * days / 365;
      }

      if (ev.type === 'tx') {
        const t = ev.data;
        if (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' || t.type === 'IPO') {
          cumCost += t.count * t.price + t.commission;
          cumShares2 += t.count;
        } else if (t.type === 'SELL') {
          const avg = cumShares2 > 0 ? cumCost / cumShares2 : 0;
          cumCost -= avg * t.count;
          cumShares2 -= t.count;
        }
      } else if (ev.type === 'div') {
        cumDividends += ev.data.totalAmount;
      } else if (ev.type === 'realized') {
        cumRealized += ev.data.realizedGain;
      }

      const price = priceByDate[ev.date] || lastPrice;
      const portfolioVal = cumShares2 * price;
      const unrealized = portfolioVal - portfolioVal * SELL_COMMISSION_RATE - cumCost;
      const adjPnl = unrealized + cumRealized + cumDividends - cumInterest;
      adjPnlPoints.push({ date: ev.date, pnl: Math.round(adjPnl * 10000) / 10000 });
      prevDate = ev.date;
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
    let lastAvgShares = 0;
    let lastAvgInvested = 0;
    let lastMktPrice = 0;
    const priceVsAvgData: { date: string; sharePrice: number; avgPrice: number }[] = [];
    for (const date of allDates) {
      if (investedByDate[date]) {
        lastAvgShares = investedByDate[date].shares;
        lastAvgInvested = investedByDate[date].invested;
      }
      if (priceByDate[date]) lastMktPrice = priceByDate[date];
      if (lastAvgShares > 0 && lastMktPrice > 0) {
        const avgPrice = lastAvgInvested / lastAvgShares;
        priceVsAvgData.push({
          date,
          sharePrice: Math.round(lastMktPrice * 100) / 100,
          avgPrice: Math.round(avgPrice * 100) / 100,
        });
      }
    }

    return { valueChartData: valueData, sharesChartData: mergedTx, priceVsAvgChartData: priceVsAvgData, adjPnlChartData: mergedAdjPnl };
  }, [transactions, marketHistory, dividends, realizedItems]);

  const [navCode, setNavCode] = useState('');

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
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
          <CompanyAvatar code={code || ''} size={56} />
          <div>
            <h1 style={{ margin: 0 }}>{code}</h1>
            {company && company.name !== code && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{company.name}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '220px' }}>
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
              <div style={{ textAlign: 'right' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: marketHistory.length > 0 && dividendPayoutsEnabled ? '1fr 1fr' : '1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                {dividendPayoutsEnabled && payouts.length > 0 && (() => {
                  const now2 = new Date();
                  const cutoff2 = new Date(now2.getFullYear() - 1, now2.getMonth(), now2.getDate()).toISOString().split('T')[0];
                  const ttm2 = payouts.filter(p => p.exDividendDate >= cutoff2)
                    .reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
                  if (ttm2 <= 0) return null;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
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
          const cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
          const ttmPayouts = payouts.filter(p => p.exDividendDate >= cutoff);
          const ttmTotal = ttmPayouts.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
          const curPrice = marketHistory.length > 0 ? Math.max(...marketHistory.map(m => m.lastTrade))
            : portfolioItem?.currentValue && portfolioItem?.sharesHeld ? portfolioItem.currentValue / portfolioItem.sharesHeld : 0;
          const yieldPct = curPrice > 0 ? (ttmTotal / curPrice) * 100 : 0;

          const byYear: Record<string, typeof payouts> = {};
          payouts.forEach(p => { const y = p.exDividendDate.substring(0, 4); (byYear[y] = byYear[y] || []).push(p); });
          const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
          const currentYear = String(now.getFullYear());

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* TTM cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="stat-card" style={{ borderLeftColor: '#805ad5', margin: 0 }}>
                  <h3>Yield (TTM)</h3>
                  <p className="stat-value">{payouts.length > 0 && ttmTotal > 0 ? yieldPct.toFixed(2) + '%' : <span style={{ color: 'var(--text-muted)' }}>No data</span>}</p>
                </div>
                <div className="stat-card" style={{ borderLeftColor: '#805ad5', margin: 0 }}>
                  <h3>12M Dividends</h3>
                  <p className="stat-value">{payouts.length > 0 ? fmt(ttmTotal) : <span style={{ color: 'var(--text-muted)' }}>No data</span>}</p>
                  {ttmPayouts.length > 0 && <small style={{ color: '#718096' }}>{ttmPayouts.length} payout{ttmPayouts.length !== 1 ? 's' : ''}</small>}
                </div>
              </div>
              {/* Yearly table */}
              {(() => {
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

      {(valueChartData.length > 1 || sharesChartData.length > 1 || priceVsAvgChartData.length > 1 || adjPnlChartData.length > 1) && (
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
                <LineChart data={priceVsAvgChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={v => v.toFixed(0)} />
                  <Line type="monotone" dataKey="sharePrice" stroke="#e53e3e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="avgPrice" stroke="#3182ce" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
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
          </div>
          <button className="chart-scroll-arrow chart-scroll-left" onClick={() => chartScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })} aria-label="Scroll left">&lsaquo;</button>
          <button className="chart-scroll-arrow chart-scroll-right" onClick={() => chartScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })} aria-label="Scroll right">&rsaquo;</button>
        </div>
      )}

      {/* Expanded chart modal */}
      {expandedChart && (
        <div onClick={() => setExpandedChart(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '900px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                {expandedChart === 'shares' && 'Shares Held'}
                {expandedChart === 'value' && <><span style={{ color: '#3182ce' }}>Invested</span> / <span style={{ color: '#38a169' }}>Portfolio Value</span></>}
                {expandedChart === 'priceAvg' && <><span style={{ color: '#e53e3e' }}>Share Price</span> / <span style={{ color: '#3182ce' }}>Avg Buy Price</span></>}
                {expandedChart === 'pnl' && 'Adjusted P&L'}
                {expandedChart === 'yearly' && 'Yearly Summary — All Years'}
                {expandedChart === 'yearlyChart' && 'Dividend History Chart'}
              </h3>
              <button onClick={() => setExpandedChart(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '1.5rem', lineHeight: 1,
              }}>&times;</button>
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
                <ResponsiveContainer width="100%" height={450}>
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
            <ResponsiveContainer width="100%" height={450}>
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
                <LineChart data={priceVsAvgChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => v.toFixed(0)} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }} formatter={(v: any, n: any) => [`LKR ${fmt(v)}`, n === 'sharePrice' ? 'Share Price' : 'Avg Buy Price']} labelFormatter={l => l} />
                  <Line type="monotone" dataKey="sharePrice" stroke="#e53e3e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="avgPrice" stroke="#3182ce" strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="4 2" />
                </LineChart>
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
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <div className="segmented-control">
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
        </div>
      </div>

      {tab === 'transactions' && (
        transactions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No transactions for {code}.</p>
        ) : (
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="text-right">Count</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Commission</th>
                  <th className="text-right">Total</th>
                  {!isReadMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>
                      <span className={`gain-pill ${t.type === 'BUY' ? 'gain-pill-buy' : t.type === 'SELL' ? 'gain-pill-sell' : t.type === 'RIGHTS' ? 'gain-pill-rights' : t.type === 'IPO' ? 'gain-pill-ipo' : 'gain-pill-scrip-div'}`}>
                        {t.type === 'SCRIP_DIVIDEND' ? 'SCRIP' : t.type}
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
                    {transactions.reduce((s, t) => s + (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' || t.type === 'IPO' ? t.count : t.type === 'SELL' ? -t.count : (() => { throw new Error(`Unknown type: ${t.type}`); })()), 0)} net
                  </td>
                  <td></td>
                  <td className="text-right mono">
                    {fmt(transactions.reduce((s, t) => s + t.commission, 0))}
                  </td>
                  <td className="text-right mono">
                    {fmt(transactions.reduce((s, t) => s + (t.count * t.price + t.commission) * (t.type === 'SELL' ? -1 : 1), 0))}
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
                  <th>Date</th>
                  <th>Type</th>
                  <th className="text-right">Amount/Share</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Scrip Shares</th>
                  <th className="text-right">Total</th>
                  {!isReadMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {dividends.map(d => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>
                      <span className={`gain-pill ${d.type === 'CASH' ? 'gain-pill-cash' : 'gain-pill-scrip'}`}>
                        {d.type}
                      </span>
                    </td>
                    <td className="text-right mono">{d.type === 'CASH' ? fmt(d.amount) : '\u2014'}</td>
                    <td className="text-right mono">{d.type === 'CASH' ? d.shares : '\u2014'}</td>
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
                  <th>Sell Date</th>
                  <th className="text-right">Shares Sold</th>
                  <th className="text-right">Avg Buy</th>
                  <th className="text-right">Sell Price</th>
                  <th className="text-right">Commission</th>
                  <th className="text-right">Realized Gain</th>
                  <th className="text-right">Gain %</th>
                </tr>
              </thead>
              <tbody>
                {realizedItems.map((r, i) => (
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
    </div>
  );
}
