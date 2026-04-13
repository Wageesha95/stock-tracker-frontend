import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getWatchlists, createWatchlist, updateWatchlist, deleteWatchlist,
  addWatchlistCompany, removeWatchlistCompany,
  getMarketData, getCompanies, getDashboardAll, getAllDividendPayouts, getUpcomingDividends,
  getUserSettings, getSparklines, WatchlistData, DividendPayoutData, UpcomingDividendItem, SparklineData
} from '../api';
import { MarketData, Company, PortfolioItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_COLUMNS } from '../components/SettingsPanel';
import CompanyAvatar from '../components/CompanyAvatar';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

const WATCHLIST_COLORS = [
  '#3182ce', '#2b6cb0', '#63b3ed',
  '#38a169', '#2f855a', '#68d391',
  '#dd6b20', '#c05621', '#f6ad55',
  '#e53e3e', '#c53030', '#fc8181',
  '#805ad5', '#6b46c1', '#b794f4',
  '#319795', '#2c7a7b', '#81e6d9',
  '#d53f8c', '#b83280', '#fbb6ce',
  '#d69e2e', '#b7791f', '#faf089',
  '#5a67d8', '#4c51bf', '#a3bffa',
  '#0bc5ea', '#00b5d8', '#76e4f7',
  '#718096', '#4a5568', '#a0aec0',
  '#2d3748',
];

