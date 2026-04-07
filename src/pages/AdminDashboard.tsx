import { useEffect, useState } from 'react';
import { getAdminStats, createAdminUser, updateAdminUser, deleteAdminUser, unlockUser, getLoginHistory, LoginHistoryItem } from '../api';
import ActionMenu from '../components/ActionMenu';

interface UserStat {
  id: string;
  username: string;
  role: string;
  transactionCount: number;
  locked: boolean;
  createdAt: string;
}

export default function AdminDashboard() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('USER');
  const [createError, setCreateError] = useState('');

  // Login history
  const [loginHistory, setLoginHistory] = useState<LoginHistoryItem[]>([]);

  // Edit user
  const [editUser, setEditUser] = useState<UserStat | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editError, setEditError] = useState('');

  const loadData = () => {
    const p1 = getAdminStats()
      .then(data => { setTotalUsers(data.totalUsers); setUsers(data.users); })
      .catch(console.error);
    const p2 = getLoginHistory()
      .then(history => setLoginHistory(history))
      .catch(console.error);
    Promise.all([p1, p2]).finally(() => setLoading(false));
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

  const handleDelete = async (u: UserStat) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(u.id);
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete user');
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
        <div className="stat-card">
          <h3>Total Users</h3>
          <p className="stat-value">{totalUsers}</p>
        </div>
        <div className="stat-card">
          <h3>Total Transactions</h3>
          <p className="stat-value">{users.reduce((s, u) => s + u.transactionCount, 0)}</p>
        </div>
      </div>

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
              <th>Username</th>
              <th>Role</th>
              <th className="text-right">Transactions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
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
                    { label: 'Delete', onClick: () => handleDelete(u), danger: true },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Login History</h2>
      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Action</th>
              <th>Mode</th>
              <th>Device</th>
              <th>IP</th>
              <th>Location</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {loginHistory.map(h => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600 }}>{h.username}</td>
                <td>
                  <span className="gain-pill" style={h.action === 'LOGIN'
                    ? { background: '#c6f6d5', color: '#276749' }
                    : { background: '#fed7d7', color: '#9b2c2c' }
                  }>{h.action}</span>
                </td>
                <td title={h.action === 'LOGIN' ? (h.readMode ? 'Read Only' : 'Privileged') : ''} style={{ textAlign: 'center' }}>
                  {h.action === 'LOGIN' && (
                    <span style={{ fontSize: '1rem' }}>{h.readMode ? '\uD83D\uDC41' : '\u270F\uFE0F'}</span>
                  )}
                </td>
                <td style={{ fontSize: '0.75rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.device}>
                  {h.device}
                </td>
                <td className="mono" style={{ fontSize: '0.8rem' }}>{h.ipAddress}</td>
                <td style={{ fontSize: '0.8rem' }}>{h.location || ''}</td>
                <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {new Date(h.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
            {loginHistory.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No login history yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
