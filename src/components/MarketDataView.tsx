import { useEffect, useState } from 'react';
import { getMarketDataDateSummary, getMarketDataByDate, invalidate, MarketDataDateSummary } from '../api';
import { MarketData } from '../types';
import CompanyAvatar from './CompanyAvatar';

type SortDir = 'asc' | 'desc';

export default function MarketDataView() {
  const [dateSummary, setDateSummary] = useState<MarketDataDateSummary[]>([]);
  const [dateData, setDateData] = useState<Record<string, MarketData[]>>({});
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [loadingDates, setLoadingDates] = useState<Set<string>>(new Set());
  const [mdSortKey, setMdSortKey] = useState<string>('');
  const [mdSortDir, setMdSortDir] = useState<SortDir>('desc');

  const refreshDateSummary = async () => {
    invalidate('market');
    setDateData({});
    setExpandedDates(new Set());
    try {
      const summary = await getMarketDataDateSummary();
      setDateSummary(summary);
    } catch {
      setDateSummary([]);
    }
  };

  useEffect(() => {
    getMarketDataDateSummary().then(setDateSummary).catch(() => {});
  }, []);

  const handleMdSort = (key: string) => {
    if (mdSortKey === key) {
      setMdSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setMdSortKey(key);
      const sample = Object.values(dateData)[0]?.[0];
      setMdSortDir(sample && typeof sample[key as keyof MarketData] === 'string' ? 'asc' : 'desc');
    }
  };

  const mdSortIcon = (key: string) => {
    if (mdSortKey !== key) return ' \u2195';
    return mdSortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const sortMdItems = (items: MarketData[]): MarketData[] => {
    if (!mdSortKey) return items;
    return [...items].sort((a, b) => {
      const av = a[mdSortKey as keyof MarketData];
      const bv = b[mdSortKey as keyof MarketData];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return mdSortDir === 'asc' ? cmp : -cmp;
    });
  };

  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  if (dateSummary.length === 0) return null;

  const totalRecords = dateSummary.reduce((a, d) => a + d.count, 0);

  const toggleDate = async (d: string) => {
    const alreadyExpanded = expandedDates.has(d);
    setExpandedDates(prev => {
      const next = new Set(prev);
      alreadyExpanded ? next.delete(d) : next.add(d);
      return next;
    });
    if (!alreadyExpanded && !dateData[d] && !loadingDates.has(d)) {
      setLoadingDates(prev => new Set(prev).add(d));
      try {
        const items = await getMarketDataByDate(d);
        setDateData(prev => ({ ...prev, [d]: items }));
      } catch {
        // leave cache empty on failure
      } finally {
        setLoadingDates(prev => {
          const next = new Set(prev);
          next.delete(d);
          return next;
        });
      }
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Market Data ({totalRecords} records, {dateSummary.length} dates)</h2>
        <button className="btn-reset" onClick={refreshDateSummary} title="Reload market data">Refresh</button>
      </div>
      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th className="sort-header" onClick={() => handleMdSort('companyCode')}>Symbol{mdSortIcon('companyCode')}</th>
              <th className="sort-header" onClick={() => handleMdSort('companyName')}>Company{mdSortIcon('companyName')}</th>
              <th className="sort-header text-right" onClick={() => handleMdSort('lastTrade')}>Last Trade{mdSortIcon('lastTrade')}</th>
              <th className="sort-header text-right" onClick={() => handleMdSort('high')}>High{mdSortIcon('high')}</th>
              <th className="sort-header text-right" onClick={() => handleMdSort('low')}>Low{mdSortIcon('low')}</th>
              <th className="sort-header text-right" onClick={() => handleMdSort('change')}>Change{mdSortIcon('change')}</th>
              <th className="sort-header text-right" onClick={() => handleMdSort('changePercent')}>Change%{mdSortIcon('changePercent')}</th>
            </tr>
          </thead>
          <tbody>
            {dateSummary.map(({ date, count }) => {
              const isExpanded = expandedDates.has(date);
              const items = dateData[date];
              const isLoading = loadingDates.has(date);
              const sortedItems = sortMdItems(items || []);
              return (
                <>
                  <tr
                    key={date}
                    onClick={() => toggleDate(date)}
                    style={{ cursor: 'pointer', background: 'var(--bg-thead)' }}
                  >
                    <td colSpan={7} style={{ fontWeight: 700 }}>
                      <span style={{ fontSize: '0.7rem', marginRight: '0.5rem' }}>{isExpanded ? '▼' : '▶'}</span>
                      {date} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({count} companies)</span>
                    </td>
                  </tr>
                  {isExpanded && isLoading && (
                    <tr key={`${date}-loading`}>
                      <td colSpan={7} style={{ color: 'var(--text-muted)', paddingLeft: '1.5rem' }}>Loading...</td>
                    </tr>
                  )}
                  {isExpanded && !isLoading && sortedItems.map(md => (
                    <tr key={md.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1.5rem' }}>
                          <CompanyAvatar code={md.companyCode} size={24} />
                          <span className="company-code">{md.companyCode}</span>
                        </div>
                      </td>
                      <td>{md.companyName}</td>
                      <td className="text-right mono">{md.lastTrade.toFixed(2)}</td>
                      <td className="text-right mono">{md.high != null ? md.high.toFixed(2) : '\u2014'}</td>
                      <td className="text-right mono">{md.low != null ? md.low.toFixed(2) : '\u2014'}</td>
                      <td className={`text-right mono ${gainClass(md.change)}`}>
                        {gainSign(md.change)}{md.change.toFixed(2)}
                      </td>
                      <td className="text-right mono">
                        <span className={`gain-pill ${md.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                          {gainSign(md.changePercent)}{md.changePercent.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
