import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getShareSplits, createShareSplit, updateShareSplit, deleteShareSplit, getCompanies, ShareSplitData } from '../api';
import { Company } from '../types';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';

export default function ShareSplitsPage({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [splits, setSplits] = useState<ShareSplitData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [date, setDate] = useState('');
  const [fromShares, setFromShares] = useState('');
  const [toShares, setToShares] = useState('');

  const [editItem, setEditItem] = useState<ShareSplitData | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');

  const loadData = () => {
    Promise.all([getShareSplits(), getCompanies()])
      .then(([s, comps]) => { setSplits(s); setCompanies(comps); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createShareSplit({ companyCode, date, fromShares: Number(fromShares), toShares: Number(toShares) });
    setDate(''); setFromShares(''); setToShares('');
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this split record?')) return;
    await deleteShareSplit(id);
    loadData();
  };

  const openEdit = (s: ShareSplitData) => {
    setEditItem(s);
    setEditDate(s.date);
    setEditFrom(String(s.fromShares));
    setEditTo(String(s.toShares));
  };

  const handleEditSubmit = async () => {
    if (!editItem) return;
    await updateShareSplit(editItem.id, { date: editDate, fromShares: Number(editFrom), toShares: Number(editTo) });
    setEditItem(null);
    loadData();
  };

  const sorted = [...splits].sort((a, b) => b.date.localeCompare(a.date));

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {!embedded && <h1>Share Splits</h1>}

      <div className="form-card">
        <h2>Add Split / Merge</h2>
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
            <label>
              From (shares)
              <input type="number" min="1" value={fromShares} onChange={e => setFromShares(e.target.value)} required placeholder="e.g. 1" />
            </label>
            <label>
              To (shares)
              <input type="number" min="1" value={toShares} onChange={e => setToShares(e.target.value)} required placeholder="e.g. 10" />
            </label>
          </div>
          {Number(fromShares) > 0 && Number(toShares) > 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {Number(toShares) > Number(fromShares)
                ? `Subdivision: Every ${fromShares} share(s) becomes ${toShares} shares`
                : `Merge: Every ${fromShares} share(s) becomes ${toShares} share(s)`}
            </div>
          )}
          <div className="form-row">
            <button type="submit">Add</button>
          </div>
        </form>
      </div>

      {sorted.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No split records yet.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Type</th>
                <th className="text-right">Ratio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${s.companyCode}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={s.companyCode} size={26} />
                      {s.companyCode}
                    </div>
                  </td>
                  <td>
                    <span className={`gain-pill ${s.type === 'SUBDIVISION' ? 'gain-pill-up' : 'gain-pill-down'}`}>
                      {s.type === 'SUBDIVISION' ? 'Split' : 'Merge'}
                    </span>
                  </td>
                  <td className="text-right mono">{s.fromShares} : {s.toShares}</td>
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(s) },
                      { label: 'Delete', onClick: () => handleDelete(s.id), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEditItem(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '420px', margin: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem' }}>Edit Split</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <CompanyAvatar code={editItem.companyCode} size={32} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{editItem.companyCode}</span>
            </div>
            <div className="form-row">
              <label>Date <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} required /></label>
            </div>
            <div className="form-row">
              <label>From <input type="number" min="1" value={editFrom} onChange={e => setEditFrom(e.target.value)} required /></label>
              <label>To <input type="number" min="1" value={editTo} onChange={e => setEditTo(e.target.value)} required /></label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
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
