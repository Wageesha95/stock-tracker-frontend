import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardAll } from '../api';
import { RealizedGainItem } from '../types';
import CompanyAvatar from '../components/CompanyAvatar';
import { useTableSort } from '../hooks/useTableSort';

export default function RealizedGains() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RealizedGainItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardAll()
      .then(data => setItems(data.realizedItems))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const { sorted, handleSort, sortIcon } = useTableSort(items, 'sellDate');

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
            <th className="sort-header" onClick={() => handleSort('companyCode')}>Company{sortIcon('companyCode')}</th>
            <th className="sort-header" onClick={() => handleSort('sellDate')}>Sell Date{sortIcon('sellDate')}</th>
            <th className="sort-header text-right" onClick={() => handleSort('sharesSold')}>Shares{sortIcon('sharesSold')}</th>
            <th className="sort-header text-right" onClick={() => handleSort('avgBuyPrice')}>Avg Buy{sortIcon('avgBuyPrice')}</th>
            <th className="sort-header text-right" onClick={() => handleSort('sellPrice')}>Sell Price{sortIcon('sellPrice')}</th>
            <th className="sort-header text-right" onClick={() => handleSort('commission')}>Commission{sortIcon('commission')}</th>
            <th className="sort-header text-right" onClick={() => handleSort('realizedGain')}>Realized Gain{sortIcon('realizedGain')}</th>
            <th className="sort-header text-right" onClick={() => handleSort('gainPercent')}>Gain %{sortIcon('gainPercent')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${r.companyCode}`)}>
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
