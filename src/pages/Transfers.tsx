import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  getShareTransfers, createShareTransfer, updateShareTransfer, deleteShareTransfer,
  getTransferAvailability, getCompanies, getBrokers,
  ShareTransferData, BrokerData,
} from '../api';
import { Company } from '../types';
import { useAuth } from '../context/AuthContext';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';

const todayIso = () => new Date().toISOString().slice(0, 10);

// The API rejects an over-sized or same-broker transfer with a specific reason;
// surface that rather than a generic failure message.
const apiErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
  }
  return fallback;
};

export default function Transfers({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { isReadMode } = useAuth();
  const [transfers, setTransfers] = useState<ShareTransferData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [date, setDate] = useState(todayIso());
  const [count, setCount] = useState('');
  const [fromBrokerId, setFromBrokerId] = useState('');
  const [toBrokerId, setToBrokerId] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // What the source broker holds on the chosen date, and the price the shares would
  // carry across. Server-derived — the user never types the price.
  const [available, setAvailable] = useState<{ shares: number; avgPrice: number } | null>(null);
  const [checking, setChecking] = useState(false);

  // Edit modal
  const [editItem, setEditItem] = useState<ShareTransferData | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCount, setEditCount] = useState('');
  const [editFromBrokerId, setEditFromBrokerId] = useState('');
  const [editToBrokerId, setEditToBrokerId] = useState('');
  const [editNote, setEditNote] = useState('');

  const brokerName = (id: string | null | undefined) => id ? (brokers.find(b => b.id === id)?.name ?? '—') : '—';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadData = () => {
    Promise.all([
      getShareTransfers(),
      getCompanies(),
      getBrokers().catch(() => [] as BrokerData[]),
    ])
      .then(([trs, comps, brks]) => {
        setTransfers(trs);
        setCompanies(comps);
        setBrokers(brks);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  // A transfer needs at least two brokers to move shares between, so the source
  // list is never narrowed by the user's selected-brokers setting.
  const availableBrokers = brokers;
  const destinationBrokers = availableBrokers.filter(b => b.id !== fromBrokerId);

  // Re-check the source holding whenever the company, broker or date changes.
  useEffect(() => {
    if (!companyCode || !fromBrokerId || !date) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    getTransferAvailability(companyCode, fromBrokerId, date)
      .then(r => { if (!cancelled) setAvailable({ shares: r.shares, avgPrice: r.avgPrice }); })
      .catch(() => { if (!cancelled) setAvailable(null); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [companyCode, fromBrokerId, date]);

  const resetForm = () => {
    setCount('');
    setNote('');
    setAvailable(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createShareTransfer({
        companyCode,
        date,
        count: Number(count),
        fromBrokerId,
        toBrokerId,
        note: note.trim() || null,
      });
      resetForm();
      loadData();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to record transfer'));
      console.error('Failed to create share transfer', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transfer? Both of its transaction legs will also be deleted.')) return;
    try {
      await deleteShareTransfer(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete share transfer', err);
    }
  };

  const openEdit = (t: ShareTransferData) => {
    setEditItem(t);
    setEditDate(t.date);
    setEditCount(String(t.count));
    setEditFromBrokerId(t.fromBrokerId);
    setEditToBrokerId(t.toBrokerId);
    setEditNote(t.note || '');
    setError(null);
  };

  const handleEditSubmit = async () => {
    if (!editItem) return;
    try {
      await updateShareTransfer(editItem.id, {
        date: editDate,
        count: Number(editCount),
        fromBrokerId: editFromBrokerId,
        toBrokerId: editToBrokerId,
        note: editNote.trim() || null,
      });
      setEditItem(null);
      loadData();
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update transfer'));
      console.error('Failed to update share transfer', err);
    }
  };

  const requestedCount = Number(count) || 0;
  const exceedsHolding = available != null && requestedCount > available.shares;
  const transferValue = requestedCount * (available?.avgPrice || 0);
  const canAdd =
    companyCode !== '' && date !== '' && count !== '' && requestedCount > 0 &&
    fromBrokerId !== '' && toBrokerId !== '' && fromBrokerId !== toBrokerId &&
    !exceedsHolding && !checking;

  const [sortKey, setSortKey] = useState<'date' | 'companyCode' | 'count' | 'price' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'companyCode' ? 'asc' : 'desc'); }
  };
  const si = (key: typeof sortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  const sorted = transfers
    .filter(t =>
      search === '' ||
      t.companyCode.toLowerCase().includes(search.toLowerCase()) ||
      t.date.includes(search) ||
      brokerName(t.fromBrokerId).toLowerCase().includes(search.toLowerCase()) ||
      brokerName(t.toBrokerId).toLowerCase().includes(search.toLowerCase()) ||
      (t.note || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'companyCode') cmp = a.companyCode.localeCompare(b.companyCode);
      else if (sortKey === 'count') cmp = a.count - b.count;
      else if (sortKey === 'price') cmp = a.price - b.price;
      else if (sortKey === 'total') cmp = (a.count * a.price) - (b.count * b.price);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {!embedded && <h1>Share Transfers ({sorted.length})</h1>}

      {!isReadMode && (
      <div className="form-card">
        <h2>Transfer Shares Between Brokers</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Moves shares from one broker to another at their current average price. No
          money changes hands and no commission is charged, so your holding, cost and
          average price stay exactly the same — only the broker changes.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Company
              <CompanySearchSelect companies={companies} value={companyCode} onChange={setCompanyCode} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Transfer Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              From Broker
              <select
                value={fromBrokerId}
                onChange={e => {
                  setFromBrokerId(e.target.value);
                  // Keep the pair valid if the user picks the current destination.
                  if (e.target.value === toBrokerId) setToBrokerId('');
                }}
                required
              >
                <option value="">Select broker...</option>
                {availableBrokers.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label>
              To Broker
              <select value={toBrokerId} onChange={e => setToBrokerId(e.target.value)} required>
                <option value="">Select broker...</option>
                {destinationBrokers.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Shares to Transfer
              <input
                type="number"
                min="1"
                max={available?.shares || undefined}
                value={count}
                onChange={e => setCount(e.target.value)}
                required
              />
            </label>
            <label>
              Note (optional)
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. CDS reference"
              />
            </label>
          </div>

          {companyCode && fromBrokerId && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {checking ? 'Checking holding...' : available
                ? <>Available at {brokerName(fromBrokerId)} on {date}: <strong>{available.shares}</strong> shares
                    {' '}at avg <strong>{fmt(available.avgPrice)}</strong></>
                : 'No holding found at that broker on that date.'}
            </div>
          )}
          {exceedsHolding && (
            <div style={{ fontSize: '0.85rem', color: '#e53e3e', marginBottom: '0.75rem' }}>
              Only {available?.shares} shares are held at {brokerName(fromBrokerId)} on {date}.
            </div>
          )}
          {error && (
            <div style={{ fontSize: '0.85rem', color: '#e53e3e', marginBottom: '0.75rem' }}>{error}</div>
          )}

          <div className="form-row">
            <span className="total-cost">
              Transfer Value: {fmt(transferValue)} (no charges)
            </span>
            <button type="submit" disabled={!canAdd}>Transfer Shares</button>
          </div>
        </form>
      </div>
      )}

      {transfers.length >= 3 && (
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
        <p>No share transfers yet.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleSort('date')}>Date{si('date')}</th>
                <th className="sort-header" onClick={() => handleSort('companyCode')}>Company{si('companyCode')}</th>
                <th>From</th>
                <th>To</th>
                <th className="sort-header text-right" onClick={() => handleSort('count')}>Shares{si('count')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('price')}>Avg Price{si('price')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('total')}>Value{si('total')}</th>
                <th>Note</th>
                {!isReadMode && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${t.companyCode}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={t.companyCode} size={26} />
                      {t.companyCode}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{brokerName(t.fromBrokerId)}</td>
                  <td style={{ fontSize: '0.85rem' }}>{brokerName(t.toBrokerId)}</td>
                  <td className="text-right mono">{t.count}</td>
                  <td className="text-right mono">{fmt(t.price)}</td>
                  <td className="text-right mono">{fmt(t.count * t.price)}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.note || '—'}</td>
                  {!isReadMode && (
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(t) },
                      { label: 'Delete', onClick: () => handleDelete(t.id), danger: true },
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
            <h2 style={{ margin: '0 0 1rem' }}>Edit Transfer</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <CompanyAvatar code={editItem.companyCode} size={32} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{editItem.companyCode}</span>
            </div>
            <div className="form-row">
              <label>
                Transfer Date
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                From Broker
                <select
                  value={editFromBrokerId}
                  onChange={e => {
                    setEditFromBrokerId(e.target.value);
                    if (e.target.value === editToBrokerId) setEditToBrokerId('');
                  }}
                  required
                >
                  <option value="">Select broker...</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
              <label>
                To Broker
                <select value={editToBrokerId} onChange={e => setEditToBrokerId(e.target.value)} required>
                  <option value="">Select broker...</option>
                  {brokers.filter(b => b.id !== editFromBrokerId).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Shares
                <input type="number" min="1" value={editCount} onChange={e => setEditCount(e.target.value)} required />
              </label>
              <label>
                Note
                <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)} />
              </label>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              The average price is re-derived from the source holding when you save, so
              both legs stay in step.
            </div>
            {error && (
              <div style={{ fontSize: '0.85rem', color: '#e53e3e', marginBottom: '0.75rem' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditItem(null)} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: '1.5px solid var(--border-input)',
                background: 'transparent', cursor: 'pointer', fontSize: '0.85rem',
              }}>Cancel</button>
              <button
                onClick={handleEditSubmit}
                disabled={editFromBrokerId === '' || editToBrokerId === '' || editFromBrokerId === editToBrokerId || Number(editCount) <= 0}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                  background: '#3182ce', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
