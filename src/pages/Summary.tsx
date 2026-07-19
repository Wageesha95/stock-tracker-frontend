import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardAll, getDividends, getUserSettings } from '../api';
import { PortfolioItem, RealizedGainItem, Dividend } from '../types';
import { filterByBroker } from '../utils/brokers';
import { useTableSort } from '../hooks/useTableSort';
import CompanyAvatar from '../components/CompanyAvatar';

export default function Summary() {
  const navigate = useNavigate();
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

  // Per-company cumulative breakdown (union of held / sold / dividend-paying companies).
  const byCompany = new Map<string, { code: string; name: string; unrealized: number; realized: number; dividends: number; invested: number }>();
  const ensure = (code: string, name?: string) => {
    let e = byCompany.get(code);
    if (!e) { e = { code, name: name || code, unrealized: 0, realized: 0, dividends: 0, invested: 0 }; byCompany.set(code, e); }
    else if (name && e.name === code) e.name = name;
    return e;
  };
  portfolio.forEach(p => { const e = ensure(p.companyCode, p.companyName); e.unrealized += p.unrealizedGain; e.invested += p.totalInvested; });
  realized.forEach(r => { ensure(r.companyCode, r.companyName).realized += r.realizedGain; });
  dividends.filter(d => d.type === 'CASH').forEach(d => { ensure(d.companyCode).dividends += d.totalAmount; });
  const companyRows = [...byCompany.values()].map(c => {
    const net = c.unrealized + c.realized + c.dividends;
    return { ...c, net, netPct: c.invested > 0 ? (net / c.invested) * 100 : 0 };
  });
  const compSort = useTableSort(companyRows, 'net');

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

      <h2 style={{ margin: '2rem 0 1rem' }}>By Company ({companyRows.length})</h2>
      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="sort-header" onClick={() => compSort.handleSort('code')}>Company{compSort.sortIcon('code')}</th>
              <th className="sort-header text-right" onClick={() => compSort.handleSort('unrealized')}>Unrealized{compSort.sortIcon('unrealized')}</th>
              <th className="sort-header text-right" onClick={() => compSort.handleSort('realized')}>Realized{compSort.sortIcon('realized')}</th>
              <th className="sort-header text-right" onClick={() => compSort.handleSort('dividends')}>Dividends{compSort.sortIcon('dividends')}</th>
              <th className="sort-header text-right" onClick={() => compSort.handleSort('net')}>Net P/L{compSort.sortIcon('net')}</th>
              <th className="sort-header text-right" onClick={() => compSort.handleSort('netPct')}>% of Invested{compSort.sortIcon('netPct')}</th>
            </tr>
          </thead>
          <tbody>
            {compSort.sorted.map(c => (
              <tr key={c.code}>
                <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${c.code}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CompanyAvatar code={c.code} size={26} />
                    <span className="company-code">{c.code}</span>
                    <span className="hide-sm" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.name !== c.code ? c.name : ''}</span>
                  </div>
                </td>
                <td className={`text-right mono ${cls(c.unrealized)}`}>{sign(c.unrealized)}{fmt(c.unrealized)}</td>
                <td className={`text-right mono ${cls(c.realized)}`}>{sign(c.realized)}{fmt(c.realized)}</td>
                <td className={`text-right mono ${c.dividends > 0 ? 'gain-positive' : ''}`}>{c.dividends > 0 ? `+${fmt(c.dividends)}` : '—'}</td>
                <td className={`text-right mono ${cls(c.net)}`} style={{ fontWeight: 700 }}>{sign(c.net)}{fmt(c.net)}</td>
                <td className={`text-right mono ${c.invested > 0 ? cls(c.netPct) : ''}`}>{c.invested > 0 ? `${sign(c.netPct)}${c.netPct.toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="portfolio-total">
              <td>Total</td>
              <td className={`text-right mono ${cls(unrealized)}`}>{sign(unrealized)}{fmt(unrealized)}</td>
              <td className={`text-right mono ${cls(realizedTotal)}`}>{sign(realizedTotal)}{fmt(realizedTotal)}</td>
              <td className={`text-right mono ${cls(dividendsTotal)}`}>{sign(dividendsTotal)}{fmt(dividendsTotal)}</td>
              <td className={`text-right mono ${cls(netCumulative)}`}>{sign(netCumulative)}{fmt(netCumulative)}</td>
              <td className={`text-right mono ${cls(netPct)}`}>{sign(netPct)}{netPct.toFixed(2)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
