import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Dividends from './pages/Dividends';
import CompanyView from './pages/CompanyView';
import Companies from './pages/Companies';
import PdfUpload from './pages/PdfUpload';
import TradeSummaryUpload from './pages/TradeSummaryUpload';
import StockPrices from './pages/StockPrices';
import Sectors from './pages/Sectors';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import Watchlists from './pages/Watchlists';
import './App.css';

function App() {
  const { user, loading, isAdmin, logout } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>Loading...</div>;
  }

  if (!user) {
    return (
      <BrowserRouter>
        <div className="app" data-theme={theme === 'dark' ? 'dark' : undefined}>
          <Login />
        </div>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <div className="app" data-theme={theme === 'dark' ? 'dark' : undefined}>
        <nav className="navbar">
          <div className="nav-brand">Stock Tracker</div>
          <div className="nav-links">
            {isAdmin ? (
              <>
                <NavLink to="/" end>System Stats</NavLink>
                <NavLink to="/companies">Companies</NavLink>
                <NavLink to="/sectors">Sectors</NavLink>
                <NavLink to="/upload-summary">Upload Trade Summary</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/" end>Dashboard</NavLink>
                <NavLink to="/transactions">Transactions</NavLink>
                <NavLink to="/dividends">Dividends</NavLink>
                <NavLink to="/watchlists">Watchlists</NavLink>
                <NavLink to="/sectors">Sectors</NavLink>
                <NavLink to="/companies">Companies</NavLink>
                <NavLink to="/upload">Upload PDF</NavLink>
              </>
            )}
          </div>
          <div className="nav-right">
            <span className="nav-username">{user.username}</span>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? '\u{1F319}' : '\u{2600}\u{FE0F}'}
            </button>
            <button
              className="btn-logout"
              onClick={logout}
              aria-label="Logout"
              title="Logout"
            >
              Logout
            </button>
          </div>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={isAdmin ? <AdminDashboard key={user.username} /> : <Dashboard key={user.username} />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/dividends" element={<Dividends />} />
            <Route path="/company/:code" element={<CompanyView />} />
            <Route path="/watchlists" element={<Watchlists />} />
            <Route path="/sectors" element={<Sectors />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/stock-prices/:code" element={<StockPrices />} />
            <Route path="/upload" element={<PdfUpload />} />
            <Route path="/upload-summary" element={isAdmin ? <TradeSummaryUpload /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