export default function Watchlists() {
  const navigate = useNavigate();
  const { isReadMode } = useAuth();
  const [watchlists, setWatchlists] = useState<WatchlistData[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [marketMap, setMarketMap] = useState<Record<string, MarketData>>({});
  const [portfolioMap, setPortfolioMap] = useState<Record<string, PortfolioItem>>({});
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [ttmYieldMap, setTtmYieldMap] = useState<Record<string, number>>({});
  const [nextDivMap, setNextDivMap] = useState<Record<string, string>>({});
  const [lastDivAmountMap, setLastDivAmountMap] = useState<Record<string, number>>({});
  const [nextAnnDateMap, setNextAnnDateMap] = useState<Record<string, string>>({});
  const [sparklines, setSparklines] = useState<Record<string, SparklineData>>({});
  const [chartPopup, setChartPopup] = useState<string | null>(null);

  const colVisible = (col: string) => {
    const cols = tableColumns['watchlist'] || DEFAULT_COLUMNS['watchlist'];
    return !cols || cols.includes(col);
  };

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(WATCHLIST_COLORS[0]);

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Drag state
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const loadData = useCallback(() => {
    return Promise.all([
      getWatchlists(),
      getMarketData(),
      getCompanies(),
      getDashboardAll(),
      getUserSettings(),
      getAllDividendPayouts().catch(() => [] as DividendPayoutData[]),
      getUpcomingDividends(3).catch(() => [] as UpcomingDividendItem[]),
      getSparklines().catch(() => ({} as Record<string, SparklineData>)),
    ])
      .then(([wls, md, comps, dash, settings, payouts, upcoming, sparks]) => {
        setSparklines(sparks);
        setWatchlists(wls);
        if (wls.length > 0 && !activeId) setActiveId(wls[0].id);
        setTableColumns(settings.tableColumns || {});

        // Market data map (latest per company)
        const map: Record<string, MarketData> = {};
        md.forEach(m => {
          if (!map[m.companyCode] || m.tradeDate > map[m.companyCode].tradeDate) {
            map[m.companyCode] = m;
          }
        });
        setMarketMap(map);

        // Portfolio map
        const pMap: Record<string, PortfolioItem> = {};
        dash.portfolio.forEach(p => { pMap[p.companyCode] = p; });
        setPortfolioMap(pMap);
        setCompanies(comps);

        // YTD: (latest price - first price this year) / first price this year * 100
        // We only have latest price per company, so skip YTD for now unless we have history
        // Use changePercent as proxy or calculate from dashboard data

        // TTM Yield: sum of dividends in last 12 months / current price * 100
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const cutoff = oneYearAgo.toISOString().split('T')[0];
        const byCode: Record<string, DividendPayoutData[]> = {};
        payouts.forEach(p => { (byCode[p.companyCode] = byCode[p.companyCode] || []).push(p); });
        const yields: Record<string, number> = {};
        const lastAmounts: Record<string, number> = {};
        for (const [code, divs] of Object.entries(byCode)) {
          const sorted = divs.sort((a, b) => b.exDividendDate.localeCompare(a.exDividendDate));
          const ttm = sorted.filter(d => d.exDividendDate >= cutoff);
          const total = ttm.reduce((s, d) => s + (d.amountPerShare ? Number(d.amountPerShare) : 0), 0);
          const price = map[code]?.lastTrade;
          if (total > 0 && price > 0) yields[code] = (total / price) * 100;
          if (sorted[0]?.amountPerShare) lastAmounts[code] = Number(sorted[0].amountPerShare);
        }
        setTtmYieldMap(yields);
        setLastDivAmountMap(lastAmounts);

        // Next possible dividend date and announcement date from upcoming predictions
        const nextDivs: Record<string, string> = {};
        const nextAnns: Record<string, string> = {};
        upcoming.forEach(u => {
          if (u.history.length > 0) {
            const latest = u.history[0];
            nextDivs[u.companyCode] = latest.exDividendDate;
            if (latest.announcementDate) nextAnns[u.companyCode] = latest.announcementDate;
          }
        });
        setNextDivMap(nextDivs);
        setNextAnnDateMap(nextAnns);
      });
  }, [activeId]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAddDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const active = watchlists.find(w => w.id === activeId);

  const handleCreate = async () => {
    const name = newName.trim() || 'My Watchlist';
    const wl = await createWatchlist(name, newColor);
    setWatchlists(prev => [...prev, wl]);
    setActiveId(wl.id);
    setNewName('');
    setNewColor(WATCHLIST_COLORS[0]);
    setShowCreate(false);
  };

  const handleDelete = async () => {
    if (!active) return;
    await deleteWatchlist(active.id);
    const remaining = watchlists.filter(w => w.id !== active.id);
    setWatchlists(remaining);
    setActiveId(remaining.length > 0 ? remaining[0].id : null);
    setConfirmDelete(false);
    setShowSettings(false);
  };

  const handleSaveSettings = async () => {
    if (!active) return;
    const updated = await updateWatchlist(active.id, { name: editName.trim() || active.name, color: editColor });
    setWatchlists(prev => prev.map(w => w.id === active.id ? updated : w));
    setShowSettings(false);
  };

  const openSettings = () => {
    if (!active) return;
    setEditName(active.name);
    setEditColor(active.color || WATCHLIST_COLORS[0]);
    setConfirmDelete(false);
    setShowSettings(true);
  };

  const handleAddCompany = async (code: string) => {
    if (!active) return;
    const updated = await addWatchlistCompany(active.id, code);
    setWatchlists(prev => prev.map(w => w.id === active.id ? updated : w));
    setShowAddDropdown(false);
    setSearchTerm('');
  };

  const handleRemoveCompany = async (code: string) => {
    if (!active || !confirm(`Remove ${code} from this watchlist?`)) return;
    const updated = await removeWatchlistCompany(active.id, code);
    setWatchlists(prev => prev.map(w => w.id === active.id ? updated : w));
  };

  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = async (idx: number) => {
    if (dragIdx.current === null || dragIdx.current === idx || !active) return;
    const codes = [...active.companyCodes];
    const [moved] = codes.splice(dragIdx.current, 1);
    codes.splice(idx, 0, moved);
    const updated = { ...active, companyCodes: codes };
    setWatchlists(prev => prev.map(w => w.id === active.id ? updated : w));
    dragIdx.current = null;
    setDragOverIdx(null);
    await updateWatchlist(active.id, { companyCodes: codes });
  };
  const handleDragEnd = () => { dragIdx.current = null; setDragOverIdx(null); };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  const availableCompanies = companies.filter(c =>
    !active?.companyCodes.includes(c.code) &&
    (searchTerm === '' || c.code.toLowerCase().includes(searchTerm.toLowerCase()) || c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Watchlists</h1>

      {/* Watchlist nav tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        {watchlists.map(wl => {
          const isActive = activeId === wl.id;
          const color = (wl.color && wl.color.startsWith('#')) ? wl.color : '#3182ce';
          return (
            <button
              key={wl.id}
              onClick={() => { setActiveId(wl.id); setShowSettings(false); setShowCreate(false); }}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '20px',
                border: isActive ? `2px solid ${color}` : '2px solid var(--border-color)',
                background: isActive ? color : 'transparent',
                color: isActive ? 'white' : 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              {!isActive && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />}
              {wl.name}
              <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>({wl.companyCodes?.length || 0})</span>
            </button>
          );
        })}
        {!isReadMode && (
        <button
          onClick={() => { setShowCreate(!showCreate); setShowSettings(false); }}
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: '6px',
            border: '1.5px dashed var(--border-input)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          + New
        </button>
        )}
      </div>

      {/* Create form */}
      {!isReadMode && showCreate && (
        <div className="form-card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem' }}>Create Watchlist</h3>
          <form onSubmit={e => { e.preventDefault(); handleCreate(); }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ flex: 1 }}>
                Name
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="My Watchlist"
                  autoFocus
                  style={{ width: '100%', padding: '0.4rem 0.5rem' }}
                />
              </label>
              <label>
                Color
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.25rem', maxWidth: '300px' }}>
                  {WATCHLIST_COLORS.map(c => (
                    <div
                      key={c}
                      onClick={() => setNewColor(c)}
                      style={{
                        width: 22, height: 22, borderRadius: '4px', background: c, cursor: 'pointer',
                        border: newColor === c ? '2.5px solid var(--text-primary)' : '1px solid transparent',
                        boxSizing: 'border-box', transition: 'transform 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                  ))}
                </div>
              </label>
              <button type="submit" style={{ padding: '0.4rem 1rem' }}>Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Active watchlist */}
      {active && !showCreate && (
        <>
          {/* Toolbar */}
          {!isReadMode && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                onClick={() => setShowAddDropdown(!showAddDropdown)}
                style={{
                  padding: '0.4rem 1rem', borderRadius: '6px',
                  border: '1.5px solid var(--border-input)', background: 'transparent',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                + Add Company
              </button>
              {showAddDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, zIndex: 100,
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '8px', boxShadow: 'var(--shadow-dropdown)',
                  width: '280px', maxHeight: '300px', overflow: 'auto', marginTop: '0.25rem',
                }}>
                  <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <input
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Search companies..."
                      autoFocus
                      style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  {availableCompanies.length === 0 ? (
                    <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No companies found</div>
                  ) : (
                    availableCompanies.map(c => (
                      <div
                        key={c.code}
                        onClick={() => handleAddCompany(c.code)}
                        style={{
                          padding: '0.5rem 0.75rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-dropdown-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <CompanyAvatar code={c.code} size={28} />
                        <span style={{ fontWeight: 600 }}>{c.code}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{c.name}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={openSettings}
              style={{
                padding: '0.4rem 1rem', borderRadius: '6px',
                border: '1.5px solid var(--border-input)', background: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Settings
            </button>
          </div>
          )}

          {/* Settings panel */}
          {!isReadMode && showSettings && (
            <div className="form-card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem' }}>Watchlist Settings</h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <label style={{ flex: 1 }}>
                  Name
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    style={{ width: '100%', padding: '0.4rem 0.5rem' }}
                  />
                </label>
                <label>
                  Color
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.25rem', maxWidth: '300px' }}>
                    {WATCHLIST_COLORS.map(c => (
                      <div
                        key={c}
                        onClick={() => setEditColor(c)}
                        style={{
                          width: 22, height: 22, borderRadius: '4px', background: c, cursor: 'pointer',
                          border: editColor === c ? '2.5px solid var(--text-primary)' : '1px solid transparent',
                          boxSizing: 'border-box', transition: 'transform 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                    ))}
                  </div>
                </label>
                <button onClick={handleSaveSettings} style={{ padding: '0.4rem 1rem' }}>Save</button>
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{
                      padding: '0.4rem 1rem', borderRadius: '6px',
                      border: '1.5px solid #e53e3e', background: 'transparent',
                      color: '#e53e3e', cursor: 'pointer', fontSize: '0.85rem',
                    }}
                  >
                    Delete Watchlist
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#e53e3e', fontWeight: 600, fontSize: '0.85rem' }}>
                      Are you sure? This cannot be undone.
                    </span>
                    <button
                      onClick={handleDelete}
                      style={{
                        padding: '0.4rem 1rem', borderRadius: '6px',
                        border: 'none', background: '#e53e3e',
                        color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                      }}
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        padding: '0.4rem 1rem', borderRadius: '6px',
                        border: '1.5px solid var(--border-input)', background: 'transparent',
                        color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Watchlist table */}
          {active.companyCodes.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No companies in this watchlist. Click "+ Add Company" to get started.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}></th>
                    <th>Company</th>
                    {colVisible('sharesHeld') && <th className="text-right">Shares</th>}
                    {colVisible('avgBuyPrice') && <th className="text-right">Avg Buy</th>}
                    {colVisible('lastTrade') && <th className="text-right">Last Trade</th>}
                    {colVisible('changePercent') && <th className="text-right">Change %</th>}
                    {colVisible('totalInvested') && <th className="text-right">Invested</th>}
                    {colVisible('currentValue') && <th className="text-right">Value</th>}
                    {colVisible('unrealizedGain') && <th className="text-right">Unrealized</th>}
                    {colVisible('unrealizedGainPercent') && <th className="text-right">Gain %</th>}
                    {colVisible('ytd') && <th className="text-right">YTD %</th>}
                    {colVisible('ttmYield') && <th className="text-right">TTM Yield</th>}
                    {colVisible('nextDivDate') && <th className="text-right">Next Div</th>}
                    {colVisible('lastDivAmount') && <th className="text-right">Last Div</th>}
                    {colVisible('nextAnnDate') && <th className="text-right">Next Ann.</th>}
                    {colVisible('sparkline') && <th style={{ width: 100 }}>YTD</th>}
                    {!isReadMode && <th style={{ width: '30px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {active.companyCodes.map((code, idx) => {
                    const md = marketMap[code];
                    const p = portfolioMap[code];
                    const comp = companies.find(c => c.code === code);
                    return (
                      <tr
                        key={code}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        style={{
                          cursor: 'grab',
                          borderTop: dragOverIdx === idx ? `2px solid ${active.color || '#3182ce'}` : undefined,
                        }}
                      >
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'grab' }}>
                          &#x2630;
                        </td>
                        <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${code}`)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CompanyAvatar code={code} size={36} />
                            <div className="company-cell">
                              <span className="company-code">{code}</span>
                              {comp && comp.name !== code && (
                                <span className="company-name">{comp.name}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        {colVisible('sharesHeld') && <td className="text-right mono">{p ? p.sharesHeld : '\u2014'}</td>}
                        {colVisible('avgBuyPrice') && <td className="text-right mono">{p ? fmt(p.avgBuyPrice) : '\u2014'}</td>}
                        {colVisible('lastTrade') && <td className="text-right mono">{md ? fmt(md.lastTrade) : '\u2014'}</td>}
                        {colVisible('changePercent') && <td className="text-right mono">
                          {md ? (
                            <span className={`gain-pill ${md.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                              {gainSign(md.changePercent)}{fmt(md.changePercent)}%
                            </span>
                          ) : '\u2014'}
                        </td>}
                        {colVisible('totalInvested') && <td className="text-right mono">{p ? fmt(p.totalInvested) : '\u2014'}</td>}
                        {colVisible('currentValue') && <td className="text-right mono">{p ? fmt(p.currentValue) : '\u2014'}</td>}
                        {colVisible('unrealizedGain') && <td className={`text-right mono ${p ? gainClass(p.unrealizedGain) : ''}`}>
                          {p ? `${gainSign(p.unrealizedGain)}${fmt(p.unrealizedGain)}` : '\u2014'}
                        </td>}
                        {colVisible('unrealizedGainPercent') && <td className="text-right mono">
                          {p ? (
                            <span className={`gain-pill ${p.unrealizedGainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                              {gainSign(p.unrealizedGainPercent)}{fmt(p.unrealizedGainPercent)}%
                            </span>
                          ) : '\u2014'}
                        </td>}
                        {colVisible('ytd') && <td className="text-right mono">{'\u2014'}</td>}
                        {colVisible('ttmYield') && <td className="text-right mono">
                          {ttmYieldMap[code] != null ? ttmYieldMap[code].toFixed(2) + '%' : '\u2014'}
                        </td>}
                        {colVisible('nextDivDate') && <td className="text-right mono" style={{ fontSize: '0.85rem' }}>
                          {nextDivMap[code] || '\u2014'}
                        </td>}
                        {colVisible('lastDivAmount') && <td className="text-right mono">
                          {lastDivAmountMap[code] != null ? fmt(lastDivAmountMap[code]) : '\u2014'}
                        </td>}
                        {colVisible('nextAnnDate') && <td className="text-right mono" style={{ fontSize: '0.85rem' }}>
                          {nextAnnDateMap[code] || '\u2014'}
                        </td>}
                        {colVisible('sparkline') && (() => {
                          const sd = sparklines[code];
                          if (!sd || sd.prices.length < 2) return <td style={{ width: 90 }}>{'\u2014'}</td>;
                          const { prices, dates } = sd;
                          const color = prices[prices.length - 1] >= prices[0] ? '#38a169' : '#e53e3e';
                          const min = Math.min(...prices);
                          const max = Math.max(...prices);
                          const range = max - min || 1;
                          const w = 80, h = 28;
                          const points = prices.map((p, i) => `${(i / (prices.length - 1)) * w},${h - ((p - min) / range) * h}`).join(' ');
                          return (
                            <td style={{ width: 90, padding: '0.2rem', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setChartPopup(code); }}
                              title={`${dates[0]} \u2192 ${dates[dates.length - 1]} | ${prices[0].toFixed(2)} \u2192 ${prices[prices.length - 1].toFixed(2)}`}>
                              <svg width={w} height={h} style={{ display: 'block' }}>
                                <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
                              </svg>
                            </td>
                          );
                        })()}
                        {!isReadMode && (
                        <td>
                          <button
                            onClick={() => handleRemoveCompany(code)}
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--text-muted)', cursor: 'pointer',
                              fontSize: '0.85rem', padding: '0.25rem',
                            }}
                            title="Remove from watchlist"
                          >
                            x
                          </button>
                        </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {watchlists.length === 0 && !showCreate && (
        <p style={{ color: 'var(--text-muted)' }}>No watchlists yet. Click "+ New" to create one.</p>
      )}

      {chartPopup && (() => {
        const sd = sparklines[chartPopup];
        if (!sd || sd.prices.length < 2) return null;
        const { prices, dates } = sd;
        const comp = companies.find(c => c.code === chartPopup);
        const p = portfolioMap[chartPopup];
        const color = prices[prices.length - 1] >= prices[0] ? '#38a169' : '#e53e3e';
        const data = prices.map((pr, i) => ({ date: dates[i] || '', price: pr }));
        return (
          <div onClick={() => setChartPopup(null)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
              width: '100%', maxWidth: '700px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CompanyAvatar code={chartPopup} size={32} />
                  <div>
                    <span style={{ fontWeight: 700 }}>{chartPopup}</span>
                    {comp && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>{comp.name}</span>}
                  </div>
                </div>
                <button onClick={() => setChartPopup(null)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '1.5rem', lineHeight: 1,
                }}>&times;</button>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={d => d.substring(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} domain={['auto', 'auto']} tickFormatter={v => fmt(v)} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    formatter={(v: any) => [`LKR ${fmt(v)}`, 'Price']} labelFormatter={l => l} />
                  {p && p.avgBuyPrice > 0 && (
                    <ReferenceLine y={p.avgBuyPrice} stroke="#3182ce" strokeDasharray="6 3" strokeWidth={1.5}
                      label={{ value: `Avg: ${fmt(p.avgBuyPrice)}`, position: 'right', fontSize: 10, fill: '#3182ce' }} />
                  )}
                  <Line type="monotone" dataKey="price" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
