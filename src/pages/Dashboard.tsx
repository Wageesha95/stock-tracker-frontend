import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardAll, getDividends, getMarketData, getTransactions, invalidate } from '../api';
import { PortfolioItem, Dividend, RealizedGainItem, Transaction } from '../types';
import CompanyAvatar from '../components/CompanyAvatar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

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
  const [activeSection, setActiveSection] = useState<'none' | 'holdings' | 'invested' | 'realized' | 'realizedProfit' | 'realizedLoss' | 'netRealized' | 'interest' | 'profit' | 'loss' | 'netUnrealized' | 'dayProfit' | 'dayLoss' | 'netDay'>('none');
  const [expandedInterest, setExpandedInterest] = useState<Set<string>>(new Set());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestTradeDate, setLatestTradeDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('companyCode');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [realizedViewMode, setRealizedViewMode] = useState<'list' | 'group'>('list');
  const [expandedRealizedCompanies, setExpandedRealizedCompanies] = useState<Set<string>>(new Set());

  const loadData = useCallback(() => {
    return Promise.all([getDashboardAll(), getDividends(), getMarketData(), getTransactions()])
      .then(([dash, d, md, txns]) => {
        setPortfolio(dash.portfolio);
        setDividends(d);
        setRealizedItems(dash.realizedItems);
        setOpportunityCost(dash.opportunityCost);
        setInterestBreakdown(dash.interestBreakdown);
        setTransactions(txns);
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

  const totalValue = filtered.reduce((s, p) => s + p.currentValue, 0);
  const totalInvested = filtered.reduce((s, p) => s + p.totalInvested, 0);
  const totalGain = filtered.reduce((s, p) => s + p.unrealizedGain, 0);
  const totalDayGain = filtered.reduce((s, p) => s + p.unrealizedDayGain, 0);
  const totalRealized = realizedItems.reduce((s, r) => s + r.realizedGain, 0);
  const totalGainPct = totalInvested !== 0 ? (totalGain / totalInvested) * 100 : 0;
  const totalDayGainPct = totalValue !== 0 ? (totalDayGain / (totalValue - totalDayGain)) * 100 : 0;
  const cashDividends = dividends.filter(d => d.type === 'CASH');
  const scripDividends = dividends.filter(d => d.type === 'SCRIP');
  const totalDividends = cashDividends.reduce((s, d) => s + d.totalAmount, 0);
  const totalScripShares = scripDividends.reduce((s, d) => s + d.scripShares, 0);
  const profitItems = filtered.filter(p => p.unrealizedGain > 0);
  const lossItems = filtered.filter(p => p.unrealizedGain < 0);
  const totalProfit = profitItems.reduce((s, p) => s + p.unrealizedGain, 0);
  const totalLoss = lossItems.reduce((s, p) => s + p.unrealizedGain, 0);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
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
            <div className="stat-card" style={{ borderLeftColor: '#38a169' }}>
              <h3>Cash</h3>
              <p className="stat-value">{v(<span className="gain-positive">LKR {fmt(totalDividends)}</span>)}</p>
              <small style={{ color: '#718096' }}>{v(<>{cashDividends.length} payments</>)}</small>
            </div>
            <div className="stat-card" style={{ borderLeftColor: '#805ad5' }}>
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
            <div className="stat-card" style={{ borderLeftColor: loading ? '#3182ce' : totalPnl >= 0 ? '#38a169' : '#e53e3e' }}>
              <h3>Total P&L</h3>
              <p className="stat-value">{v(<span className={gainClass(totalPnl)}>{gainSign(totalPnl)}LKR {fmt(totalPnl)}</span>)}</p>
              <small style={{ color: '#718096' }}>Unrealized + Realized + Dividends</small>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer', borderLeftColor: '#d69e2e' }} onClick={() => !loading && setActiveSection(s => s === 'interest' ? 'none' : 'interest')} title="Click to see per-transaction interest breakdown">
              <h3>Opportunity Cost</h3>
              <p className="stat-value">{v(<span style={{ color: '#d69e2e' }}>LKR {fmt(opportunityCost)}</span>)}</p>
              <small style={{ color: '#718096' }}>6.5% FD rate</small>
            </div>
            <div className="stat-card" style={{ borderLeftColor: loading ? '#3182ce' : adjustedPnl >= 0 ? '#38a169' : '#e53e3e' }}>
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

      {activeSection === 'invested' && (() => {
        const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
        let cumulative = 0;
        const chartData = sorted.map(t => {
          const amount = t.count * t.price + t.commission;
          cumulative += t.type === 'BUY' ? amount : -amount;
          return { date: t.date, invested: Math.round(cumulative * 100) / 100 };
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
                    formatter={(value: number) => [`LKR ${fmt(value)}`, 'Cumulative Invested']}
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
            <h2>Opportunity Cost Breakdown (6.5% Annual)</h2>
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Buy Date</th>
                    <th className="text-right">Amount Invested</th>
                    <th className="text-right">Days</th>
                    <th className="text-right">Interest Earned (FD)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([code, txns]) => {
                    const totalAmount = txns.reduce((s, t) => s + t.amount, 0);
                    const totalInterest = txns.reduce((s, t) => s + t.interest, 0);
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
                                {txns[0].companyName !== code && (
                                  <span className="company-name">{txns[0].companyName}</span>
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
      <h2>Portfolio Holdings</h2>
      {sorted.length === 0 ? (
        <p>No holdings yet. Add transactions to see your portfolio.</p>
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
              {sorted.map(p => {
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
        const sortedItems = [...items].sort((a, b) => Math.abs(b.realizedGain) - Math.abs(a.realizedGain));

        // Group by company
        const grouped = items.reduce<Record<string, typeof items>>((acc, r) => {
          (acc[r.companyCode] = acc[r.companyCode] || []).push(r);
          return acc;
        }, {});
        const groupedEntries = Object.entries(grouped).map(([code, trades]) => ({
          code,
          name: trades[0].companyName,
          trades,
          totalGain: trades.reduce((s, r) => s + r.realizedGain, 0),
          totalShares: trades.reduce((s, r) => s + r.sharesSold, 0),
        })).sort((a, b) =>
          activeSection === 'realizedProfit' ? b.totalGain - a.totalGain : a.totalGain - b.totalGain
        );

        const toggleCompany = (code: string) => {
          setExpandedRealizedCompanies(prev => {
            const next = new Set(prev);
            next.has(code) ? next.delete(code) : next.add(code);
            return next;
          });
        };

        return items.length > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
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

            {realizedViewMode === 'list' ? (
              <div className="portfolio-table-wrap">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Sell Date</th>
                      <th className="text-right">Shares</th>
                      <th className="text-right">Avg Buy</th>
                      <th className="text-right">Sell Price</th>
                      <th className="text-right">Commission</th>
                      <th className="text-right">Realized</th>
                      <th className="text-right">Gain %</th>
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
                      <th>Company</th>
                      <th className="text-right">Trades</th>
                      <th className="text-right">Total Shares</th>
                      <th className="text-right">Total Realized</th>
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
        const sortedItems = [...items].sort((a, b) => Math.abs(b.unrealizedGain) - Math.abs(a.unrealizedGain));
        return items.length > 0 ? (
          <>
            <h2 style={{ marginTop: '2rem' }}>{title}</h2>
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="text-right">Shares</th>
                    <th className="text-right">Avg Buy</th>
                    <th className="text-right">Last Trade</th>
                    <th className="text-right">Invested</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Unrealized</th>
                    <th className="text-right">Gain %</th>
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
                      <td className="text-right mono">{fmt(p.avgBuyPrice)}</td>
                      <td className="text-right mono">{fmt(p.lastTrade)}</td>
                      <td className="text-right mono">{fmt(p.totalInvested)}</td>
                      <td className="text-right mono">{fmt(p.currentValue)}</td>
                      <td className={`text-right mono ${gainClass(p.unrealizedGain)}`}>
                        {gainSign(p.unrealizedGain)}{fmt(p.unrealizedGain)}
                      </td>
                      <td className="text-right mono">
                        <span className={`gain-pill ${p.unrealizedGainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                          {gainSign(p.unrealizedGainPercent)}{fmt(p.unrealizedGainPercent)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="portfolio-total">
                    <td colSpan={4}>Total ({items.length} companies)</td>
                    <td className="text-right mono">{fmt(items.reduce((s, p) => s + p.totalInvested, 0))}</td>
                    <td className="text-right mono">{fmt(items.reduce((s, p) => s + p.currentValue, 0))}</td>
                    <td className={`text-right mono ${gainClass(total)}`}>
                      {gainSign(total)}{fmt(total)}
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
        const sortedItems = [...items].sort((a, b) => Math.abs(b.unrealizedDayGain) - Math.abs(a.unrealizedDayGain));
        return items.length > 0 ? (
          <>
            <h2 style={{ marginTop: '2rem' }}>{title}</h2>
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="text-right">Shares</th>
                    <th className="text-right">Last Trade</th>
                    <th className="text-right">Change</th>
                    <th className="text-right">Change %</th>
                    <th className="text-right">Day Gain</th>
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
    </div>
  );
}
