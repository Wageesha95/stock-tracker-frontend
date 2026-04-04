import { useEffect, useState } from 'react';
import { getTransactions, getCompanies, getMarketData, createTransaction, deleteTransaction } from '../api';
import { Transaction, Company, MarketData } from '../types';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [marketMap, setMarketMap] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [count, setCount] = useState('');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState('1.22');
  const [viewMode, setViewMode] = useState<'list' | 'group'>('list');

  const loadData = () => {
    Promise.all([getTransactions(), getCompanies(), getMarketData()])
      .then(([txns, comps, md]) => {
        setTransactions(txns);
        setCompanies(comps);
        const map: Record<string, MarketData> = {};
        md.forEach(m => {
          if (!map[m.companyCode] || m.tradeDate > map[m.companyCode].tradeDate) {
            map[m.companyCode] = m;
          }
        });
        setMarketMap(map);
        if (comps.length > 0 && !companyCode) {
          setCompanyCode(comps[0].code);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTransaction({
        companyCode,
        date,
        type,
        count: Number(count),
        price: Number(price),
        commission: Number(commission),
      });
      setDate('');
      setCount('');
      setPrice('');
      setCommission('0');
      loadData();
    } catch (err) {
      console.error('Failed to create transaction', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    try {
      await deleteTransaction(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete transaction', err);
    }
  };

  const totalCost = (Number(count) || 0) * (Number(price) || 0) + (Number(commission) || 0);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'companyCode' | 'type' | 'count' | 'price' | 'commission' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'companyCode' || key === 'type' ? 'asc' : 'desc'); }
  };
  const si = (key: typeof sortKey) => sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';

  const sorted = [...transactions]
    .filter(t =>
      search === '' ||
      t.companyCode.toLowerCase().includes(search.toLowerCase()) ||
      t.type.toLowerCase().includes(search.toLowerCase()) ||
      t.date.includes(search)
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'companyCode') cmp = a.companyCode.localeCompare(b.companyCode);
      else if (sortKey === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortKey === 'count') cmp = a.count - b.count;
      else if (sortKey === 'price') cmp = a.price - b.price;
      else if (sortKey === 'commission') cmp = a.commission - b.commission;
      else if (sortKey === 'total') cmp = (a.count * a.price + a.commission) - (b.count * b.price + b.commission);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Transactions ({sorted.length})</h1>

      <div className="form-card">
        <h2>Add Transaction</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Company
              <select value={companyCode} onChange={e => setCompanyCode(e.target.value)} required>
                {companies.map(c => (
                  <option key={c.id} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Type
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="type"
                    value="BUY"
                    checked={type === 'BUY'}
                    onChange={() => setType('BUY')}
                  />
                  BUY
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="type"
                    value="SELL"
                    checked={type === 'SELL'}
                    onChange={() => setType('SELL')}
                  />
                  SELL
                </label>
              </div>
            </label>
            <label>
              Count
              <input
                type="number"
                min="1"
                value={count}
                onChange={e => setCount(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Price per Share
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                required
              />
            </label>
            <label>
              Commission
              <input
                type="number"
                step="0.01"
                min="0"
                value={commission}
                onChange={e => setCommission(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <span className="total-cost">Total Cost: {totalCost.toFixed(2)}</span>
            <button type="submit">Add Transaction</button>
          </div>
        </form>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div className="segmented-control">
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            List View
          </button>
          <button
            className={viewMode === 'group' ? 'active' : ''}
            onClick={() => setViewMode('group')}
          >
            Group by Company
          </button>
        </div>
        {transactions.length >= 5 && (
          <input
            className="search-bar"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
          />
        )}
      </div>

      {sorted.length === 0 ? (
        <p>No transactions yet.</p>
      ) : viewMode === 'list' ? (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleSort('date')}>Date{si('date')}</th>
                <th className="sort-header" onClick={() => handleSort('companyCode')}>Company{si('companyCode')}</th>
                <th className="sort-header" onClick={() => handleSort('type')}>Type{si('type')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('count')}>Count{si('count')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('price')}>Price{si('price')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('commission')}>Commission{si('commission')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('total')}>Total{si('total')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={t.companyCode} size={26} />
                      {t.companyCode}
                    </div>
                  </td>
                  <td>
                    <span className={`gain-pill ${t.type === 'BUY' ? 'gain-pill-buy' : t.type === 'SELL' ? 'gain-pill-sell' : t.type === 'RIGHTS' ? 'gain-pill-rights' : 'gain-pill-scrip-div'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="text-right mono">{t.count}</td>
                  <td className="text-right mono">{t.price.toFixed(2)}</td>
                  <td className="text-right mono">{t.commission.toFixed(2)}</td>
                  <td className="text-right mono">{(t.count * t.price + t.commission).toFixed(2)}</td>
                  <td>
                    <ActionMenu actions={[
                      { label: 'Delete', onClick: () => handleDelete(t.id), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        (() => {
          const grouped = sorted.reduce<Record<string, typeof sorted>>((acc, t) => {
            (acc[t.companyCode] = acc[t.companyCode] || []).push(t);
            return acc;
          }, {});
          return Object.entries(grouped).map(([code, txns]) => {
            const totalShares = txns.reduce((s, t) => s + t.count, 0);
            const avgPrice = totalShares > 0 ? txns.reduce((s, t) => s + t.count * t.price + t.commission, 0) / totalShares : 0;
            const lastTrade = marketMap[code]?.lastTrade || 0;
            return (
            <div key={code} style={{ marginBottom: '2rem' }}>
              <div className="group-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <CompanyAvatar code={code} size={28} />
                <span style={{ fontWeight: 700 }}>{code}</span>
                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '0.5rem' }}>
                  <span style={{ background: 'rgba(255,255,255,0.15)', padding: '0.15rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem' }}>
                    Avg. Price {avgPrice.toFixed(2)}
                  </span>
                  {lastTrade > 0 && (
                    <span style={{ background: 'rgba(255,255,255,0.15)', padding: '0.15rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem' }}>
                      Last Trade {lastTrade.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="portfolio-table-wrap" style={{ borderRadius: '0 0 12px 12px' }}>
                <table className="portfolio-table" style={{ borderRadius: '0 0 12px 12px' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="text-right">Count</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Commission</th>
                      <th className="text-right">Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map(t => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>
                          <span className={`gain-pill ${t.type === 'BUY' ? 'gain-pill-buy' : t.type === 'SELL' ? 'gain-pill-sell' : t.type === 'RIGHTS' ? 'gain-pill-rights' : 'gain-pill-scrip-div'}`}>
                            {t.type}
                          </span>
                        </td>
                        <td className="text-right mono">{t.count}</td>
                        <td className="text-right mono">{t.price.toFixed(2)}</td>
                        <td className="text-right mono">{t.commission.toFixed(2)}</td>
                        <td className="text-right mono">{(t.count * t.price + t.commission).toFixed(2)}</td>
                        <td>
                          <ActionMenu actions={[
                            { label: 'Delete', onClick: () => handleDelete(t.id), danger: true },
                          ]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="portfolio-total">
                      <td colSpan={2}>Total ({txns.length})</td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + (t.type === 'BUY' || t.type === 'RIGHTS' || t.type === 'SCRIP_DIVIDEND' ? t.count : -t.count), 0)}</td>
                      <td className="text-right mono">{(txns.reduce((s, t) => s + t.count * t.price, 0) / txns.reduce((s, t) => s + t.count, 0) || 0).toFixed(2)}</td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + t.commission, 0).toFixed(2)}</td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + (t.count * t.price + t.commission), 0).toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );});
        })()
      )}
    </div>
  );
}
