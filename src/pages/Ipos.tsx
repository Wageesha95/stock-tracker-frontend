import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIpos, createIpo, updateIpo, deleteIpo, getCompanies, getBrokers, getUserSettings, IpoData, BrokerData } from '../api';
import { Company } from '../types';
import { defaultBrokerId, filterByBroker } from '../utils/brokers';
import { useAuth } from '../context/AuthContext';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';

export default function IpoPage({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { isReadMode } = useAuth();
  const [ipos, setIpos] = useState<IpoData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [dataBrokerIds, setDataBrokerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [date, setDate] = useState('');
  const [count, setCount] = useState('');
  const [price, setPrice] = useState('');
  const [brokerId, setBrokerId] = useState('');
  const [search, setSearch] = useState('');

  // Edit modal
  const [editItem, setEditItem] = useState<IpoData | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCount, setEditCount] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editBrokerId, setEditBrokerId] = useState('');

  const brokerName = (id: string | null | undefined) => id ? (brokers.find(b => b.id === id)?.name ?? '—') : '—';

  const loadData = () => {
    Promise.all([getIpos(), getCompanies(), getBrokers().catch(() => [] as BrokerData[]), getUserSettings().catch(() => ({ selectedBrokerIds: [] as string[] }))])
      .then(([r, comps, brks, settings]) => {
        setIpos(r);
        setCompanies(comps);
        setBrokers(brks);
        const sel = settings.selectedBrokerIds || [];
        setSelectedBrokerIds(sel);
        setDataBrokerIds(settings.selectedDataBrokerIds || []);
        setBrokerId(prev => prev || defaultBrokerId(brks, sel));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createIpo({
        companyCode,
        date,
        count: Number(count),
        price: Number(price),
        brokerId: brokerId || null,
      });
      setDate('');
      setCount('');
      setPrice('');
      setBrokerId(defaultBrokerId(brokers, selectedBrokerIds));
      loadData();
    } catch (err) {
      console.error('Failed to create IPO', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this IPO? The linked transaction will also be deleted.')) return;
    await deleteIpo(id);
    loadData();
  };

  const openEdit = (r: IpoData) => {
    setEditItem(r);
    setEditDate(r.date);
    setEditCount(String(r.count));
    setEditPrice(String(r.price));
    setEditBrokerId(r.brokerId || '');
  };

  const handleEditSubmit = async () => {
    if (!editItem) return;
    await updateIpo(editItem.id, {
      date: editDate,
      count: Number(editCount),
      price: Number(editPrice),
      brokerId: editBrokerId || null,
    });
    setEditItem(null);
    loadData();
  };

  const totalCost = (Number(count) || 0) * (Number(price) || 0);
  const canAdd = companyCode !== '' && date !== '' && count !== '' && price !== '' && brokerId !== '';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [rSortKey, setRSortKey] = useState<'date' | 'companyCode' | 'count' | 'price' | 'total'>('date');
  const [rSortDir, setRSortDir] = useState<'asc' | 'desc'>('desc');
  const handleRSort = (key: typeof rSortKey) => {
    if (rSortKey === key) setRSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setRSortKey(key); setRSortDir(key === 'companyCode' ? 'asc' : 'desc'); }
  };
  const rsi = (key: typeof rSortKey) => rSortKey === key ? (rSortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';

  const sorted = filterByBroker(ipos, dataBrokerIds)
    .filter(r =>
      search === '' ||
      r.companyCode.toLowerCase().includes(search.toLowerCase()) ||
      r.date.includes(search)
    )
    .sort((a, b) => {
      let cmp = 0;
      if (rSortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (rSortKey === 'companyCode') cmp = a.companyCode.localeCompare(b.companyCode);
      else if (rSortKey === 'count') cmp = a.count - b.count;
      else if (rSortKey === 'price') cmp = a.price - b.price;
      else if (rSortKey === 'total') cmp = (a.count * a.price) - (b.count * b.price);
      return rSortDir === 'asc' ? cmp : -cmp;
    });

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {!embedded && <h1>IPO ({sorted.length})</h1>}

      {!isReadMode && (
      <div className="form-card">
        <h2>Add IPO</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Company
              <CompanySearchSelect companies={companies} value={companyCode} onChange={setCompanyCode} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Shares
              <input type="number" min="1" value={count} onChange={e => setCount(e.target.value)} required />
            </label>
            <label>
              Price per Share
              <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} required />
            </label>
            <label>
              Broker
              <select value={brokerId} onChange={e => setBrokerId(e.target.value)} required>
                <option value="">Select broker...</option>
                {(selectedBrokerIds.length > 0 ? brokers.filter(b => selectedBrokerIds.includes(b.id)) : brokers).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <span className="total-cost">Total Cost: {totalCost.toFixed(2)}</span>
            <button type="submit" disabled={!canAdd}>Add IPO</button>
          </div>
        </form>
      </div>
      )}

      {ipos.length >= 3 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <input
            className="search-bar"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
          />
        </div>
      )}

      {sorted.length === 0 ? (
        <p>No IPO applications yet.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleRSort('date')}>Date{rsi('date')}</th>
                <th className="sort-header" onClick={() => handleRSort('companyCode')}>Company{rsi('companyCode')}</th>
                <th>Broker</th>
                <th className="sort-header text-right" onClick={() => handleRSort('count')}>Shares{rsi('count')}</th>
                <th className="sort-header text-right" onClick={() => handleRSort('price')}>Price{rsi('price')}</th>
                <th className="sort-header text-right" onClick={() => handleRSort('total')}>Total{rsi('total')}</th>
                {!isReadMode && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${r.companyCode}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={r.companyCode} size={26} />
                      {r.companyCode}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{brokerName(r.brokerId)}</td>
                  <td className="text-right mono">{r.count}</td>
                  <td className="text-right mono">{fmt(r.price)}</td>
                  <td className="text-right mono">{fmt(r.count * r.price)}</td>
                  {!isReadMode && (
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(r) },
                      { label: 'Delete', onClick: () => handleDelete(r.id), danger: true },
                    ]} />
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {!isReadMode && editItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEditItem(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '420px', margin: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem' }}>Edit IPO</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <CompanyAvatar code={editItem.companyCode} size={32} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{editItem.companyCode}</span>
            </div>
            <div className="form-row">
              <label>
                Date
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Shares
                <input type="number" min="1" value={editCount} onChange={e => setEditCount(e.target.value)} required />
              </label>
              <label>
                Price per Share
                <input type="number" step="0.01" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Broker
                <select value={editBrokerId} onChange={e => setEditBrokerId(e.target.value)} required>
                  <option value="">Select broker...</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Total: LKR {((Number(editCount) || 0) * (Number(editPrice) || 0)).toFixed(2)}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditItem(null)} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: '1.5px solid var(--border-input)',
                background: 'transparent', cursor: 'pointer', fontSize: '0.85rem',
              }}>Cancel</button>
              <button onClick={handleEditSubmit} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                background: '#3182ce', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
