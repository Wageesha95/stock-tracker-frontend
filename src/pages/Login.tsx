import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (isSignup) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }
    setLoading(true);
    try {
      if (isSignup) {
        await signup(username.trim(), password);
      } else {
        await login(username, password);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || (isSignup ? 'Could not create account' : 'Invalid username or password');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: '100%', maxWidth: '360px', padding: '2rem' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Stock Tracker</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete={isSignup ? 'username' : 'username'}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
            />
          </div>
          {isSignup && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600 }}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
              />
            </div>
          )}
          {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}
          <button
            className="btn-upload"
            type="submit"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Create Account' : 'Sign In')}
          </button>
        </form>
        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={switchMode}
            style={{ background: 'none', border: 'none', color: 'var(--text-link, #3b82f6)', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}
          >
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </div>
        {isSignup && (
          <p style={{ marginTop: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Public signup is capped at 10 new accounts per day.
          </p>
        )}
      </div>
    </div>
  );
}
