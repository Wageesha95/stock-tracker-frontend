import { useEffect, useState } from 'react';
import { getAdminStats } from '../api';

interface UserStat {
  username: string;
  role: string;
  transactionCount: number;
}

export default function AdminDashboard() {
  const [totalUsers, setTotalUsers] = useState(0);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats()
      .then(data => {
        setTotalUsers(data.totalUsers);
        setUsers(data.users);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Admin Dashboard</h1>

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

      <h2 style={{ marginTop: '2rem' }}>Users</h2>
      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th className="text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.username}>
                <td style={{ fontWeight: 600 }}>{u.username}</td>
                <td>
                  <span className={`gain-pill ${u.role === 'ADMIN' ? 'gain-pill-up' : 'gain-pill-down'}`}
                    style={u.role === 'ADMIN' ? { background: '#bee3f8', color: '#2a4365' } : { background: '#e2e8f0', color: '#4a5568' }}>
                    {u.role}
                  </span>
                </td>
                <td className="text-right mono">{u.transactionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
