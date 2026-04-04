import { useEffect, useState } from 'react';
import { getDashboardAll } from '../api';
import { RealizedGainItem } from '../types';
import CompanyAvatar from '../components/CompanyAvatar';

export default function RealizedGains() {
  const [items, setItems] = useState<RealizedGainItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardAll()
      .then(data => setItems(data.realizedItems))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  if (loading) return <p>Loading...</p>;

  if (items.length === 0) return <p>No realized gains yet.</p>;

  const totalRealized = items.reduce((s, r) => s + r.realizedGain, 0);

  return (
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
            <th className="text-right">Realized Gain</th>
            <th className="text-right">Gain %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CompanyAvatar code={r.companyCode} size={26} />
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
            <td colSpan={6}>Total Realized</td>
            <td className={`text-right mono ${gainClass(totalRealized)}`}>
              {gainSign(totalRealized)}{fmt(totalRealized)}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
