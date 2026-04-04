import { useEffect, useState, useRef, useCallback } from 'react';
import {
  getWatchlists, createWatchlist, updateWatchlist, deleteWatchlist,
  addWatchlistCompany, removeWatchlistCompany,
  getMarketData, getCompanies, getDashboardAll, WatchlistData
} from '../api';
import { MarketData, Company, PortfolioItem } from '../types';
import CompanyAvatar from '../components/CompanyAvatar';

const WATCHLIST_COLORS = [
  { name: 'Blue', value: '#3182ce' },
  { name: 'Green', value: '#38a169' },
  { name: 'Orange', value: '#dd6b20' },
  { name: 'Red', value: '#e53e3e' },
  { name: 'Purple', value: '#805ad5' },
  { name: 'Teal', value: '#319795' },
  { name: 'Pink', value: '#d53f8c' },
  { name: 'Yellow', value: '#d69e2e' },
];

export default function Watchlists() {
  const [watchlists, setWatchlists] = useState<WatchlistData[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [marketMap, setMarketMap] = useState<Record<string, MarketData>>({});
  const [portfolioMap, setPortfolioMap] = useState<Record<string, PortfolioItem>>({});
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(WATCHLIST_COLORS[0].value);

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
    return Promise.all([getWatchlists(), getMarketData(), getCompanies(), getDashboardAll()])
      .then(([wls, md, comps, dash]) => {
        setWatchlists(wls);
        if (wls.length > 0 && !activeId) setActiveId(wls[0].id);
        const map: Record<string, MarketData> = {};
        md.forEach(m => {
          if (!map[m.companyCode] || m.tradeDate > map[m.companyCode].tradeDate) {
            map[m.companyCode] = m;
          }
        });
        setMarketMap(map);
        const pMap: Record<string, PortfolioItem> = {};
        dash.portfolio.forEach(p => { pMap[p.companyCode] = p; });
        setPortfolioMap(pMap);
        setCompanies(comps);
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
    setNewColor(WATCHLIST_COLORS[0].value);
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
    setEditColor(active.color || WATCHLIST_COLORS[0].value);
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
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        {watchlists.map(wl => {
          const isActive = activeId === wl.id;
          const color = (wl.color && wl.color.startsWith('#')) ? wl.color : '#3182ce';
          return (
            <button
              key={wl.id}
              onClick={() => { setActiveId(wl.id); setShowSettings(false); setShowCreate(false); }}
              style={{
                padding: '0.4rem 1rem',
                borderRadius: '6px',
                border: `2px solid ${color}`,
                background: isActive ? color : 'transparent',
                color: isActive ? 'white' : color,
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {wl.name}
            </button>
          );
        })}
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
      </div>

      {/* Create form */}
      {showCreate && (
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
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem' }}>
                  {WATCHLIST_COLORS.map(c => (
                    <div
                      key={c.value}
                      onClick={() => setNewColor(c.value)}
                      title={c.name}
                      style={{
                        width: 26, height: 26, borderRadius: '50%', background: c.value, cursor: 'pointer',
                        border: newColor === c.value ? '3px solid var(--text-primary)' : '2px solid transparent',
                        boxSizing: 'border-box',
                      }}
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

          {/* Settings panel */}
          {showSettings && (
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
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.25rem' }}>
                    {WATCHLIST_COLORS.map(c => (
                      <div
                        key={c.value}
                        onClick={() => setEditColor(c.value)}
                        title={c.name}
                        style={{
                          width: 26, height: 26, borderRadius: '50%', background: c.value, cursor: 'pointer',
                          border: editColor === c.value ? '3px solid var(--text-primary)' : '2px solid transparent',
                          boxSizing: 'border-box',
                        }}
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
                    <th className="text-right">Shares</th>
                    <th className="text-right">Avg Buy</th>
                    <th className="text-right">Last Trade</th>
                    <th className="text-right">Change %</th>
                    <th className="text-right">Invested</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Unrealized</th>
                    <th className="text-right">Gain %</th>
                    <th style={{ width: '30px' }}></th>
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
                        <td>
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
                        <td className="text-right mono">{p ? p.sharesHeld : '\u2014'}</td>
                        <td className="text-right mono">{p ? fmt(p.avgBuyPrice) : '\u2014'}</td>
                        <td className="text-right mono">{md ? fmt(md.lastTrade) : '\u2014'}</td>
                        <td className="text-right mono">
                          {md ? (
                            <span className={`gain-pill ${md.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                              {gainSign(md.changePercent)}{fmt(md.changePercent)}%
                            </span>
                          ) : '\u2014'}
                        </td>
                        <td className="text-right mono">{p ? fmt(p.totalInvested) : '\u2014'}</td>
                        <td className="text-right mono">{p ? fmt(p.currentValue) : '\u2014'}</td>
                        <td className={`text-right mono ${p ? gainClass(p.unrealizedGain) : ''}`}>
                          {p ? `${gainSign(p.unrealizedGain)}${fmt(p.unrealizedGain)}` : '\u2014'}
                        </td>
                        <td className="text-right mono">
                          {p ? (
                            <span className={`gain-pill ${p.unrealizedGainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                              {gainSign(p.unrealizedGainPercent)}{fmt(p.unrealizedGainPercent)}%
                            </span>
                          ) : '\u2014'}
                        </td>
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
    </div>
  );
}
