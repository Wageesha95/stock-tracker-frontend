import { useEffect, useState } from 'react';
import { getLoginHistory, LoginHistoryItem } from '../api';
import { useTableSort } from '../hooks/useTableSort';

export default function LoginHistory() {
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { sorted, handleSort, sortIcon } = useTableSort(history, 'timestamp');

  const loadData = () => {
    setLoading(true);
    return getLoginHistory()
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Login History</h1>
        <button
          onClick={() => { setRefreshing(true); loadData().finally(() => setRefreshing(false)); }}
          disabled={refreshing}
          style={{
            background: 'transparent',
            border: '1.5px solid var(--border-input)',
            borderRadius: '8px',
            padding: '0.35rem 0.75rem',
            fontSize: '0.85rem',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'all 0.15s',
          }}
          title="Refresh data"
        >
          {refreshing ? 'Refreshing...' : '\u21BB Refresh'}
        </button>
      </div>
      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="sort-header" onClick={() => handleSort('username')}>User{sortIcon('username')}</th>
              <th className="sort-header" onClick={() => handleSort('action')}>Action{sortIcon('action')}</th>
              <th>Mode</th>
              <th className="sort-header" onClick={() => handleSort('device')}>Device{sortIcon('device')}</th>
              <th className="sort-header" onClick={() => handleSort('ipAddress')}>IP{sortIcon('ipAddress')}</th>
              <th className="sort-header" onClick={() => handleSort('location')}>Location{sortIcon('location')}</th>
              <th className="sort-header" onClick={() => handleSort('timestamp')}>Time{sortIcon('timestamp')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(h => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600 }}>{h.username}</td>
                <td>
                  <span className="gain-pill" style={h.action === 'LOGIN'
                    ? { background: '#c6f6d5', color: '#276749' }
                    : h.action === 'FAILED_LOGIN'
                    ? { background: '#fefcbf', color: '#744210' }
                    : { background: '#fed7d7', color: '#9b2c2c' }
                  }>{h.action === 'FAILED_LOGIN' ? 'FAILED' : h.action}</span>
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
            {history.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No login history yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
