import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { getCompanies, getMarketDataHistory } from '../api';
import { Company, MarketData } from '../types';
import CompanySearchSelect from './CompanySearchSelect';

type SortDir = 'asc' | 'desc';
type Period = number | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: 5, label: '5D' },
  { value: 14, label: '14D' },
  { value: 30, label: '30D' },
  { value: 60, label: '60D' },
  { value: 90, label: '90D' },
  { value: 120, label: '120D' },
  { value: 180, label: '180D' },
  { value: 365, label: '365D' },
  { value: 'all', label: 'All' },
];

const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
const gainSign = (n: number) => (n >= 0 ? '+' : '');

export default function CompanyPriceMovement({ initialCode = '' }: { initialCode?: string }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [code, setCode] = useState(initialCode);
  const [history, setHistory] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [period, setPeriod] = useState<Period>(30);

  useEffect(() => {
    getCompanies().then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    if (!code) {
      setHistory([]);
      return;
    }
    setLoading(true);
    getMarketDataHistory(code)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [code]);

  // Keep only records within the selected window, anchored on the latest data date.
  const filteredHistory = useMemo(() => {
    if (period === 'all' || history.length === 0) return history;
    const latest = history.reduce((max, m) => (m.tradeDate > max ? m.tradeDate : max), '');
    const cutoff = new Date(latest);
    cutoff.setDate(cutoff.getDate() - (period - 1));
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return history.filter(m => m.tradeDate >= cutoffStr);
  }, [history, period]);

  // Chart wants chronological order (oldest -> newest) regardless of table sort.
  const chartData = useMemo(
    () =>
      [...filteredHistory]
        .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
        .map(md => ({
          date: md.tradeDate,
          high: md.high,
          close: md.lastTrade,
          low: md.low,
        })),
    [filteredHistory]
  );

  const tableCols = useMemo(
    () =>
      [...filteredHistory].sort((a, b) =>
        sortDir === 'asc' ? a.tradeDate.localeCompare(b.tradeDate) : b.tradeDate.localeCompare(a.tradeDate)
      ),
    [filteredHistory, sortDir]
  );

  const selected = companies.find(c => c.code === code);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Daily Price Movement</h2>
        <div style={{ marginLeft: 'auto', minWidth: '260px' }}>
          <CompanySearchSelect companies={companies} value={code} onChange={setCode} />
        </div>
      </div>

      {code && !loading && history.length > 0 && (
        <div className="segmented-control" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button
              key={String(p.value)}
              className={period === p.value ? 'active' : ''}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {!code && (
        <p style={{ color: 'var(--text-muted)' }}>Select a company to view its daily high, closing and low price movement.</p>
      )}

      {code && loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

      {code && !loading && history.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No market data history for {selected?.code ?? code}.</p>
      )}

      {code && !loading && history.length > 0 && (
        <>
          <div style={{ width: '100%', height: 340, marginBottom: '1.5rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={['auto', 'auto']} tickFormatter={v => v.toFixed(0)} width={48} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  formatter={(v: any, name: any) => [Number(v).toFixed(2), name]}
                />
                <Legend />
                <Line type="monotone" dataKey="high" name="High" stroke="#38a169" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="close" name="Close" stroke="#3182ce" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="low" name="Low" stroke="#e53e3e" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th
                    className="sort-header"
                    style={{ position: 'sticky', left: 0, background: 'var(--bg-thead)', zIndex: 1 }}
                    onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                  >
                    Date{sortDir === 'asc' ? ' →' : ' ←'}
                  </th>
                  {tableCols.map(md => (
                    <th key={md.id} className="text-right">{md.tradeDate}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>High</td>
                  {tableCols.map(md => (
                    <td key={md.id} className="text-right mono">{md.high != null ? md.high.toFixed(2) : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>Close</td>
                  {tableCols.map(md => (
                    <td key={md.id} className="text-right mono">{md.lastTrade.toFixed(2)}</td>
                  ))}
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>Low</td>
                  {tableCols.map(md => (
                    <td key={md.id} className="text-right mono">{md.low != null ? md.low.toFixed(2) : '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>Change</td>
                  {tableCols.map(md => (
                    <td key={md.id} className={`text-right mono ${gainClass(md.change)}`}>
                      {gainSign(md.change)}{md.change.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>Change%</td>
                  {tableCols.map(md => (
                    <td key={md.id} className="text-right mono">
                      <span className={`gain-pill ${md.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                        {gainSign(md.changePercent)}{md.changePercent.toFixed(2)}%
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
