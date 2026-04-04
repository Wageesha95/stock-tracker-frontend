import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardAll, getIndustryGroups, getCompanies, createIndustryGroup, updateIndustryGroup, deleteIndustryGroup, invalidate } from '../api';
import { IndustryGroup, Company } from '../types';
import { useAuth } from '../context/AuthContext';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import CompanyAvatar from '../components/CompanyAvatar';

interface SectorCompany {
  companyCode: string;
  companyName: string;
  sharesHeld: number;
  currentValue: number;
  totalInvested: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  unrealizedDayGain: number;
  changePercent: number;
}

interface SectorItem {
  sector: string;
  companies: SectorCompany[];
  currentValue: number;
  totalInvested: number;
  unrealizedGain: number;
  unrealizedDayGain: number;
  companyCount: number;
}

type SectorSortKey = 'sector' | 'companyCount' | 'totalInvested' | 'currentValue' | 'allocation' | 'unrealizedGain' | 'unrealizedDayGain';
type CompanySortKey = 'companyCode' | 'sharesHeld' | 'totalInvested' | 'currentValue' | 'allocation' | 'unrealizedGain' | 'unrealizedDayGain';
type SortDir = 'asc' | 'desc';

const COLORS = [
  '#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5',
  '#dd6b20', '#319795', '#d53f8c', '#5a67d8', '#2c7a7b',
  '#b83280', '#c05621', '#2f855a', '#6b46c1', '#2b6cb0',
];

