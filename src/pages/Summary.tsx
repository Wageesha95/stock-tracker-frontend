import { useEffect, useState } from 'react';
import { getDashboardAll, getDividends, getUserSettings } from '../api';
import { PortfolioItem, RealizedGainItem, Dividend } from '../types';
import { filterByBroker } from '../utils/brokers';

export default function Summary() {
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [realized, setRealized] = useState<RealizedGainItem[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);

  useEffect(() => {
    getUserSettings()
      .then(settings => {
        const brokers = settings.selectedDataBrokerIds || [];
        return Promise.all([getDashboardAll(brokers), getDividends()]).then(([dash, divs]) => {
          setPortfolio(dash.portfolio || []);
          setRealized(dash.realizedItems || []);
          setDividends(filterByBroker(divs, brokers));
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cls = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const sign = (n: number) => (n >= 0 ? '+' : '');

  if (loading) return <p>Loading...</p>;

  const totalInvested = portfolio.reduce((s, p) => s + p.totalInvested, 0);
  const currentValue = portfolio.reduce((s, p) => s + p.currentValue, 0);
  const unrealized = portfolio.reduce((s, p) => s + p.unrealizedGain, 0);
  const realizedTotal = realized.reduce((s, r) => s + r.realizedGain, 0);
  const dividendsTotal = dividends.filter(d => d.type === 'CASH').reduce((s, d) => s + d.totalAmount, 0);
  const netCumulative = unrealized + realizedTotal + dividendsTotal;
  const unrealizedPct = totalInvested > 0 ? (unrealized / totalInvested) * 100 : 0;
  // Cumulative return measured against the money currently at work.
  const netPct = totalInvested > 0 ? (netCumulative / totalInvested) * 100 : 0;

  const rows: { label: string; value: number; note?: string }[] = [
    { label: 'Unrealized gain / loss', value: unrealized, note: 'Open positions (current value − invested)' },
    { label: 'Realized gain / loss', value: realizedTotal, note: 'Lifetime, from sells & lapsed rights' },
    { label: 'Dividends received', value: dividendsTotal, note: 'Lifetime cash dividends (net)' },
  ];

  return (
    <div>
      <h1>Summary</h1>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1.25rem', fontSize: '0.9rem' }}>
        Your cumulative performance — realized, unrealized and dividends combined.
      </p>

      <div className="stats-grid">
        <div className="stat-card"><h3>Invested (open)</h3><p className="stat-value">{fmt(totalInvested)}</p></div>
        <div className="stat-card"><h3>Current Value</h3><p className="stat-value">{fmt(currentValue)}</p></div>
        <div className="stat-card">
          <h3>Unrealized</h3>
          <p className={`stat-value ${cls(unrealized)}`}>{sign(unrealized)}{fmt(unrealized)}</p>
          <small className={cls(unrealized)}>{sign(unrealizedPct)}{unrealizedPct.toFixed(2)}%</small>
        </div>
        <div className="stat-card"><h3>Realized</h3><p className={`stat-value ${cls(realizedTotal)}`}>{sign(realizedTotal)}{fmt(realizedTotal)}</p></div>
        <div className="stat-card"><h3>Dividends</h3><p className={`stat-value ${cls(dividendsTotal)}`}>{sign(dividendsTotal)}{fmt(dividendsTotal)}</p></div>
        <div className="stat-card">
          <h3>Net Cumulative P/L</h3>
          <p className={`stat-value ${cls(netCumulative)}`}>{sign(netCumulative)}{fmt(netCumulative)}</p>
          <small className={cls(netCumulative)}>{sign(netPct)}{netPct.toFixed(2)}%</small>
        </div>
      </div>

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
    </div>
  );
}
