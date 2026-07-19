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
import LoginHistory from './pages/LoginHistory';
import UpcomingDividends from './pages/UpcomingDividends';
import Summary from './pages/Summary';
import MarketDataScraper from './pages/MarketDataScraper';
import MarketData from './pages/MarketData';
import AdminMessages from './pages/AdminMessages';
import SettingsPanel from './components/SettingsPanel';
import NavDropdown from './components/NavDropdown';
import NotesPanel from './components/NotesPanel';
import MessagePanel from './components/MessagePanel';
import { getUnreadMessageCount, getUnreadReplyCount } from './api';
import './App.css';

const PING_URL = 'https://stock-tracker-backend-2.onrender.com/api/auth/me';
const PING_INTERVAL = 14 * 60 * 1000 + 50 * 1000; // 14m 50s

function App() {
  const { user, loading, isAdmin, isReadMode, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    const id = setInterval(() => { fetch(PING_URL).catch(() => {}); }, PING_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Admin: keep the unread-message badge fresh (poll + react to inbox actions).
  useEffect(() => {
    if (!isAdmin) return;
    const refresh = () => getUnreadMessageCount().then(setUnreadMessages).catch(() => {});
    refresh();
    const id = setInterval(refresh, 60_000);
    window.addEventListener('admin-messages-updated', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('admin-messages-updated', refresh);
    };
  }, [isAdmin]);

  // Non-admin: badge the envelope when the admin has replied.
  useEffect(() => {
    if (isAdmin) return;
    const refresh = () => getUnreadReplyCount().then(setUnreadReplies).catch(() => {});
    refresh();
    const id = setInterval(refresh, 60_000);
    window.addEventListener('user-replies-read', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('user-replies-read', refresh);
    };
  }, [isAdmin]);

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
                <NavLink to="/scrape-market-data" onClick={() => setMenuOpen(false)}>Scrape Market Data</NavLink>
                <NavLink to="/login-history" onClick={() => setMenuOpen(false)}>Login History</NavLink>
                <NavLink to="/messages" onClick={() => setMenuOpen(false)}>
                  Messages{unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/" end onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
                <NavLink to="/transactions" onClick={() => setMenuOpen(false)}>Transactions</NavLink>
                <NavLink to="/dividends" onClick={() => setMenuOpen(false)}>Dividends</NavLink>
                <NavLink to="/rights-ipo" onClick={() => setMenuOpen(false)}>Corporate Actions</NavLink>
                <NavLink to="/sectors" onClick={() => setMenuOpen(false)}>Sectors</NavLink>
                <NavLink to="/companies" onClick={() => setMenuOpen(false)}>Companies</NavLink>
                <NavLink to="/calculator" onClick={() => setMenuOpen(false)}>Calculator</NavLink>
                <NavDropdown
                  label="Advanced"
                  onNavigate={() => setMenuOpen(false)}
                  items={[
                    { to: '/summary', label: 'Summary' },
                    { to: '/upcoming-dividends', label: 'Upcoming Dividends' },
                    { to: '/watchlists', label: 'Watchlists' },
                    { to: '/market-data', label: 'Market Data' },
                  ]}
                />
                {!isReadMode && <NavLink to="/upload" onClick={() => setMenuOpen(false)}>Upload</NavLink>}
              </>
            )}
          </div>
          <div className="nav-right">
            <span className="nav-username">{user.username}<span style={{ marginLeft: '0.4rem', fontSize: '0.85rem' }} title={isReadMode ? 'Read Only' : 'Privileged'}>{isReadMode ? '\uD83D\uDC41' : '\u270F\uFE0F'}</span></span>
            {!isAdmin && (
              <>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <button
                    className="btn-settings-gear"
                    onClick={() => setMessageOpen(true)}
                    aria-label="Message Admin"
                    title="Message Admin"
                  >
                    &#9993;
                  </button>
                  {unreadReplies > 0 && <span className="icon-badge">{unreadReplies}</span>}
                </span>
                <button
                  className="btn-settings-gear"
                  onClick={() => setNotesOpen(true)}
                  aria-label="Notes"
                  title="Notes"
                >
                  &#128221;
                </button>
                <button
                  className="btn-settings-gear"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Settings"
                  title="Settings"
                >
                  &#9881;
                </button>
              </>
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
            <Route path="/summary" element={<Summary />} />
            <Route path="/upcoming-dividends" element={<UpcomingDividends />} />
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
            <Route path="/market-data" element={<MarketData />} />
            <Route path="/upload-summary" element={isAdmin ? <TradeSummaryUpload /> : <Navigate to="/" />} />
            <Route path="/scrape-dividends" element={isAdmin ? <DividendScraper /> : <Navigate to="/" />} />
            <Route path="/scrape-market-data" element={isAdmin ? <MarketDataScraper /> : <Navigate to="/" />} />
            <Route path="/login-history" element={isAdmin ? <LoginHistory /> : <Navigate to="/" />} />
            <Route path="/messages" element={isAdmin ? <AdminMessages /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} />
        <MessagePanel open={messageOpen} onClose={() => setMessageOpen(false)} />
      </div>
    </BrowserRouter>
  );
}

export default App;
