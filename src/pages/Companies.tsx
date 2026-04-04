import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompanies, getIndustryGroups, getMarketData, updateCompany, invalidate } from '../api';
import { Company, IndustryGroup, MarketData } from '../types';
import { useAuth } from '../context/AuthContext';
import CompanyAvatar from '../components/CompanyAvatar';

export default function Companies() {
  const { isAdmin } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [industryGroups, setIndustryGroups] = useState<IndustryGroup[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [latestPrice, setLatestPrice] = useState<Record<string, number>>({});
  const [ytdChange, setYtdChange] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getCompanies(), getIndustryGroups(), getMarketData()])
      .then(([comps, gs, md]) => {
        setCompanies(comps);
        setIndustryGroups(gs);
        const map: Record<string, string> = {};
        gs.forEach(g => { map[g.id] = g.name; });
        setGroups(map);

        // Group market data by company
        const byCompany: Record<string, MarketData[]> = {};
        md.forEach(m => {
          (byCompany[m.companyCode] = byCompany[m.companyCode] || []).push(m);
        });

        const prices: Record<string, number> = {};
        const ytd: Record<string, number> = {};
        const currentYear = new Date().getFullYear().toString();

        for (const [code, entries] of Object.entries(byCompany)) {
          const sorted = entries.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
          const latest = sorted[0];
          prices[code] = latest.lastTrade;

          // YTD: find earliest entry this year
          const thisYear = sorted.filter(e => e.tradeDate.startsWith(currentYear));
          if (thisYear.length > 0) {
            const earliest = thisYear[thisYear.length - 1];
            if (earliest.lastTrade > 0) {
              ytd[code] = ((latest.lastTrade - earliest.lastTrade) / earliest.lastTrade) * 100;
            }
          }
        }
        setLatestPrice(prices);
        setYtdChange(ytd);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSectorChange = async (company: Company, industryGroupId: string) => {
    try {
      const updated = await updateCompany(company.id, {
        code: company.code,
        name: company.name,
        industryGroupId: industryGroupId || undefined,
      });
      setCompanies(prev => prev.map(c => c.id === company.id ? updated : c));
      invalidate('dashboard-all', 'companies');
    } catch (err) {
      console.error('Failed to update sector', err);
    }
  };

  const [search, setSearch] = useState('');

  const filtered = companies.filter(c =>
    search === '' ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industryGroupId && groups[c.industryGroupId]?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Companies ({filtered.length})</h1>
        <input
          className="search-bar"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by code, name or industry..."
          style={{ flex: 1, minWidth: '200px' }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{companies.length === 0 ? 'No companies registered yet.' : 'No companies match your search.'}</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th className="text-right">Last Trade</th>
                <th className="text-right">YTD</th>
                <th>Industry Group</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/company/${c.code}`)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={c.code} size={28} />
                      <span className="company-code">{c.code}</span>
                    </div>
                  </td>
                  <td>{c.name}</td>
                  <td className="text-right mono">
                    {latestPrice[c.code] != null ? latestPrice[c.code].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}
                  </td>
                  <td className="text-right mono">
                    {ytdChange[c.code] != null ? (
                      <span className={`gain-pill ${ytdChange[c.code] >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                        {ytdChange[c.code] >= 0 ? '+' : ''}{ytdChange[c.code].toFixed(1)}%
                      </span>
                    ) : '\u2014'}
                  </td>
                  <td>
                    {isAdmin ? (
                      <select
                        value={c.industryGroupId || ''}
                        onChange={e => handleSectorChange(c, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                      >
                        <option value="">— None —</option>
                        {industryGroups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {c.industryGroupId ? groups[c.industryGroupId] || '—' : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
