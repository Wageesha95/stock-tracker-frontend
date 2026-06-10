import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { getCompanies, getMarketDataHistory } from '../api';
import { Company, MarketData } from '../types';
import CompanySearchSelect from './CompanySearchSelect';

type SortDir = 'asc' | 'desc';

const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
const gainSign = (n: number) => (n >= 0 ? '+' : '');

export default function CompanyPriceMovement() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [code, setCode] = useState('');
  const [history, setHistory] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  // Chart wants chronological order (oldest -> newest) regardless of table sort.
  const chartData = useMemo(
    () =>
      [...history]
        .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
        .map(md => ({
          date: md.tradeDate,
          high: md.high,
          close: md.lastTrade,
          low: md.low,
        })),
    [history]
  );

  const tableRows = useMemo(
    () =>
      [...history].sort((a, b) =>
        sortDir === 'asc' ? a.tradeDate.localeCompare(b.tradeDate) : b.tradeDate.localeCompare(a.tradeDate)
      ),
    [history, sortDir]
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
                  <th className="sort-header" onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}>
                    Date{sortDir === 'asc' ? ' ↑' : ' ↓'}
                  </th>
                  <th className="text-right">High</th>
                  <th className="text-right">Close</th>
                  <th className="text-right">Low</th>
                  <th className="text-right">Change</th>
                  <th className="text-right">Change%</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(md => (
                  <tr key={md.id}>
                    <td>{md.tradeDate}</td>
                    <td className="text-right mono">{md.high != null ? md.high.toFixed(2) : '—'}</td>
                    <td className="text-right mono">{md.lastTrade.toFixed(2)}</td>
                    <td className="text-right mono">{md.low != null ? md.low.toFixed(2) : '—'}</td>
                    <td className={`text-right mono ${gainClass(md.change)}`}>
                      {gainSign(md.change)}{md.change.toFixed(2)}
                    </td>
                    <td className="text-right mono">
                      <span className={`gain-pill ${md.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                        {gainSign(md.changePercent)}{md.changePercent.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
