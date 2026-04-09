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
import RightsPage from './pages/Rights';
import AvgCalculator from './pages/AvgCalculator';
import IpoPage from './pages/Ipos';
import RightsAndIpo from './pages/RightsAndIpo';
import DividendScraper from './pages/DividendScraper';
import SettingsPanel from './components/SettingsPanel';
import './App.css';

const PING_URL = 'https://stock-tracker-backend-2.onrender.com/api/auth/me';
const PING_INTERVAL = 14 * 60 * 1000 + 50 * 1000; // 14m 50s

function App() {
  const { user, loading, isAdmin, isReadMode, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    const id = setInterval(() => { fetch(PING_URL).catch(() => {}); }, PING_INTERVAL);
    return () => clearInterval(id);
  }, []);

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
          <NavLink to="/" className="nav-brand" style={{ textDecoration: 'none', color: 'white' }}>Stock Tracker</NavLink>
          <button className="nav-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <div className={`nav-links ${menuOpen ? 'nav-links-open' : ''}`}>
            {isAdmin ? (
              <>
                <NavLink to="/" end onClick={() => setMenuOpen(false)}>System Stats</NavLink>
                <NavLink to="/companies" onClick={() => setMenuOpen(false)}>Companies</NavLink>
                <NavLink to="/sectors" onClick={() => setMenuOpen(false)}>Sectors</NavLink>
                <NavLink to="/upload-summary" onClick={() => setMenuOpen(false)}>Upload Trade Summary</NavLink>
                <NavLink to="/scrape-dividends" onClick={() => setMenuOpen(false)}>Scrape Dividends</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/" end onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
                <NavLink to="/transactions" onClick={() => setMenuOpen(false)}>Transactions</NavLink>
                <NavLink to="/dividends" onClick={() => setMenuOpen(false)}>Dividends</NavLink>
                <NavLink to="/rights-ipo" onClick={() => setMenuOpen(false)}>Corporate Actions</NavLink>
                <NavLink to="/watchlists" onClick={() => setMenuOpen(false)}>Watchlists</NavLink>
                <NavLink to="/sectors" onClick={() => setMenuOpen(false)}>Sectors</NavLink>
                <NavLink to="/companies" onClick={() => setMenuOpen(false)}>Companies</NavLink>
                <NavLink to="/calculator" onClick={() => setMenuOpen(false)}>Calculator</NavLink>
                {!isReadMode && <NavLink to="/upload" onClick={() => setMenuOpen(false)}>Upload PDF</NavLink>}
              </>
            )}
          </div>
          <div className="nav-right">
            <span className="nav-username">{user.username}<span style={{ marginLeft: '0.4rem', fontSize: '0.85rem' }} title={isReadMode ? 'Read Only' : 'Privileged'}>{isReadMode ? '\uD83D\uDC41' : '\u270F\uFE0F'}</span></span>
            {!isAdmin && (
              <button
                className="btn-settings-gear"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                title="Settings"
              >
                &#9881;
              </button>
            )}
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
            <Route path="/rights-ipo" element={<RightsAndIpo />} />
            <Route path="/rights" element={<RightsPage />} />
            <Route path="/ipos" element={<IpoPage />} />
            <Route path="/calculator" element={<AvgCalculator />} />
            <Route path="/company/:code" element={<CompanyView />} />
            <Route path="/watchlists" element={<Watchlists />} />
            <Route path="/sectors" element={<Sectors />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/stock-prices/:code" element={<StockPrices />} />
            <Route path="/upload" element={<PdfUpload />} />
            <Route path="/upload-summary" element={isAdmin ? <TradeSummaryUpload /> : <Navigate to="/" />} />
            <Route path="/scrape-dividends" element={isAdmin ? <DividendScraper /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </BrowserRouter>
  );
}

export default App;
