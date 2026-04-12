import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompanies, getIndustryGroups, getMarketData, getAllDividendPayouts, getYearLow, getYtdData, getUserSettings, updateCompany, invalidate, DividendPayoutData, YearLowEntry, YtdEntry } from '../api';
import { Company, IndustryGroup, MarketData } from '../types';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_COLUMNS } from '../components/SettingsPanel';
import CompanyAvatar from '../components/CompanyAvatar';

export default function Companies() {
  const { isAdmin, isReadMode, dividendPayoutsEnabled } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [industryGroups, setIndustryGroups] = useState<IndustryGroup[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [latestPrice, setLatestPrice] = useState<Record<string, number>>({});
  const [, setPriceChange] = useState<Record<string, number>>({});
  const [changePercent, setChangePercent] = useState<Record<string, number>>({});
  const [ytdChange, setYtdChange] = useState<Record<string, YtdEntry>>({});
  const [ttmYield, setTtmYield] = useState<Record<string, number>>({});
  const [yield2025, setYield2025] = useState<Record<string, number>>({});
  const [yearLowMap, setYearLowMap] = useState<Record<string, YearLowEntry>>({});
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const colVisible = (col: string) => {
    const cols = tableColumns['companies'] || DEFAULT_COLUMNS['companies'];
    return !cols || cols.includes(col);
  };

  useEffect(() => {
    Promise.all([
      getCompanies(),
      getIndustryGroups(),
      getMarketData(),
      dividendPayoutsEnabled ? getAllDividendPayouts().catch(() => [] as DividendPayoutData[]) : Promise.resolve([] as DividendPayoutData[]),
      getUserSettings(),
      getYearLow().catch(() => ({} as Record<string, YearLowEntry>)),
      getYtdData().catch(() => ({} as Record<string, number>)),
    ])
      .then(([comps, gs, md, payouts, settings, yearLow, ytdData]) => {
        setTableColumns(settings.tableColumns || {});
        setYearLowMap(yearLow);
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
        const changes: Record<string, number> = {};
        const changePcts: Record<string, number> = {};

        for (const [code, entries] of Object.entries(byCompany)) {
          const sorted = entries.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
          const latest = sorted[0];
          prices[code] = latest.lastTrade;
          changes[code] = latest.change;
          changePcts[code] = latest.changePercent;
        }
        setLatestPrice(prices);
        setPriceChange(changes);
        setChangePercent(changePcts);
        setYtdChange(ytdData);

        // Compute TTM dividend yield per company
        if (payouts.length > 0) {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const cutoff = oneYearAgo.toISOString().split('T')[0];
          const yields: Record<string, number> = {};
          const byCode: Record<string, DividendPayoutData[]> = {};
          payouts.forEach(p => {
            (byCode[p.companyCode] = byCode[p.companyCode] || []).push(p);
          });
          for (const [code, divs] of Object.entries(byCode)) {
            const ttm = divs.filter(d => d.exDividendDate >= cutoff);
            const total = ttm.reduce((s, d) => s + (d.amountPerShare ? Number(d.amountPerShare) : 0), 0);
            const price = prices[code];
            if (total > 0 && price > 0) {
              yields[code] = (total / price) * 100;
            }
          }
          setTtmYield(yields);

          // 2025 XD yield: sum of 2025 dividends / price on XD date
          const y2025: Record<string, number> = {};
          for (const [code, divs] of Object.entries(byCode)) {
            const divs2025 = divs.filter(d => d.exDividendDate.startsWith('2025'));
            if (divs2025.length > 0) {
              const total = divs2025.reduce((s, d) => s + (d.amountPerShare ? Number(d.amountPerShare) : 0), 0);
              const xdPrice = divs2025[0].priceOnXdDate;
              if (total > 0 && xdPrice && xdPrice > 0) {
                y2025[code] = (total / xdPrice) * 100;
              }
            }
          }
          setYield2025(y2025);
        }
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
  const [cSortKey, setCSortKey] = useState<'code' | 'name' | 'lastTrade' | 'ytd' | 'yield' | 'yield2025' | 'yieldAtYearLow' | 'industry'>('code');
  const [cSortDir, setCSortDir] = useState<'asc' | 'desc'>('asc');
  const handleCSort = useCallback((key: typeof cSortKey) => {
    setCSortKey(prev => {
      if (prev === key) { setCSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setCSortDir(key === 'lastTrade' || key === 'ytd' || key === 'yield' || key === 'yield2025' || key === 'yieldAtYearLow' ? 'desc' : 'asc');
      return key;
    });
  }, []);
  const csi = (key: typeof cSortKey) => cSortKey === key ? (cSortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';

  const searchLower = search.toLowerCase();
  const filtered = useMemo(() => {
    const list = search === '' ? companies : companies.filter(c =>
      c.code.toLowerCase().includes(searchLower) ||
      c.name.toLowerCase().includes(searchLower) ||
      (c.industryGroupId && groups[c.industryGroupId]?.toLowerCase().includes(searchLower))
    );
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (cSortKey === 'code') cmp = a.code.localeCompare(b.code);
      else if (cSortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (cSortKey === 'lastTrade') cmp = (latestPrice[a.code] || 0) - (latestPrice[b.code] || 0);
      else if (cSortKey === 'ytd') cmp = (ytdChange[a.code]?.ytd || 0) - (ytdChange[b.code]?.ytd || 0);
      else if (cSortKey === 'yield') cmp = (ttmYield[a.code] || 0) - (ttmYield[b.code] || 0);
      else if (cSortKey === 'yield2025') cmp = (yield2025[a.code] || 0) - (yield2025[b.code] || 0);
      else if (cSortKey === 'yieldAtYearLow') {
        const aLow = yearLowMap[a.code]?.price || 0;
        const bLow = yearLowMap[b.code]?.price || 0;
        const aYld = ttmYield[a.code] && aLow && latestPrice[a.code] ? (ttmYield[a.code] / 100 * latestPrice[a.code] / aLow * 100) : 0;
        const bYld = ttmYield[b.code] && bLow && latestPrice[b.code] ? (ttmYield[b.code] / 100 * latestPrice[b.code] / bLow * 100) : 0;
        cmp = aYld - bYld;
      }
      else if (cSortKey === 'industry') cmp = (groups[a.industryGroupId || ''] || '').localeCompare(groups[b.industryGroupId || ''] || '');
      return cSortDir === 'asc' ? cmp : -cmp;
    });
  }, [companies, searchLower, groups, latestPrice, ytdChange, ttmYield, yield2025, yearLowMap, cSortKey, cSortDir]);

  const [viewMode, setViewMode] = useState<'list' | 'industry'>('list');

  // Group by industry
  const groupedByIndustry = useMemo(() => {
    const map: Record<string, typeof filtered> = {};
    filtered.forEach(c => {
      const industry = c.industryGroupId ? groups[c.industryGroupId] || 'Uncategorized' : 'Uncategorized';
      (map[industry] = map[industry] || []).push(c);
    });
    return Object.entries(map).sort((a, b) => a[0] === 'Uncategorized' ? 1 : b[0] === 'Uncategorized' ? -1 : a[0].localeCompare(b[0]));
  }, [filtered, groups]);

  const [expandedIndustry, setExpandedIndustry] = useState<Set<string>>(new Set());

  if (loading) return <p>Loading...</p>;

  const companyRow = (c: Company) => (
    <tr key={c.id}>
      <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${c.code}`)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CompanyAvatar code={c.code} size={28} />
          <span className="company-code">{c.code}</span>
        </div>
      </td>
      {colVisible('name') && <td>{c.name}</td>}
      {colVisible('lastTrade') && <td className="text-right mono">
        {latestPrice[c.code] != null ? latestPrice[c.code].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}
      </td>}
      {colVisible('change') && <td className="text-right mono">
        {changePercent[c.code] != null ? (
          <span className={`gain-pill ${changePercent[c.code] >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
            {changePercent[c.code] >= 0 ? '+' : ''}{changePercent[c.code].toFixed(2)}%
          </span>
        ) : '\u2014'}
      </td>}
      {colVisible('ytd') && (() => {
        const yd = ytdChange[c.code];
        const tip = yd?.firstPrice != null ? `${yd.firstDate}: ${yd.firstPrice.toFixed(2)}` : '';
        return <td className="text-right mono" title={tip}>
          {yd?.ytd != null ? (
            <span className={`gain-pill ${yd.ytd >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
              {yd.ytd >= 0 ? '+' : ''}{yd.ytd.toFixed(1)}%
            </span>
          ) : '\u2014'}
        </td>;
      })()}
      {colVisible('ttmYield') && <td className="text-right mono">
        {ttmYield[c.code] != null ? ttmYield[c.code].toFixed(2) + '%' : '\u2014'}
      </td>}
      {colVisible('yield2025') && <td className="text-right mono">
        {yield2025[c.code] != null ? yield2025[c.code].toFixed(2) + '%' : '\u2014'}
      </td>}
      {colVisible('yieldAtYearLow') && (() => {
        const ttm = ttmYield[c.code];
        const yl = yearLowMap[c.code];
        const price = latestPrice[c.code];
        const yld = ttm != null && yl?.price > 0 && price > 0 ? (ttm / 100 * price / yl.price * 100) : null;
        return <td className="text-right mono" title={yl ? `Low: ${yl.price.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} on ${yl.date}` : ''}>
          {yld != null ? yld.toFixed(2) + '%' : '\u2014'}
        </td>;
      })()}
      {colVisible('industry') && viewMode === 'list' && (
        <td>
          {isAdmin && !isReadMode ? (
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
              {c.industryGroupId ? groups[c.industryGroupId] || '\u2014' : '\u2014'}
            </span>
          )}
        </td>
      )}
    </tr>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0 }}>Companies ({filtered.length})</h1>
          <div className="segmented-control">
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>List</button>
            <button className={viewMode === 'industry' ? 'active' : ''} onClick={() => setViewMode('industry')}>By Industry</button>
          </div>
        </div>
        <input
          className="search-bar"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{companies.length === 0 ? 'No companies registered yet.' : 'No companies match your search.'}</p>
      ) : viewMode === 'list' ? (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleCSort('code')}>Code{csi('code')}</th>
                {colVisible('name') && <th className="sort-header" onClick={() => handleCSort('name')}>Name{csi('name')}</th>}
                {colVisible('lastTrade') && <th className="sort-header text-right" onClick={() => handleCSort('lastTrade')}>Last Trade{csi('lastTrade')}</th>}
                {colVisible('change') && <th className="text-right">Change</th>}
                {colVisible('ytd') && <th className="sort-header text-right" onClick={() => handleCSort('ytd')}>YTD{csi('ytd')}</th>}
                {colVisible('ttmYield') && <th className="sort-header text-right" onClick={() => handleCSort('yield')}>Yield (TTM){csi('yield')}</th>}
                {colVisible('yield2025') && <th className="sort-header text-right" onClick={() => handleCSort('yield2025')}>2025 Yield{csi('yield2025')}</th>}
                {colVisible('yieldAtYearLow') && <th className="sort-header text-right" onClick={() => handleCSort('yieldAtYearLow')}>TTM @ YR Low{csi('yieldAtYearLow')}</th>}
                {colVisible('industry') && <th className="sort-header" onClick={() => handleCSort('industry')}>Industry{csi('industry')}</th>}
              </tr>
            </thead>
            <tbody>{filtered.map(companyRow)}</tbody>
          </table>
        </div>
      ) : (
        groupedByIndustry.map(([industry, comps]) => {
          const isExpanded = expandedIndustry.has(industry);
          return (
            <div key={industry} className="group-card">
              <div className="group-header" onClick={() => setExpandedIndustry(prev => {
                const next = new Set(prev);
                next.has(industry) ? next.delete(industry) : next.add(industry);
                return next;
              })} style={{ cursor: 'pointer' }}>
                <div className="group-header-left">
                  <span style={{ fontSize: '0.7rem', width: 16 }}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  <div>
                    <div className="group-code">{industry}</div>
                    <div className="group-name">{comps.length} companies</div>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div className="portfolio-table-wrap">
                  <table className="portfolio-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        {colVisible('name') && <th>Name</th>}
                        {colVisible('lastTrade') && <th className="text-right">Last Trade</th>}
                        {colVisible('change') && <th className="text-right">Change</th>}
                        {colVisible('ytd') && <th className="text-right">YTD</th>}
                        {colVisible('ttmYield') && <th className="text-right">Yield (TTM)</th>}
                        {colVisible('yield2025') && <th className="text-right">2025 Yield</th>}
                        {colVisible('yieldAtYearLow') && <th className="text-right">TTM @ YR Low</th>}
                      </tr>
                    </thead>
                    <tbody>{comps.map(companyRow)}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
