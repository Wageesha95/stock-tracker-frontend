import { useEffect, useMemo, useState } from 'react';
import { getAdminStats, getSystemStats, createAdminUser, updateAdminUser, deleteAdminUser, unlockUser, toggleDividendPayouts, getAllDividendPayouts, createDividendPayout, updateDividendPayout, deleteDividendPayout, DividendPayoutData, getBrokers, createBroker, deleteBroker, BrokerData, getRightsRecords, setRightsRecordDisabled, RightsRecord } from '../api';
import ActionMenu from '../components/ActionMenu';
import ShareSplitsPage from './ShareSplits';
import { useTableSort } from '../hooks/useTableSort';

const emptyPayoutForm = { companyCode: '', exDividendDate: '', amountPerShare: '', paymentDate: '', announcementDate: '', dividendType: '' };
type PayoutForm = typeof emptyPayoutForm;

interface UserStat {
  id: string;
  username: string;
  role: string;
  transactionCount: number;
  locked: boolean;
  dividendPayoutsEnabled: boolean;
  createdAt: string;
}

export default function AdminDashboard() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [sysStats, setSysStats] = useState<{
    companies: number; transactions: number; dividends: number; dividendPayouts: number;
    marketData: number; stockPrices: number; industryGroups: number; watchlists: number;
    loginHistory: number; latestMarketDate: string | null; marketDataDates: number;
  } | null>(null);

  // Create user
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('USER');
  const [createError, setCreateError] = useState('');

  // Login history

  // Edit user
  const [editUser, setEditUser] = useState<UserStat | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editError, setEditError] = useState('');

  // Dividend payouts (calendar) management
  const [payouts, setPayouts] = useState<DividendPayoutData[]>([]);
  const [payoutSearch, setPayoutSearch] = useState('');
  const [showAddPayout, setShowAddPayout] = useState(false);
  const [addPayout, setAddPayout] = useState<PayoutForm>(emptyPayoutForm);
  const [editPayout, setEditPayout] = useState<DividendPayoutData | null>(null);
  const [editPayoutForm, setEditPayoutForm] = useState<PayoutForm>(emptyPayoutForm);
  const [payoutError, setPayoutError] = useState('');

  // Brokers
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [newBrokerName, setNewBrokerName] = useState('');
  const [brokerError, setBrokerError] = useState('');

  const [rightsRecords, setRightsRecords] = useState<RightsRecord[]>([]);

  const [tab, setTab] = useState<'users' | 'brokers' | 'dividends' | 'splits' | 'rights'>('users');

  const loadData = () => {
    Promise.all([
      getAdminStats().then(data => { setTotalUsers(data.totalUsers); setUsers(data.users); }),
      getSystemStats().then(setSysStats),
      getAllDividendPayouts().then(setPayouts).catch(() => setPayouts([])),
      getBrokers().then(setBrokers).catch(() => setBrokers([])),
      getRightsRecords().then(setRightsRecords).catch(() => setRightsRecords([])),
    ]).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    setCreateError('');
    try {
      await createAdminUser({ username: newUsername, password: newPassword, role: newRole });
      setNewUsername(''); setNewPassword(''); setNewRole('USER'); setShowCreate(false);
      loadData();
    } catch (err: any) {
      setCreateError(err?.response?.data?.error || 'Failed to create user');
    }
  };

  const openEdit = (u: UserStat) => {
    setEditUser(u);
    setEditUsername(u.username);
    setEditPassword('');
    setEditRole(u.role);
    setEditError('');
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setEditError('');
    try {
      const data: any = {};
      if (editUsername !== editUser.username) data.username = editUsername;
      if (editPassword) data.password = editPassword;
      if (editRole !== editUser.role) data.role = editRole;
      await updateAdminUser(editUser.id, data);
      setEditUser(null);
      loadData();
    } catch (err: any) {
      setEditError(err?.response?.data?.error || 'Failed to update user');
    }
  };

  const handleUnlock = async (u: UserStat) => {
    try {
      await unlockUser(u.id);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to unlock user');
    }
  };

  const handleToggleDividends = async (u: UserStat) => {
    try {
      await toggleDividendPayouts(u.id);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to toggle dividend payouts');
    }
  };

  const handleDelete = async (u: UserStat) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(u.id);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete user');
    }
  };

  // ---- Dividend payout (calendar) CRUD ----
  const formToInput = (f: PayoutForm, base?: DividendPayoutData) => ({
    companyCode: f.companyCode.trim().toUpperCase(),
    exDividendDate: f.exDividendDate,
    amountPerShare: f.amountPerShare === '' ? null : Number(f.amountPerShare),
    paymentDate: f.paymentDate || null,
    announcementDate: f.announcementDate || null,
    dividendType: f.dividendType.trim() || null,
    // Preserve any scraped prices already on the record; manual entry doesn't set them.
    priceOnXdDate: base?.priceOnXdDate ?? null,
    priceOnAnnouncementDate: base?.priceOnAnnouncementDate ?? null,
  });

  const handleCreatePayout = async () => {
    setPayoutError('');
    if (!addPayout.companyCode.trim() || !addPayout.exDividendDate) {
      setPayoutError('Company and XD date are required');
      return;
    }
    try {
      await createDividendPayout(formToInput(addPayout));
      setAddPayout(emptyPayoutForm);
      setShowAddPayout(false);
      loadData();
    } catch (err: any) {
      setPayoutError(err?.response?.data?.error || 'Failed to create payout');
    }
  };

  const openEditPayout = (p: DividendPayoutData) => {
    setEditPayout(p);
    setPayoutError('');
    setEditPayoutForm({
      companyCode: p.companyCode,
      exDividendDate: p.exDividendDate || '',
      amountPerShare: p.amountPerShare != null ? String(p.amountPerShare) : '',
      paymentDate: p.paymentDate || '',
      announcementDate: p.announcementDate || '',
      dividendType: p.dividendType || '',
    });
  };

  const handleUpdatePayout = async () => {
    if (!editPayout?.id) return;
    setPayoutError('');
    if (!editPayoutForm.exDividendDate) {
      setPayoutError('XD date is required');
      return;
    }
    try {
      await updateDividendPayout(editPayout.id, formToInput(editPayoutForm, editPayout));
      setEditPayout(null);
      loadData();
    } catch (err: any) {
      setPayoutError(err?.response?.data?.error || 'Failed to update payout');
    }
  };

  const handleDeletePayout = async (p: DividendPayoutData) => {
    if (!p.id || !confirm(`Delete ${p.companyCode} payout (XD ${p.exDividendDate})?`)) return;
    try {
      await deleteDividendPayout(p.id);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete payout');
    }
  };

  const filteredPayouts = useMemo(() => {
    const s = payoutSearch.trim().toLowerCase();
    return payouts.filter(p => s === '' || p.companyCode.toLowerCase().includes(s) || (p.exDividendDate || '').includes(s));
  }, [payouts, payoutSearch]);

  // Sortable admin tables.
  const usersSort = useTableSort(users, 'username', 'asc');
  const brokersSort = useTableSort(brokers, 'name', 'asc');
  const payoutsSort = useTableSort(filteredPayouts, 'exDividendDate');
  const rightsSort = useTableSort(rightsRecords, 'userId', 'asc');

  // ---- Broker CRUD ----
  const handleAddBroker = async () => {
    setBrokerError('');
    if (!newBrokerName.trim()) { setBrokerError('Broker name is required'); return; }
    try {
      await createBroker(newBrokerName.trim());
      setNewBrokerName('');
      loadData();
    } catch (err: any) {
      setBrokerError(err?.response?.data?.error || 'Failed to add broker');
    }
  };

  const handleDeleteBroker = async (b: BrokerData) => {
    if (!confirm(`Delete broker "${b.name}"? Transactions already tagged with it keep their brokerId.`)) return;
    try {
      await deleteBroker(b.id);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete broker');
    }
  };

  const handleToggleRights = async (r: RightsRecord, value: boolean) => {
    try {
      await setRightsRecordDisabled(r.userId, r.companyCode, value);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update rights record');
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
        <button onClick={() => { setLoading(true); loadData(); }} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><h3>Users</h3><p className="stat-value">{totalUsers}</p></div>
        <div className="stat-card"><h3>Companies</h3><p className="stat-value">{sysStats?.companies ?? '-'}</p></div>
        <div className="stat-card"><h3>Transactions</h3><p className="stat-value">{sysStats?.transactions ?? '-'}</p></div>
        <div className="stat-card"><h3>Dividends</h3><p className="stat-value">{sysStats?.dividends ?? '-'}</p></div>
        <div className="stat-card"><h3>Dividend Payouts</h3><p className="stat-value">{sysStats?.dividendPayouts ?? '-'}</p></div>
        <div className="stat-card"><h3>Market Data</h3><p className="stat-value">{sysStats?.marketData ?? '-'}</p><small style={{ color: 'var(--text-muted)' }}>{sysStats?.marketDataDates ?? 0} dates</small></div>
        <div className="stat-card"><h3>Industries</h3><p className="stat-value">{sysStats?.industryGroups ?? '-'}</p></div>
        <div className="stat-card"><h3>Latest Market</h3><p className="stat-value" style={{ fontSize: '1.1rem' }}>{sysStats?.latestMarketDate ?? '-'}</p></div>
      </div>

      <div className="segmented-control" style={{ marginTop: '2rem' }}>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
        <button className={tab === 'brokers' ? 'active' : ''} onClick={() => setTab('brokers')}>Brokers</button>
        <button className={tab === 'dividends' ? 'active' : ''} onClick={() => setTab('dividends')}>Dividend Records</button>
        <button className={tab === 'splits' ? 'active' : ''} onClick={() => setTab('splits')}>Share Splits</button>
        <button className={tab === 'rights' ? 'active' : ''} onClick={() => setTab('rights')}>Rights (.R)</button>
      </div>

      {tab === 'users' && (<>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
          {showCreate ? 'Cancel' : '+ New User'}
        </button>
      </div>

      {showCreate && (
        <div className="form-card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem' }}>Create User</h3>
          <div className="form-row">
            <label>
              Username
              <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="username" />
            </label>
            <label>
              Password
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="password" />
            </label>
            <label>
              Role
              <div className="radio-group">
                <label className="radio-label">
                  <input type="radio" checked={newRole === 'USER'} onChange={() => setNewRole('USER')} /> USER
                </label>
                <label className="radio-label">
                  <input type="radio" checked={newRole === 'ADMIN'} onChange={() => setNewRole('ADMIN')} /> ADMIN
                </label>
              </div>
            </label>
          </div>
          {createError && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{createError}</div>}
          <button onClick={handleCreate}>Create</button>
        </div>
      )}

      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="sort-header" onClick={() => usersSort.handleSort('username')}>Username{usersSort.sortIcon('username')}</th>
              <th className="sort-header" onClick={() => usersSort.handleSort('role')}>Role{usersSort.sortIcon('role')}</th>
              <th className="sort-header text-right" onClick={() => usersSort.handleSort('transactionCount')}>Transactions{usersSort.sortIcon('transactionCount')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usersSort.sorted.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>
                  {u.username}
                  {u.locked && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#e53e3e', fontWeight: 600 }}>LOCKED</span>}
                </td>
                <td>
                  <span className="gain-pill"
                    style={u.role === 'ADMIN' ? { background: '#bee3f8', color: '#2a4365' } : { background: '#e2e8f0', color: '#4a5568' }}>
                    {u.role}
                  </span>
                </td>
                <td className="text-right mono">{u.transactionCount}</td>
                <td>
                  <ActionMenu actions={[
                    { label: 'Edit', onClick: () => openEdit(u) },
                    ...(u.locked ? [{ label: 'Unlock', onClick: () => handleUnlock(u) }] : []),
                    { label: u.dividendPayoutsEnabled ? 'Disable Payouts' : 'Enable Payouts', onClick: () => handleToggleDividends(u) },
                    { label: 'Delete', onClick: () => handleDelete(u), danger: true },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}

      {tab === 'brokers' && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ margin: '0 0 0.5rem' }}>Brokers</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
            Brokers are shared across all users and are available in PDF upload and the broker data filter.
          </p>
          <div className="form-card" style={{ marginBottom: '1.5rem' }}>
            <div className="form-row" style={{ alignItems: 'flex-end' }}>
              <label style={{ flex: 1 }}>
                Broker Name
                <input type="text" value={newBrokerName} onChange={e => setNewBrokerName(e.target.value)} placeholder="e.g. NDB Securities" onKeyDown={e => { if (e.key === 'Enter') handleAddBroker(); }} />
              </label>
              <button onClick={handleAddBroker}>+ Add Broker</button>
            </div>
            {brokerError && <div className="error-message" style={{ marginTop: '0.5rem' }}>{brokerError}</div>}
          </div>
          {brokers.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No brokers yet.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr><th className="sort-header" onClick={() => brokersSort.handleSort('name')}>Name{brokersSort.sortIcon('name')}</th><th></th></tr>
                </thead>
                <tbody>
                  {brokersSort.sorted.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.name}</td>
                      <td>
                        <ActionMenu actions={[{ label: 'Delete', onClick: () => handleDeleteBroker(b), danger: true }]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'dividends' && (<>
      {/* Dividend Payouts (Calendar) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2.5rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Dividend Payouts (Calendar)</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {payouts.length >= 5 && (
            <input className="search-bar" value={payoutSearch} onChange={e => setPayoutSearch(e.target.value)} placeholder="Search company / date..." />
          )}
          <button onClick={() => { setShowAddPayout(!showAddPayout); setPayoutError(''); }} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            {showAddPayout ? 'Cancel' : '+ Add Payout'}
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
        Manually add or fix the "to be received" dividends (value / XD date / payment date) that drive the pending &amp; upcoming views. Showing records from the last 2 years.
      </p>

      {showAddPayout && (
        <div className="form-card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem' }}>Add Payout</h3>
          <div className="form-row">
            <label>Company<input type="text" value={addPayout.companyCode} onChange={e => setAddPayout(f => ({ ...f, companyCode: e.target.value }))} placeholder="e.g. CDB.X" /></label>
            <label>XD Date<input type="date" value={addPayout.exDividendDate} onChange={e => setAddPayout(f => ({ ...f, exDividendDate: e.target.value }))} /></label>
            <label>Amount/Share (LKR)<input type="number" step="0.01" min="0" value={addPayout.amountPerShare} onChange={e => setAddPayout(f => ({ ...f, amountPerShare: e.target.value }))} /></label>
          </div>
          <div className="form-row">
            <label>Payment Date<input type="date" value={addPayout.paymentDate} onChange={e => setAddPayout(f => ({ ...f, paymentDate: e.target.value }))} /></label>
            <label>Announced<input type="date" value={addPayout.announcementDate} onChange={e => setAddPayout(f => ({ ...f, announcementDate: e.target.value }))} /></label>
            <label>Type<input type="text" value={addPayout.dividendType} onChange={e => setAddPayout(f => ({ ...f, dividendType: e.target.value }))} placeholder="Cash / Scrip" /></label>
          </div>
          {payoutError && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{payoutError}</div>}
          <button onClick={handleCreatePayout}>Add Payout</button>
        </div>
      )}

      {payouts.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No dividend payout records.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => payoutsSort.handleSort('companyCode')}>Company{payoutsSort.sortIcon('companyCode')}</th>
                <th className="sort-header" onClick={() => payoutsSort.handleSort('exDividendDate')}>XD Date{payoutsSort.sortIcon('exDividendDate')}</th>
                <th className="sort-header text-right" onClick={() => payoutsSort.handleSort('amountPerShare')}>Amount/Share{payoutsSort.sortIcon('amountPerShare')}</th>
                <th className="sort-header" onClick={() => payoutsSort.handleSort('paymentDate')}>Payment Date{payoutsSort.sortIcon('paymentDate')}</th>
                <th className="sort-header" onClick={() => payoutsSort.handleSort('announcementDate')}>Announced{payoutsSort.sortIcon('announcementDate')}</th>
                <th className="sort-header" onClick={() => payoutsSort.handleSort('dividendType')}>Type{payoutsSort.sortIcon('dividendType')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payoutsSort.sorted.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.companyCode}</td>
                  <td className="mono">{p.exDividendDate || '—'}</td>
                  <td className="text-right mono">{p.amountPerShare != null ? Number(p.amountPerShare).toFixed(2) : '—'}</td>
                  <td className="mono" style={{ fontSize: '0.85rem' }}>{p.paymentDate || '—'}</td>
                  <td className="mono" style={{ fontSize: '0.85rem' }}>{p.announcementDate || '—'}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.dividendType || '—'}</td>
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEditPayout(p) },
                      { label: 'Delete', onClick: () => handleDeletePayout(p), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      </>)}

      {tab === 'splits' && (
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Share Splits / Merges</h2>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
          Subdivisions and merges adjust historical share counts and prices across all views from their date onward.
        </p>
        <ShareSplitsPage embedded />
      </div>
      )}

      {tab === 'rights' && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ margin: '0 0 0.5rem' }}>Rights (.R) Records</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
            Purchased rights holdings (".R" codes) per user. Disabled records are excluded from that user's calculations.
          </p>
          {rightsRecords.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No .R records.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => rightsSort.handleSort('userId')}>User{rightsSort.sortIcon('userId')}</th>
                    <th className="sort-header" onClick={() => rightsSort.handleSort('companyCode')}>Rights Code{rightsSort.sortIcon('companyCode')}</th>
                    <th className="sort-header text-right" onClick={() => rightsSort.handleSort('shares')}>Shares{rightsSort.sortIcon('shares')}</th>
                    <th className="sort-header text-right hide-sm" onClick={() => rightsSort.handleSort('txCount')}>Txns{rightsSort.sortIcon('txCount')}</th>
                    <th className="sort-header" onClick={() => rightsSort.handleSort('disabled')}>Status{rightsSort.sortIcon('disabled')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rightsSort.sorted.map(r => (
                    <tr key={`${r.userId}|${r.companyCode}`} style={r.disabled ? { opacity: 0.55 } : undefined}>
                      <td style={{ fontWeight: 600 }}>{r.userId}</td>
                      <td className="mono">{r.companyCode}</td>
                      <td className="text-right mono">{r.shares}</td>
                      <td className="text-right mono hide-sm">{r.txCount}</td>
                      <td>
                        <span className="gain-pill" style={r.disabled ? { fontSize: '0.65rem', background: '#e2e8f0', color: '#4a5568' } : { fontSize: '0.65rem', background: '#c6f6d5', color: '#22543d' }}>
                          {r.disabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleToggleRights(r, true)}
                            disabled={r.disabled}
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderRadius: '6px', border: '1.5px solid var(--border-input)', background: 'transparent', color: 'var(--text-primary)', cursor: r.disabled ? 'default' : 'pointer', fontWeight: 600, opacity: r.disabled ? 0.5 : 1 }}
                          >
                            Disable
                          </button>
                          <button
                            onClick={() => handleToggleRights(r, false)}
                            disabled={!r.disabled}
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: '#3182ce', color: 'white', cursor: !r.disabled ? 'default' : 'pointer', fontWeight: 600, opacity: !r.disabled ? 0.5 : 1 }}
                          >
                            Enable
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEditUser(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '420px', margin: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem' }}>Edit User</h2>
            <div className="form-row">
              <label>
                Username
                <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} />
              </label>
            </div>
            <div className="form-row">
              <label>
                New Password <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(leave blank to keep current)</span>
                <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="unchanged" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Role
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" checked={editRole === 'USER'} onChange={() => setEditRole('USER')} /> USER
                  </label>
                  <label className="radio-label">
                    <input type="radio" checked={editRole === 'ADMIN'} onChange={() => setEditRole('ADMIN')} /> ADMIN
                  </label>
                </div>
              </label>
            </div>
            {editError && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{editError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setEditUser(null)} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: '1.5px solid var(--border-input)',
                background: 'transparent', cursor: 'pointer', fontSize: '0.85rem',
              }}>Cancel</button>
              <button onClick={handleEdit} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                background: '#3182ce', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payout Modal */}
      {editPayout && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEditPayout(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '520px', margin: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem' }}>Edit Payout — {editPayout.companyCode}</h2>
            <div className="form-row">
              <label>Company<input type="text" value={editPayoutForm.companyCode} onChange={e => setEditPayoutForm(f => ({ ...f, companyCode: e.target.value }))} /></label>
              <label>XD Date<input type="date" value={editPayoutForm.exDividendDate} onChange={e => setEditPayoutForm(f => ({ ...f, exDividendDate: e.target.value }))} /></label>
            </div>
            <div className="form-row">
              <label>Amount/Share (LKR)<input type="number" step="0.01" min="0" value={editPayoutForm.amountPerShare} onChange={e => setEditPayoutForm(f => ({ ...f, amountPerShare: e.target.value }))} /></label>
              <label>Type<input type="text" value={editPayoutForm.dividendType} onChange={e => setEditPayoutForm(f => ({ ...f, dividendType: e.target.value }))} placeholder="Cash / Scrip" /></label>
            </div>
            <div className="form-row">
              <label>Payment Date<input type="date" value={editPayoutForm.paymentDate} onChange={e => setEditPayoutForm(f => ({ ...f, paymentDate: e.target.value }))} /></label>
              <label>Announced<input type="date" value={editPayoutForm.announcementDate} onChange={e => setEditPayoutForm(f => ({ ...f, announcementDate: e.target.value }))} /></label>
            </div>
            {payoutError && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{payoutError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setEditPayout(null)} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: '1.5px solid var(--border-input)',
                background: 'transparent', cursor: 'pointer', fontSize: '0.85rem',
              }}>Cancel</button>
              <button onClick={handleUpdatePayout} style={{
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
