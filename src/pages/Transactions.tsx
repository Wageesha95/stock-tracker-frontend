import { useEffect, useState } from 'react';
import { getTransactions, getCompanies, createTransaction, deleteTransaction } from '../api';
import { Transaction, Company } from '../types';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [count, setCount] = useState('');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState('1.22');
  const [viewMode, setViewMode] = useState<'list' | 'group'>('list');

  const loadData = () => {
    Promise.all([getTransactions(), getCompanies()])
      .then(([txns, comps]) => {
        setTransactions(txns);
        setCompanies(comps);
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

  const sorted = [...transactions]
    .filter(t =>
      search === '' ||
      t.companyCode.toLowerCase().includes(search.toLowerCase()) ||
      t.type.toLowerCase().includes(search.toLowerCase()) ||
      t.date.includes(search)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
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
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by company, type or date..."
          style={{ flex: 1, minWidth: '180px', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
        />
      </div>

      {sorted.length === 0 ? (
        <p>No transactions yet.</p>
      ) : viewMode === 'list' ? (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Type</th>
                <th className="text-right">Count</th>
                <th className="text-right">Price</th>
                <th className="text-right">Commission</th>
                <th className="text-right">Total</th>
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
                    <span className={`gain-pill ${t.type === 'BUY' ? 'gain-pill-buy' : t.type === 'SELL' ? 'gain-pill-sell' : 'gain-pill-rights'}`}>
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
          return Object.entries(grouped).map(([code, txns]) => (
            <div key={code} style={{ marginBottom: '2rem' }}>
              <div className="group-header" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <CompanyAvatar code={code} size={24} />
                {code}
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
                          <span className={`gain-pill ${t.type === 'BUY' ? 'gain-pill-buy' : t.type === 'SELL' ? 'gain-pill-sell' : 'gain-pill-rights'}`}>
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
            </div>
          ));
        })()
      )}
    </div>
  );
}
