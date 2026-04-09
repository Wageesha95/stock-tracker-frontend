import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTransactionsByCompany, getDividendsByCompany, getDashboardAll, getCompanies, getMarketDataHistory, getShareSplits, ShareSplitData, getDividendPayouts, DividendPayoutData } from '../api';
import { Transaction, Dividend, RealizedGainItem, Company, MarketData, PortfolioItem } from '../types';
import { useAuth } from '../context/AuthContext';
import CompanyAvatar from '../components/CompanyAvatar';
import ActionMenu from '../components/ActionMenu';
import { deleteTransaction, deleteDividend, invalidate } from '../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { SELL_COMMISSION_RATE } from '../constants';

type Tab = 'transactions' | 'dividends' | 'realized' | 'payouts';
type Period = '1d' | '2d' | '5d' | '2w' | '1m' | '3m' | '6m';

export default function CompanyView() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isReadMode, dividendPayoutsEnabled } = useAuth();
  const [tab, setTab] = useState<Tab>('transactions');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [realizedItems, setRealizedItems] = useState<RealizedGainItem[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [portfolioItem, setPortfolioItem] = useState<PortfolioItem | null>(null);
  const [marketHistory, setMarketHistory] = useState<MarketData[]>([]);
  const [shareSplits, setShareSplits] = useState<ShareSplitData[]>([]);
  const [payouts, setPayouts] = useState<DividendPayoutData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowPeriod, setLowPeriod] = useState<Period>('1d');
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
    ]).then(([txns, divs, dash, comps, mh, splits, payoutData]) => {
      setTransactions(txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setDividends(divs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setRealizedItems(dash.realizedItems.filter(r => r.companyCode === code));
      setPortfolioItem(dash.portfolio.find((p: PortfolioItem) => p.companyCode === code) || null);
      setCompany(comps.find(c => c.code === code) || null);
      setMarketHistory(mh);
      setShareSplits(splits.filter(s => s.companyCode === code));
      setPayouts(payoutData as DividendPayoutData[]);
    });
  };

  useEffect(() => {
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

  const periodDays: Record<Period, number> = { '1d': 1, '2d': 2, '5d': 5, '2w': 14, '1m': 30, '3m': 90, '6m': 180 };
  const periodLabels: Record<Period, string> = { '1d': 'Last Trade Day', '2d': 'Last 2 Days', '5d': 'Last 5 Days', '2w': 'Last 2 Weeks', '1m': 'Last Month', '3m': 'Last 3 Months', '6m': 'Last 6 Months' };

  const { lowestData, highestData, splitsInPeriod } = useMemo(() => {
    if (marketHistory.length === 0) return { lowestData: null, highestData: null, splitsInPeriod: [] as ShareSplitData[] };

    let filtered: MarketData[];
    let cutoffStr: string;
    if (lowPeriod === '1d') {
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
  }, [marketHistory, lowPeriod, shareSplits]);

  const { valueChartData, sharesChartData, adjPnlChartData } = useMemo(() => {
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

    const valueData: { date: string; invested: number; portfolio: number }[] = [];
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

    return { valueChartData: valueData, sharesChartData: mergedTx, adjPnlChartData: mergedAdjPnl };
  }, [transactions, marketHistory, dividends, realizedItems]);

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

      {dividendPayoutsEnabled && (() => {
        if (payouts.length === 0) {
          return (
            <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
              <div className="stat-card" style={{ borderLeftColor: '#805ad5' }}>
                <h3>Dividend Yield (TTM)</h3>
                <p className="stat-value" style={{ color: 'var(--text-muted)' }}>No data</p>
              </div>
            </div>
          );
        }
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
        const ttmPayouts = payouts.filter(p => p.exDividendDate >= oneYearAgo);
        const ttmTotal = ttmPayouts.reduce((s, p) => s + (p.amountPerShare ? Number(p.amountPerShare) : 0), 0);
        const latestPrice = marketHistory.length > 0
          ? Math.max(...marketHistory.map(m => m.lastTrade))
          : portfolioItem?.currentValue && portfolioItem?.sharesHeld
            ? portfolioItem.currentValue / portfolioItem.sharesHeld
            : 0;
        const yieldPct = latestPrice > 0 ? (ttmTotal / latestPrice) * 100 : 0;
        const lastPayout = payouts[0];

        return (
          <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
            <div className="stat-card" style={{ borderLeftColor: '#805ad5' }}>
              <h3>Dividend Yield (TTM)</h3>
              <p className="stat-value">{ttmTotal > 0 ? yieldPct.toFixed(2) + '%' : 'No data'}</p>
            </div>
            <div className="stat-card" style={{ borderLeftColor: '#805ad5' }}>
              <h3>Last 12M Total/Share</h3>
              <p className="stat-value">{fmt(ttmTotal)}</p>
              <small style={{ color: '#718096' }}>
                {ttmPayouts.length} payout{ttmPayouts.length !== 1 ? 's' : ''} ({ttmPayouts.map(p => p.exDividendDate).join(', ')})
              </small>
            </div>
          </div>
        );
      })()}

      {portfolioItem && (
        <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}>
            <h3>Shares Held</h3>
            <p className="stat-value">{portfolioItem.sharesHeld}</p>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}>
            <h3>Avg. Buy Price</h3>
            <p className="stat-value">{fmt(portfolioItem.avgBuyPrice)}</p>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}>
            <h3>Total Invested</h3>
            <p className="stat-value">{fmt(portfolioItem.totalInvested)}</p>
          </div>
          <div className="stat-card" style={{ borderLeftColor: '#3182ce' }}>
            <h3>Current Value</h3>
            <p className="stat-value">{fmt(portfolioItem.currentValue)}</p>
          </div>
          <div className="stat-card" style={{ borderLeftColor: portfolioItem.unrealizedGain >= 0 ? '#38a169' : '#e53e3e' }}>
            <h3>Unrealized Gain</h3>
            <p className={`stat-value ${gainClass(portfolioItem.unrealizedGain)}`}>
              {gainSign(portfolioItem.unrealizedGain)}{fmt(portfolioItem.unrealizedGain)}
            </p>
            <small style={{ color: '#718096' }}>{gainSign(portfolioItem.unrealizedGainPercent)}{fmt(portfolioItem.unrealizedGainPercent)}%</small>
          </div>
          <div className="stat-card" style={{ borderLeftColor: portfolioItem.realizedGain >= 0 ? '#38a169' : '#e53e3e' }}>
            <h3>Realized Gain</h3>
            <p className={`stat-value ${gainClass(portfolioItem.realizedGain)}`}>
              {gainSign(portfolioItem.realizedGain)}{fmt(portfolioItem.realizedGain)}
            </p>
          </div>
        </div>
      )}

      {marketHistory.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '1rem', boxShadow: 'var(--shadow-card)', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              Price Range {lowestData && <span style={{ fontWeight: 400, fontSize: '0.75rem', textTransform: 'none' }}>({lowestData.count} trading day{lowestData.count !== 1 ? 's' : ''})</span>}
            </h3>
            <div className="segmented-control" style={{ fontSize: '0.75rem' }}>
              {(Object.keys(periodLabels) as Period[]).map(p => (
                <button key={p} className={lowPeriod === p ? 'active' : ''} onClick={() => setLowPeriod(p)}>
                  {p === '1d' ? 'LTD' : p === '2d' ? '2D' : p === '5d' ? '5D' : p === '2w' ? '2W' : p === '1m' ? '1M' : p === '3m' ? '3M' : '6M'}
                </button>
              ))}
            </div>
          </div>
          {lowestData || highestData ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', letterSpacing: '0.5px' }}>{'\u25BC'} Lowest</div>
                {lowestData ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e53e3e' }}>{fmt(lowestData.value)}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>on {lowestData.date}</span>
                  </div>
                ) : <span style={{ color: 'var(--text-muted)' }}>No data</span>}
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem', letterSpacing: '0.5px' }}>{'\u25B2'} Highest</div>
                {highestData ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38a169' }}>{fmt(highestData.value)}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>on {highestData.date}</span>
                  </div>
                ) : <span style={{ color: 'var(--text-muted)' }}>No data</span>}
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>No data for {periodLabels[lowPeriod].toLowerCase()}</p>
          )}
          {splitsInPeriod.length > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#fefcbf', color: '#744210', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid #ecc94b' }}>
              {splitsInPeriod.map((s, i) => (
                <div key={i}>
                  {s.type === 'SUBDIVISION' ? 'Subdivision' : 'Merge'} ({s.fromShares}:{s.toShares}) on {s.date} — prices may not be comparable
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(valueChartData.length > 1 || sharesChartData.length > 1 || adjPnlChartData.length > 1) && (
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <div className="chart-scroll-container" ref={chartScrollRef}>
          {sharesChartData.length > 1 && (
            <div className="chart-scroll-item" style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Shares Held</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={sharesChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }}
                    formatter={(value: any) => [value, 'Shares']}
                    labelFormatter={l => l}
                  />
                  <Line type="monotone" dataKey="shares" stroke="#805ad5" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {valueChartData.length > 1 && (
            <div className="chart-scroll-item" style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
                <span style={{ color: '#3182ce' }}>Invested</span> / <span style={{ color: '#38a169' }}>Portfolio Value</span>
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={valueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }}
                    formatter={(value: any, name: any) => [`LKR ${fmt(value)}`, name === 'invested' ? 'Invested' : 'Portfolio']}
                    labelFormatter={l => l}
                  />
                  <Line type="monotone" dataKey="invested" stroke="#3182ce" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="portfolio" stroke="#38a169" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {adjPnlChartData.length > 1 && (
            <div className="chart-scroll-item" style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '0.75rem', boxShadow: 'var(--shadow-card)' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>Adjusted P&L</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={adjPnlChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.8rem' }}
                    formatter={(value: any) => [`LKR ${fmt(value)}`, 'Adjusted P&L']}
                    labelFormatter={l => l}
                  />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="pnl" stroke="#dd6b20" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          </div>
          <button className="chart-scroll-arrow chart-scroll-left" onClick={() => chartScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })} aria-label="Scroll left">&lsaquo;</button>
          <button className="chart-scroll-arrow chart-scroll-right" onClick={() => chartScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })} aria-label="Scroll right">&rsaquo;</button>
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
        ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Ex-Dividend Date</th>
                <th>Payment Date</th>
                <th className="text-right">Amount (LKR)</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={i}>
                  <td>{p.exDividendDate || '-'}</td>
                  <td>{p.paymentDate || '-'}</td>
                  <td className="text-right mono">
                    {p.amountPerShare != null ? Number(p.amountPerShare).toFixed(2) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
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