export default function Sectors() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'allocation' | 'industries'>(isAdmin ? 'industries' : 'allocation');
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [industryGroups, setIndustryGroups] = useState<IndustryGroup[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  // Industry CRUD state
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [sectorSortKey, setSectorSortKey] = useState<SectorSortKey>('currentValue');
  const [sectorSortDir, setSectorSortDir] = useState<SortDir>('desc');
  const [companySortKey, setCompanySortKey] = useState<CompanySortKey>('currentValue');
  const [companySortDir, setCompanySortDir] = useState<SortDir>('desc');

  useEffect(() => {
    Promise.all([getDashboardAll(), getIndustryGroups(), getCompanies()])
      .then(([data, groups, comps]) => {
        setSectors(data.sectors || []);
        setIndustryGroups(groups);
        setCompanies(comps);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  const totalPortfolioValue = sectors.reduce((s, sec) => s + sec.currentValue, 0);

  const getAllocation = (value: number) => totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;

  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sectorSortKey === 'sector') {
        av = a.sector; bv = b.sector;
      } else if (sectorSortKey === 'allocation') {
        av = a.currentValue; bv = b.currentValue;
      } else {
        av = a[sectorSortKey]; bv = b[sectorSortKey];
      }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sectorSortDir === 'asc' ? cmp : -cmp;
    });
  }, [sectors, sectorSortKey, sectorSortDir]);

  const sortCompanies = (companies: SectorCompany[]) => {
    return [...companies].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (companySortKey === 'companyCode') {
        av = a.companyCode; bv = b.companyCode;
      } else if (companySortKey === 'allocation') {
        av = a.currentValue; bv = b.currentValue;
      } else {
        av = a[companySortKey]; bv = b[companySortKey];
      }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return companySortDir === 'asc' ? cmp : -cmp;
    });
  };

  const handleSectorSort = (key: SectorSortKey) => {
    if (sectorSortKey === key) {
      setSectorSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSectorSortKey(key);
      setSectorSortDir(key === 'sector' ? 'asc' : 'desc');
    }
  };

  const handleCompanySort = (key: CompanySortKey, e: React.MouseEvent) => {
    e.stopPropagation();
    if (companySortKey === key) {
      setCompanySortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCompanySortKey(key);
      setCompanySortDir(key === 'companyCode' ? 'asc' : 'desc');
    }
  };

  const sortIcon = (active: boolean, dir: SortDir) => {
    if (!active) return ' \u2195';
    return dir === 'asc' ? ' \u2191' : ' \u2193';
  };

  // Track original color index per sector
  const sectorColorMap = useMemo(() => {
    const map: Record<string, number> = {};
    sectors.forEach((s, i) => { map[s.sector] = i; });
    return map;
  }, [sectors]);

  const pieData = sectors.map(s => ({
    name: s.sector,
    value: s.currentValue,
  }));

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const created = await createIndustryGroup(newGroupName.trim());
    setIndustryGroups(prev => [...prev, created]);
    setNewGroupName('');
  };

  const handleUpdateGroup = async (id: string) => {
    if (!editName.trim()) return;
    const updated = await updateIndustryGroup(id, editName.trim());
    setIndustryGroups(prev => prev.map(g => g.id === id ? updated : g));
    setEditingId(null);
  };

  const handleDeleteGroup = async (id: string) => {
    await deleteIndustryGroup(id);
    setIndustryGroups(prev => prev.filter(g => g.id !== id));
    setConfirmDeleteId(null);
    invalidate('companies', 'dashboard-all');
  };

  const getCompanyCount = (groupId: string) => companies.filter(c => c.industryGroupId === groupId).length;

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Sectors</h1>
        <div className="segmented-control">
          {!isAdmin && <button className={tab === 'allocation' ? 'active' : ''} onClick={() => setTab('allocation')}>Allocation</button>}
          <button className={tab === 'industries' ? 'active' : ''} onClick={() => setTab('industries')}>Industries ({industryGroups.length})</button>
        </div>
      </div>

      {tab === 'industries' && (
        <div>
          {/* Add new industry */}
          {isAdmin && (
            <form onSubmit={e => { e.preventDefault(); handleCreateGroup(); }} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="New industry name..."
                style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
              />
              <button type="submit" style={{ padding: '0.5rem 1.25rem' }}>Add</button>
            </form>
          )}

          {industryGroups.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No industries defined yet.</p>
          ) : (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Industry Name</th>
                    <th className="text-right">Companies</th>
                    {isAdmin && <th style={{ width: '150px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {[...industryGroups].sort((a, b) => a.name.localeCompare(b.name)).map(g => (
                    <tr key={g.id}>
                      <td>
                        {editingId === g.id ? (
                          <form onSubmit={e => { e.preventDefault(); handleUpdateGroup(g.id); }} style={{ display: 'flex', gap: '0.25rem' }}>
                            <input
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              autoFocus
                              style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem', flex: 1 }}
                              onBlur={() => setEditingId(null)}
                            />
                          </form>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{g.name}</span>
                        )}
                      </td>
                      <td className="text-right mono">{getCompanyCount(g.id)}</td>
                      {isAdmin && (
                        <td className="text-right">
                          {confirmDeleteId === g.id ? (
                            <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => handleDeleteGroup(g.id)}
                                style={{
                                  padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none',
                                  background: '#e53e3e', color: 'white', cursor: 'pointer', fontSize: '0.75rem',
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                style={{
                                  padding: '0.25rem 0.5rem', borderRadius: '4px',
                                  border: '1px solid var(--border-input)', background: 'transparent',
                                  cursor: 'pointer', fontSize: '0.75rem',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => { setEditingId(g.id); setEditName(g.name); }}
                                style={{
                                  padding: '0.25rem 0.5rem', borderRadius: '4px',
                                  border: '1px solid var(--border-input)', background: 'transparent',
                                  cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)',
                                }}
                              >
                                Rename
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(g.id)}
                                style={{
                                  padding: '0.25rem 0.5rem', borderRadius: '4px',
                                  border: '1px solid #e53e3e', background: 'transparent',
                                  cursor: 'pointer', fontSize: '0.75rem', color: '#e53e3e',
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'allocation' && (<>
      {sectors.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
            <div style={{ flex: '1 1 350px', minHeight: 350 }}>
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    innerRadius={55}
                    dataKey="value"
                    label={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => `LKR ${fmt(value)}`}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ fontSize: '0.75rem', lineHeight: '1.6' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ flex: '1 1 300px' }}>
              <div className="stats-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="stat-card">
                  <h3>Total Portfolio</h3>
                  <p className="stat-value">LKR {fmt(totalPortfolioValue)}</p>
                </div>
                <div className="stat-card">
                  <h3>Sectors</h3>
                  <p className="stat-value">{sectors.length}</p>
                </div>
                <div className="stat-card">
                  <h3>Companies</h3>
                  <p className="stat-value">{sectors.reduce((s, sec) => s + sec.companyCount, 0)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => handleSectorSort('sector')}>
                    Sector{sortIcon(sectorSortKey === 'sector', sectorSortDir)}
                  </th>
                  <th className="sort-header text-right" onClick={() => handleSectorSort('companyCount')}>
                    Companies{sortIcon(sectorSortKey === 'companyCount', sectorSortDir)}
                  </th>
                  <th className="sort-header text-right" onClick={() => handleSectorSort('totalInvested')}>
                    Invested{sortIcon(sectorSortKey === 'totalInvested', sectorSortDir)}
                  </th>
                  <th className="sort-header text-right" onClick={() => handleSectorSort('currentValue')}>
                    Value{sortIcon(sectorSortKey === 'currentValue', sectorSortDir)}
                  </th>
                  <th className="sort-header text-right" onClick={() => handleSectorSort('allocation')}>
                    Allocation{sortIcon(sectorSortKey === 'allocation', sectorSortDir)}
                  </th>
                  <th className="sort-header text-right" onClick={() => handleSectorSort('unrealizedGain')}>
                    Unrealized Gain{sortIcon(sectorSortKey === 'unrealizedGain', sectorSortDir)}
                  </th>
                  <th className="sort-header text-right" onClick={() => handleSectorSort('unrealizedDayGain')}>
                    Day Gain{sortIcon(sectorSortKey === 'unrealizedDayGain', sectorSortDir)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSectors.map(sec => {
                  const isExpanded = expandedSector === sec.sector;
                  const allocation = getAllocation(sec.currentValue);
                  const colorIdx = sectorColorMap[sec.sector] ?? 0;
                  return (
                    <>{/* Fragment for adjacent rows */}
                      <tr
                        key={sec.sector}
                        onClick={() => setExpandedSector(isExpanded ? null : sec.sector)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.7rem' }}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                            <div style={{
                              width: 12, height: 12, borderRadius: 3,
                              background: COLORS[colorIdx % COLORS.length], flexShrink: 0,
                            }} />
                            <strong>{sec.sector}</strong>
                          </div>
                        </td>
                        <td className="text-right mono">{sec.companyCount}</td>
                        <td className="text-right mono">{fmt(sec.totalInvested)}</td>
                        <td className="text-right mono">{fmt(sec.currentValue)}</td>
                        <td className="text-right mono">
                          <span className="gain-pill gain-pill-up" style={{
                            background: COLORS[colorIdx % COLORS.length] + '22',
                            color: COLORS[colorIdx % COLORS.length],
                          }}>
                            {allocation.toFixed(1)}%
                          </span>
                        </td>
                        <td className={`text-right mono ${gainClass(sec.unrealizedGain)}`}>
                          {gainSign(sec.unrealizedGain)}{fmt(sec.unrealizedGain)}
                        </td>
                        <td className={`text-right mono ${gainClass(sec.unrealizedDayGain)}`}>
                          {gainSign(sec.unrealizedDayGain)}{fmt(sec.unrealizedDayGain)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${sec.sector}-header`} style={{ background: 'var(--bg-thead)' }}>
                          <td
                            className="sort-header"
                            style={{ paddingLeft: '2.5rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onClick={e => handleCompanySort('companyCode', e)}
                          >
                            Company{sortIcon(companySortKey === 'companyCode', companySortDir)}
                          </td>
                          <td
                            className="sort-header text-right"
                            style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onClick={e => handleCompanySort('sharesHeld', e)}
                          >
                            Shares{sortIcon(companySortKey === 'sharesHeld', companySortDir)}
                          </td>
                          <td
                            className="sort-header text-right"
                            style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onClick={e => handleCompanySort('totalInvested', e)}
                          >
                            Invested{sortIcon(companySortKey === 'totalInvested', companySortDir)}
                          </td>
                          <td
                            className="sort-header text-right"
                            style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onClick={e => handleCompanySort('currentValue', e)}
                          >
                            Value{sortIcon(companySortKey === 'currentValue', companySortDir)}
                          </td>
                          <td
                            className="sort-header text-right"
                            style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onClick={e => handleCompanySort('allocation', e)}
                          >
                            Allocation{sortIcon(companySortKey === 'allocation', companySortDir)}
                          </td>
                          <td
                            className="sort-header text-right"
                            style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onClick={e => handleCompanySort('unrealizedGain', e)}
                          >
                            Gain{sortIcon(companySortKey === 'unrealizedGain', companySortDir)}
                          </td>
                          <td
                            className="sort-header text-right"
                            style={{ fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            onClick={e => handleCompanySort('unrealizedDayGain', e)}
                          >
                            Day Gain{sortIcon(companySortKey === 'unrealizedDayGain', companySortDir)}
                          </td>
                        </tr>
                      )}
                      {isExpanded && sortCompanies(sec.companies).map(c => (
                        <tr key={c.companyCode} style={{ background: 'var(--bg-row-zebra)' }}>
                          <td style={{ paddingLeft: '2.5rem', cursor: 'pointer' }} onClick={() => navigate(`/company/${c.companyCode}`)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <CompanyAvatar code={c.companyCode} size={22} />
                              <div className="company-cell">
                                <span className="company-code" style={{ fontSize: '0.8rem' }}>{c.companyCode}</span>
                                {c.companyName !== c.companyCode && (
                                  <span className="company-name">{c.companyName}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-right mono">{c.sharesHeld}</td>
                          <td className="text-right mono">{fmt(c.totalInvested)}</td>
                          <td className="text-right mono">{fmt(c.currentValue)}</td>
                          <td className="text-right mono">
                            {totalPortfolioValue > 0
                              ? ((c.currentValue / totalPortfolioValue) * 100).toFixed(1) + '%'
                              : '\u2014'}
                          </td>
                          <td className={`text-right mono ${gainClass(c.unrealizedGain)}`}>
                            {gainSign(c.unrealizedGain)}{fmt(c.unrealizedGain)}
                          </td>
                          <td className={`text-right mono ${gainClass(c.unrealizedDayGain)}`}>
                            {gainSign(c.unrealizedDayGain)}{fmt(c.unrealizedDayGain)}
                            <span className="day-pct"> ({gainSign(c.changePercent)}{c.changePercent.toFixed(2)}%)</span>
                          </td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="portfolio-total">
                  <td>Total</td>
                  <td className="text-right mono">{sectors.reduce((s, sec) => s + sec.companyCount, 0)}</td>
                  <td className="text-right mono">{fmt(sectors.reduce((s, sec) => s + sec.totalInvested, 0))}</td>
                  <td className="text-right mono">{fmt(totalPortfolioValue)}</td>
                  <td className="text-right mono">100%</td>
                  <td className={`text-right mono ${gainClass(sectors.reduce((s, sec) => s + sec.unrealizedGain, 0))}`}>
                    {gainSign(sectors.reduce((s, sec) => s + sec.unrealizedGain, 0))}{fmt(sectors.reduce((s, sec) => s + sec.unrealizedGain, 0))}
                  </td>
                  <td className={`text-right mono ${gainClass(sectors.reduce((s, sec) => s + sec.unrealizedDayGain, 0))}`}>
                    {gainSign(sectors.reduce((s, sec) => s + sec.unrealizedDayGain, 0))}{fmt(sectors.reduce((s, sec) => s + sec.unrealizedDayGain, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      </>)}
    </div>
  );
}
