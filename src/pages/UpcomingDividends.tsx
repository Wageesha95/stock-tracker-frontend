import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUpcomingDividends, getMarketData, getAllDividendPayouts, getUserSettings, getYearLow, UpcomingDividendItem, DividendPayoutData, YearLowEntry } from '../api';
import { MarketData } from '../types';
import { DEFAULT_COLUMNS } from '../components/SettingsPanel';
import CompanyAvatar from '../components/CompanyAvatar';

type Period = 1 | 2 | 3;
type SortKey = 'companyCode' | 'yearsAppeared' | 'avgAmountPerShare' | 'yield' | 'lastXdDate' | 'announcementDate' | 'lastTrade' | 'yield2025' | 'yieldAtYearLow';

export default function UpcomingDividends() {
  const [months, setMonths] = useState<Period>(1);
  const [data, setData] = useState<UpcomingDividendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('yearsAppeared');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    yearsMin: '', yearsMax: '',
    avgMin: '', avgMax: '',
    yieldMin: '', yieldMax: '',
    lastXdYear: '',
  });
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [ttmYield, setTtmYield] = useState<Record<string, number>>({});
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [yearLowMap, setYearLowMap] = useState<Record<string, YearLowEntry>>({});
  const navigate = useNavigate();

  const colVisible = (col: string) => {
    const cols = tableColumns['upcomingDividends'] || DEFAULT_COLUMNS['upcomingDividends'];
    return !cols || cols.includes(col);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getUpcomingDividends(months),
      getMarketData(),
      getAllDividendPayouts().catch(() => [] as DividendPayoutData[]),
      getUserSettings(),
      getYearLow().catch(() => ({} as Record<string, YearLowEntry>)),
    ])
      .then(([upcoming, md, payouts, settings, yearLow]) => {
        setTableColumns(settings.tableColumns || {});
        setYearLowMap(yearLow);
        setData(upcoming);

        const byCompany: Record<string, MarketData[]> = {};
        md.forEach(m => { (byCompany[m.companyCode] = byCompany[m.companyCode] || []).push(m); });
        const priceMap: Record<string, number> = {};
        for (const [code, entries] of Object.entries(byCompany)) {
          const sorted = entries.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
          priceMap[code] = sorted[0].lastTrade;
        }
        setPrices(priceMap);

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const cutoff = oneYearAgo.toISOString().split('T')[0];
        const byCode: Record<string, DividendPayoutData[]> = {};
        payouts.forEach(p => { (byCode[p.companyCode] = byCode[p.companyCode] || []).push(p); });
        const yields: Record<string, number> = {};
        for (const [code, divs] of Object.entries(byCode)) {
          const ttm = divs.filter(d => d.exDividendDate >= cutoff);
          const total = ttm.reduce((s, d) => s + (d.amountPerShare ? Number(d.amountPerShare) : 0), 0);
          const price = priceMap[code];
          if (total > 0 && price > 0) {
            yields[code] = (total / price) * 100;
          }
        }
        setTtmYield(yields);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [months]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'companyCode' ? 'asc' : 'desc'); }
  };
  const si = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    let list = s === '' ? data : data.filter(d => d.companyCode.toLowerCase().includes(s));

    // Apply column filters
    if (filters.yearsMin) list = list.filter(d => d.yearsAppeared >= Number(filters.yearsMin));
    if (filters.yearsMax) list = list.filter(d => d.yearsAppeared <= Number(filters.yearsMax));
    if (filters.avgMin) list = list.filter(d => d.avgAmountPerShare >= Number(filters.avgMin));
    if (filters.avgMax) list = list.filter(d => d.avgAmountPerShare <= Number(filters.avgMax));
    if (filters.yieldMin) list = list.filter(d => (ttmYield[d.companyCode] || 0) >= Number(filters.yieldMin));
    if (filters.yieldMax) list = list.filter(d => (ttmYield[d.companyCode] || 0) <= Number(filters.yieldMax));
    if (filters.lastXdYear) list = list.filter(d => d.history[0]?.exDividendDate?.startsWith(filters.lastXdYear));

    const getY2025 = (item: UpcomingDividendItem) => {
      const h = item.history.find(h => h.year === 2025);
      return h?.amountPerShare && h?.priceOnXdDate && h.priceOnXdDate > 0 ? (h.amountPerShare / h.priceOnXdDate * 100) : 0;
    };
    const getYLow = (item: UpcomingDividendItem) => {
      const ttm = ttmYield[item.companyCode];
      const yl = yearLowMap[item.companyCode];
      const price = prices[item.companyCode];
      return ttm != null && yl?.price > 0 && price > 0 ? (ttm / 100 * price / yl.price * 100) : 0;
    };

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'companyCode') cmp = a.companyCode.localeCompare(b.companyCode);
      else if (sortKey === 'yearsAppeared') cmp = a.yearsAppeared - b.yearsAppeared;
      else if (sortKey === 'avgAmountPerShare') cmp = a.avgAmountPerShare - b.avgAmountPerShare;
      else if (sortKey === 'yield') cmp = (ttmYield[a.companyCode] || 0) - (ttmYield[b.companyCode] || 0);
      else if (sortKey === 'lastXdDate') cmp = (a.history[0]?.exDividendDate || '').localeCompare(b.history[0]?.exDividendDate || '');
      else if (sortKey === 'announcementDate') cmp = (a.history[0]?.announcementDate || '').localeCompare(b.history[0]?.announcementDate || '');
      else if (sortKey === 'lastTrade') cmp = (prices[a.companyCode] || 0) - (prices[b.companyCode] || 0);
      else if (sortKey === 'yield2025') cmp = getY2025(a) - getY2025(b);
      else if (sortKey === 'yieldAtYearLow') cmp = getYLow(a) - getYLow(b);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, search, sortKey, sortDir, ttmYield, prices, yearLowMap, filters]);

  const toggleExpand = (code: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const fInput = { padding: '0.25rem 0.4rem', borderRadius: '4px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.75rem', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0 }}>Upcoming Dividends</h1>
          <div className="segmented-control">
            {([1, 2, 3] as Period[]).map(p => (
              <button key={p} className={months === p ? 'active' : ''} onClick={() => setMonths(p)}>
                {p}M
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setShowFilters(f => !f)}
            style={{
              background: hasActiveFilters ? 'var(--gain-pill-up-bg)' : 'var(--bg-input)',
              color: hasActiveFilters ? 'var(--gain-pill-up-color)' : 'var(--text-muted)',
              border: '1px solid var(--border-input)', borderRadius: '6px',
              padding: '0.35rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            {showFilters ? 'Hide Filters' : 'Filters'}{hasActiveFilters ? ' *' : ''}
          </button>
          {hasActiveFilters && (
            <button
              onClick={() => setFilters({ yearsMin: '', yearsMax: '', avgMin: '', avgMax: '', yieldMin: '', yieldMax: '', lastXdYear: '' })}
              className="btn-reset"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            >Clear</button>
          )}
          {data.length >= 5 && (
            <input
              className="search-bar"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search company..."
            />
          )}
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
        Stocks that had XD dates in the next {months} month{months > 1 ? 's' : ''} window over the last 5 years.
      </p>

      {loading ? (
        <p>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No upcoming dividend predictions for this period.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th className="sort-header" onClick={() => handleSort('companyCode')}>Company{si('companyCode')}</th>
                {colVisible('yearsAppeared') && <th className="sort-header text-right" onClick={() => handleSort('yearsAppeared')}>Years (5yr){si('yearsAppeared')}</th>}
                {colVisible('avgAmountPerShare') && <th className="sort-header text-right" onClick={() => handleSort('avgAmountPerShare')}>Avg Amount{si('avgAmountPerShare')}</th>}
                {colVisible('ttmYield') && <th className="sort-header text-right" onClick={() => handleSort('yield')}>Yield (TTM){si('yield')}</th>}
                {colVisible('lastXdDate') && <th className="sort-header text-right" onClick={() => handleSort('lastXdDate')}>Last XD Date{si('lastXdDate')}</th>}
                {colVisible('dividendType') && <th>Type</th>}
                {colVisible('announcementDate') && <th className="sort-header" onClick={() => handleSort('announcementDate')}>Announced{si('announcementDate')}</th>}
                {colVisible('lastTrade') && <th className="sort-header text-right" onClick={() => handleSort('lastTrade')}>Last Trade{si('lastTrade')}</th>}
                {colVisible('yield2025') && <th className="sort-header text-right" onClick={() => handleSort('yield2025')}>2025 Yield{si('yield2025')}</th>}
                {colVisible('yieldAtYearLow') && <th className="sort-header text-right" onClick={() => handleSort('yieldAtYearLow')}>TTM @ YR Low{si('yieldAtYearLow')}</th>}
              </tr>
              {showFilters && (
                <tr style={{ background: 'var(--bg-thead)' }}>
                  <th></th>
                  <th></th>
                  <th>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <input type="number" placeholder="Min" value={filters.yearsMin} onChange={e => setFilters(f => ({ ...f, yearsMin: e.target.value }))} style={fInput} min="0" max="5" />
                      <input type="number" placeholder="Max" value={filters.yearsMax} onChange={e => setFilters(f => ({ ...f, yearsMax: e.target.value }))} style={fInput} min="0" max="5" />
                    </div>
                  </th>
                  <th>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <input type="number" placeholder="Min" value={filters.avgMin} onChange={e => setFilters(f => ({ ...f, avgMin: e.target.value }))} style={fInput} step="0.1" />
                      <input type="number" placeholder="Max" value={filters.avgMax} onChange={e => setFilters(f => ({ ...f, avgMax: e.target.value }))} style={fInput} step="0.1" />
                    </div>
                  </th>
                  <th>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <input type="number" placeholder="Min%" value={filters.yieldMin} onChange={e => setFilters(f => ({ ...f, yieldMin: e.target.value }))} style={fInput} step="0.5" />
                      <input type="number" placeholder="Max%" value={filters.yieldMax} onChange={e => setFilters(f => ({ ...f, yieldMax: e.target.value }))} style={fInput} step="0.5" />
                    </div>
                  </th>
                  {colVisible('lastXdDate') && <th>
                    <select value={filters.lastXdYear} onChange={e => setFilters(f => ({ ...f, lastXdYear: e.target.value }))} style={{ ...fInput, width: 'auto' }}>
                      <option value="">All</option>
                      {[...new Set(data.map(d => d.history[0]?.exDividendDate?.substring(0, 4)).filter(Boolean))].sort().reverse().map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </th>}
                  {colVisible('dividendType') && <th></th>}
                  {colVisible('announcementDate') && <th></th>}
                  {colVisible('lastTrade') && <th></th>}
                  {colVisible('yield2025') && <th></th>}
                  {colVisible('yieldAtYearLow') && <th></th>}
                </tr>
              )}
            </thead>
            <tbody>
              {filtered.map(item => {
                const latest = item.history[0];
                const isExpanded = expanded.has(item.companyCode);
                return (
                  <React.Fragment key={item.companyCode}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(item.companyCode)}>
                      <td style={{ fontSize: '0.7rem', textAlign: 'center' }}>{isExpanded ? '\u25BC' : '\u25B6'}</td>
                      <td onClick={e => { e.stopPropagation(); navigate(`/company/${item.companyCode}`); }} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CompanyAvatar code={item.companyCode} size={28} />
                          <span className="company-code">{item.companyCode}</span>
                        </div>
                      </td>
                      {colVisible('yearsAppeared') && <td className="text-right mono">
                        <span className={`gain-pill ${item.yearsAppeared >= 4 ? 'gain-pill-up' : item.yearsAppeared >= 2 ? 'gain-pill-neutral' : ''}`}>
                          {item.yearsAppeared}/5
                        </span>
                      </td>}
                      {colVisible('avgAmountPerShare') && <td className="text-right mono">{item.avgAmountPerShare > 0 ? item.avgAmountPerShare.toFixed(2) : '\u2014'}</td>}
                      {colVisible('ttmYield') && <td className="text-right mono">{ttmYield[item.companyCode] != null ? ttmYield[item.companyCode].toFixed(2) + '%' : '\u2014'}</td>}
                      {colVisible('lastXdDate') && <td className="text-right mono">{latest?.exDividendDate || '\u2014'}</td>}
                      {colVisible('dividendType') && <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{latest?.dividendType || '\u2014'}</td>}
                      {colVisible('announcementDate') && <td style={{ fontSize: '0.85rem' }}>{latest?.announcementDate || '\u2014'}</td>}
                      {colVisible('lastTrade') && <td className="text-right mono">{prices[item.companyCode] != null ? prices[item.companyCode].toFixed(2) : '\u2014'}</td>}
                      {colVisible('yield2025') && (() => {
                        const h2025 = item.history.find(h => h.year === 2025);
                        const yld = h2025?.amountPerShare && h2025?.priceOnXdDate && h2025.priceOnXdDate > 0
                          ? (h2025.amountPerShare / h2025.priceOnXdDate * 100) : null;
                        return <td className="text-right mono">{yld != null ? yld.toFixed(2) + '%' : '\u2014'}</td>;
                      })()}
                      {colVisible('yieldAtYearLow') && (() => {
                        const ttm = ttmYield[item.companyCode];
                        const yl = yearLowMap[item.companyCode];
                        const price = prices[item.companyCode];
                        const yld = ttm != null && yl?.price > 0 && price > 0
                          ? (ttm / 100 * price / yl.price * 100) : null;
                        return <td className="text-right mono" title={yl ? `Low: ${yl.price.toFixed(2)} on ${yl.date}` : ''}>
                          {yld != null ? yld.toFixed(2) + '%' : '\u2014'}
                        </td>;
                      })()}
                    </tr>
                    {isExpanded && item.history.map(h => {
                      const hYld = h.amountPerShare && h.priceOnXdDate && h.priceOnXdDate > 0
                        ? (h.amountPerShare / h.priceOnXdDate * 100) : null;
                      return (
                        <tr key={`${item.companyCode}-${h.year}`} style={{ background: 'var(--bg-card-hover, rgba(0,0,0,0.02))' }}>
                          <td></td>
                          <td style={{ paddingLeft: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{h.year}</td>
                          {colVisible('yearsAppeared') && <td></td>}
                          {colVisible('avgAmountPerShare') && <td className="text-right mono" style={{ fontSize: '0.85rem' }}>{h.amountPerShare != null ? Number(h.amountPerShare).toFixed(2) : '\u2014'}</td>}
                          {colVisible('ttmYield') && <td className="text-right mono" style={{ fontSize: '0.85rem' }}>{hYld != null ? hYld.toFixed(2) + '%' : '\u2014'}</td>}
                          {colVisible('lastXdDate') && <td className="text-right mono" style={{ fontSize: '0.85rem' }}>{h.exDividendDate}</td>}
                          {colVisible('dividendType') && <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{h.dividendType || '\u2014'}</td>}
                          {colVisible('announcementDate') && <td style={{ fontSize: '0.85rem' }}>{h.announcementDate || '\u2014'}</td>}
                          {colVisible('lastTrade') && <td className="text-right mono" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{h.priceOnXdDate != null ? h.priceOnXdDate.toFixed(2) : '\u2014'}</td>}
                          {colVisible('yield2025') && <td></td>}
                          {colVisible('yieldAtYearLow') && <td></td>}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="portfolio-total">
                <td></td>
                <td>{filtered.length} companies</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
