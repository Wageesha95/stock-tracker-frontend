import React, { useState, useEffect, useRef } from 'react';
import { getCompanies, scrapeDividendPreview, scrapeDividendConfirm, getDividendPayouts, getAllDividendPayouts, DividendPayoutData, scrapeDividendCalendarPreview, scrapeDividendCalendarConfirm, scrapeDividendFinancialsPreview, scrapeDividendFinancialsConfirm } from '../api';
import { Company } from '../types';
import CompanySearchSelect from '../components/CompanySearchSelect';
import CompanyAvatar from '../components/CompanyAvatar';

interface CompanyScrapeResult {
  code: string;
  name: string;
  scrapeStatus: 'pending' | 'scraping' | 'done' | 'error';
  saveStatus: 'unsaved' | 'saving' | 'saved' | 'error';
  payouts: DividendPayoutData[];
  existingDates: Set<string>;
  savedCount?: number;
  error?: string;
}

type Mode = 'select' | 'single-preview' | 'all-scraping' | 'all-preview' | 'done';
type SortKey = 'code' | 'name' | 'records' | 'scrapeStatus' | 'saveStatus';

export default function DividendScraper() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState('');
  const [mode, setMode] = useState<Mode>('select');
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Single company
  const [singlePreview, setSinglePreview] = useState<DividendPayoutData[]>([]);
  const [singleExisting, setSingleExisting] = useState<Set<string>>(new Set());

  // All companies
  const [results, setResults] = useState<CompanyScrapeResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [scrapeOrder, setScrapeOrder] = useState<'code-asc' | 'code-desc' | 'name-asc' | 'name-desc'>('code-asc');
  const [defaultSort, setDefaultSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'code', dir: 'asc' });
  const abortRef = useRef(false);

  useEffect(() => {
    getCompanies().then(setCompanies).catch(() => {});
  }, []);

  // --- Single company scrape ---
  const handleScrape = async () => {
    if (!companyCode) return;
    setScraping(true);
    setError('');
    setSinglePreview([]);
    setSingleExisting(new Set());
    try {
      const [data, existing] = await Promise.all([
        scrapeDividendPreview(companyCode),
        getDividendPayouts(companyCode).catch(() => [] as DividendPayoutData[]),
      ]);
      setSinglePreview(data);
      setSingleExisting(new Set(existing.map(e => e.exDividendDate)));
      setMode('single-preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Scraping failed.');
    } finally {
      setScraping(false);
    }
  };

  const handleSingleConfirm = async () => {
    if (!companyCode || singlePreview.length === 0) return;
    setSaving(true);
    setError('');
    try {
      await scrapeDividendConfirm(companyCode, singlePreview);
      setMode('done');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // --- All companies scrape ---
  const handleScrapeAll = async () => {
    abortRef.current = false;
    setError('');
    setMode('all-scraping');

    const sorted = [...companies].sort((a, b) => {
      switch (scrapeOrder) {
        case 'code-asc': return a.code.localeCompare(b.code);
        case 'code-desc': return b.code.localeCompare(a.code);
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        default: return 0;
      }
    });
    const initial: CompanyScrapeResult[] = sorted.map(c => ({
        code: c.code, name: c.name, scrapeStatus: 'pending', saveStatus: 'unsaved', payouts: [], existingDates: new Set<string>(),
      }));
    setResults(initial);
    setProgress({ current: 0, total: companies.length });
    const [key, dir] = scrapeOrder.split('-') as [SortKey, 'asc' | 'desc'];
    setDefaultSort({ key, dir });

    for (let i = 0; i < sorted.length; i++) {
      if (abortRef.current) break;
      const c = sorted[i];

      setResults(prev => prev.map(r =>
        r.code === c.code ? { ...r, scrapeStatus: 'scraping' as const } : r
      ));
      setProgress({ current: i + 1, total: sorted.length });

      try {
        const [payouts, existing] = await Promise.all([
          scrapeDividendPreview(c.code),
          getDividendPayouts(c.code).catch(() => [] as DividendPayoutData[]),
        ]);
        setResults(prev => prev.map(r =>
          r.code === c.code ? { ...r, scrapeStatus: 'done' as const, payouts, existingDates: new Set(existing.map((e: DividendPayoutData) => e.exDividendDate)) } : r
        ));
      } catch (err: any) {
        setResults(prev => prev.map(r =>
          r.code === c.code ? { ...r, scrapeStatus: 'error' as const, error: err?.message || 'Failed' } : r
        ));
      }
    }

    setMode('all-preview');
  };

  // Save one company
  const handleSaveCompany = async (code: string) => {
    setResults(prev => prev.map(r =>
      r.code === code ? { ...r, saveStatus: 'saving' as const } : r
    ));
    try {
      const r = results.find(r => r.code === code);
      if (!r || r.payouts.length === 0) return;
      const res = await scrapeDividendConfirm(code, r.payouts);
      setResults(prev => prev.map(r =>
        r.code === code ? { ...r, saveStatus: 'saved' as const, savedCount: res.newRecords } : r
      ));
    } catch {
      setResults(prev => prev.map(r =>
        r.code === code ? { ...r, saveStatus: 'error' as const } : r
      ));
    }
  };

  // Save all unsaved
  const handleSaveAllRemaining = async () => {
    const unsaved = results.filter(r => r.saveStatus === 'unsaved' && r.payouts.some(p => !r.existingDates.has(p.exDividendDate)));
    for (const r of unsaved) {
      await handleSaveCompany(r.code);
    }
  };

  const handleReset = () => {
    setCompanyCode('');
    setSinglePreview([]);
    setResults([]);
    setError('');
    setMode('select');
    abortRef.current = false;
  };

  const totalScraped = results.reduce((s, r) => s + r.payouts.length, 0);
  const companiesWithData = results.filter(r => r.payouts.length > 0).length;
  const unsavedWithNew = results.filter(r => r.saveStatus === 'unsaved' && r.payouts.some(p => !r.existingDates.has(p.exDividendDate))).length;
  const savedCount = results.filter(r => r.saveStatus === 'saved').length;
  const company = companies.find(c => c.code === companyCode);

  return (
    <div>
      <h1>Scrape Dividend Payouts</h1>

      {mode === 'select' && (
        <div className="form-card" style={{ maxWidth: '500px' }}>
          <div className="form-row">
            <label>Single Company</label>
            <CompanySearchSelect companies={companies} value={companyCode} onChange={setCompanyCode} />
          </div>
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-upload" onClick={handleScrape} disabled={!companyCode || scraping}>
              {scraping ? 'Scraping...' : 'Scrape Company'}
            </button>
          </div>

          <div style={{ margin: '1.5rem 0', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <label style={{ fontWeight: 600 }}>All Companies ({companies.length})</label>
            <div className="form-row" style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.85rem' }}>Scrape Order</label>
              <select
                value={scrapeOrder}
                onChange={e => setScrapeOrder(e.target.value as typeof scrapeOrder)}
                style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-card)', fontSize: '0.85rem' }}
              >
                <option value="code-asc">Company Code (A-Z)</option>
                <option value="code-desc">Company Code (Z-A)</option>
                <option value="name-asc">Company Name (A-Z)</option>
                <option value="name-desc">Company Name (Z-A)</option>
              </select>
            </div>
            <div className="upload-actions" style={{ marginTop: '0.75rem' }}>
              <button className="btn-upload" onClick={handleScrapeAll} disabled={companies.length === 0}>
                Scrape All Companies
              </button>
            </div>
            <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Scrapes each company sequentially (~15s per company). You can review and save individually.
            </div>
          </div>

          {scraping && (
            <div style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Loading headless browser and fetching dividend data...
            </div>
          )}
        </div>
      )}

      {/* Single company preview */}
      {mode === 'single-preview' && (
        <>
          <div className="success-message" style={{ background: '#bee3f8', color: '#2a4365' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {company && <CompanyAvatar code={company.code} size={24} />}
              <span>
                Found {singlePreview.length} record{singlePreview.length !== 1 ? 's' : ''} for <strong>{companyCode}</strong>
                {company ? ` (${company.name})` : ''}.
              </span>
            </div>
          </div>
          {singlePreview.length > 0 && <PayoutTable payouts={singlePreview} existingDates={singleExisting} />}
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            {(() => {
              const newCount = singlePreview.filter(p => !singleExisting.has(p.exDividendDate)).length;
              return (
                <button className="btn-upload" onClick={handleSingleConfirm} disabled={saving || newCount === 0}>
                  {saving ? 'Saving...' : newCount > 0 ? `Confirm & Save ${newCount} New Records` : 'All records up to date'}
                </button>
              );
            })()}
            <button className="btn-reset" onClick={handleReset}>Cancel</button>
          </div>
        </>
      )}

      {/* All companies - scraping in progress */}
      {mode === 'all-scraping' && (
        <>
          <div className="success-message" style={{ background: '#bee3f8', color: '#2a4365' }}>
            Scraping {progress.current} / {progress.total} companies...
          </div>
          <ProgressBar current={progress.current} total={progress.total} />
          <ScrapeResultsTable results={results} onSave={handleSaveCompany} defaultSort={defaultSort} />
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-reset" onClick={() => { abortRef.current = true; }}>Stop</button>
          </div>
        </>
      )}

      {/* All companies - preview with per-company save */}
      {mode === 'all-preview' && (
        <>
          <div className="success-message" style={{ background: '#bee3f8', color: '#2a4365' }}>
            Scraped {companiesWithData} companies with {totalScraped} total records.
            {savedCount > 0 && ` Saved: ${savedCount}.`}
            {unsavedWithNew > 0 && ` With new data: ${unsavedWithNew}.`}
          </div>
          <ScrapeResultsTable results={results} onSave={handleSaveCompany} defaultSort={defaultSort} />
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            {unsavedWithNew > 0 && (
              <button className="btn-upload" onClick={handleSaveAllRemaining}>
                Save All Remaining ({unsavedWithNew} companies)
              </button>
            )}
            <button className="btn-reset" onClick={handleReset}>
              {unsavedWithNew === 0 ? 'Done' : 'Cancel'}
            </button>
          </div>
        </>
      )}

      {/* Done (single company) */}
      {mode === 'done' && (
        <>
          <div className="success-message">Saved successfully.</div>
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-reset" onClick={handleReset}>Start Over</button>
          </div>
        </>
      )}

      {error && <div className="error-message">{error}</div>}

      <CalendarScraper />
      <FinancialsScraper companies={companies} />
    </div>
  );
}

function CalendarScraper() {
  const [calMode, setCalMode] = useState<'idle' | 'scraping' | 'preview' | 'saving' | 'done'>('idle');
  const [calData, setCalData] = useState<Record<string, any>[]>([]);
  const [droppedIds, setDroppedIds] = useState<Set<string>>(new Set());
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [calResult, setCalResult] = useState<{ totalScraped: number; created: number; updated: number; skipped: number } | null>(null);
  const [calError, setCalError] = useState('');
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateEnd, setDateEnd] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  });

  const displayCols = ['ticker_symbol', 'company_name', 'xd_date', 'payment_date', 'announcement_date', 'dividend_per_share', 'dividend_type'];
  const colLabels: Record<string, string> = {
    ticker_symbol: 'Ticker', company_name: 'Company', xd_date: 'XD Date',
    payment_date: 'Payment', announcement_date: 'Announced',
    dividend_per_share: 'Amount', dividend_type: 'Type',
  };

  const rowKey = (row: Record<string, any>) => (row.ticker_symbol || '') + '|' + (row.xd_date || '');
  const toggleDrop = (key: string) => setDroppedIds(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const activeData = calData.filter(r => !droppedIds.has(rowKey(r)));

  const getCompanyCode = (ticker: string) => ticker?.endsWith('0000') ? ticker.substring(0, ticker.length - 4) : ticker;
  const months: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
  const parseDateToIso = (text: string): string | null => {
    if (!text) return null;
    // "DD MMM YYYY" or "D MMM YYYY"
    const m = text.trim().match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
    if (m) {
      const mon = months[m[2]];
      if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`;
    }
    // "YYYY-MM-DD" already
    if (text.match(/^\d{4}-\d{2}-\d{2}$/)) return text;
    return null;
  };
  const isExisting = (row: Record<string, any>) => {
    const code = getCompanyCode(row.ticker_symbol);
    const iso = parseDateToIso(row.xd_date);
    if (!code || !iso) return false;
    return existingKeys.has(code + '|' + iso);
  };

  const newCount = activeData.filter(r => !isExisting(r)).length;
  const existCount = activeData.length - newCount;

  const handlePreview = async () => {
    setCalMode('scraping');
    setCalError('');
    setCalData([]);
    try {
      const [data, existing] = await Promise.all([
        scrapeDividendCalendarPreview(dateStart, dateEnd),
        getAllDividendPayouts().catch(() => [] as DividendPayoutData[]),
      ]);
      setCalData(data);
      const keys = new Set<string>();
      existing.forEach(p => {
        if (p.companyCode && p.exDividendDate) keys.add(p.companyCode + '|' + p.exDividendDate);
      });
      setExistingKeys(keys);
      setCalMode('preview');
    } catch (err: any) {
      setCalError(err?.response?.data?.error || err?.message || 'Fetch failed.');
      setCalMode('idle');
    }
  };

  const handleConfirm = async () => {
    setCalMode('saving');
    setCalError('');
    try {
      const result = await scrapeDividendCalendarConfirm(activeData);
      setCalResult(result);
      setCalMode('done');
    } catch (err: any) {
      setCalError(err?.response?.data?.error || err?.message || 'Save failed.');
      setCalMode('preview');
    }
  };

  const handleReset = () => {
    setCalMode('idle');
    setCalData([]);
    setCalResult(null);
    setCalError('');
  };

  return (
    <div style={{ marginTop: '2rem', borderTop: '2px solid var(--border-color)', paddingTop: '1.5rem' }}>
      <h2>Dividend Calendar (stockdecision.com)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
        Fetch announcement dates and dividend types via API and update existing payout records.
      </p>

      {(calMode === 'idle' || calMode === 'preview') && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>XD Date Range:</label>
          <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
          <button className="btn-upload" onClick={handlePreview}>
            {calMode === 'preview' ? 'Re-fetch' : 'Fetch'}
          </button>
        </div>
      )}

      {calMode === 'scraping' && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Fetching dividend calendar data...
        </div>
      )}

      {calMode === 'preview' && (
        <>
          <div className="success-message" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
            {activeData.length} record{activeData.length !== 1 ? 's' : ''} — {newCount} new, {existCount} existing
            {droppedIds.size > 0 && <>, {droppedIds.size} dropped</>}.
          </div>
          {calData.length > 0 && (
            <div className="portfolio-table-wrap" style={{ maxHeight: '400px', overflow: 'auto' }}>
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Status</th>
                    {displayCols.map(h => <th key={h}>{colLabels[h] || h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {calData.map((row, i) => {
                    const key = rowKey(row);
                    const dropped = droppedIds.has(key);
                    const exists = isExisting(row);
                    return (
                      <tr key={i} style={dropped ? { opacity: 0.3, textDecoration: 'line-through' } : exists ? { opacity: 0.6 } : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!dropped}
                            onChange={() => toggleDrop(key)}
                            title={dropped ? 'Include' : 'Drop'}
                          />
                        </td>
                        <td>
                          {dropped
                            ? <span style={{ color: 'var(--gain-negative)', fontSize: '0.8rem' }}>Dropped</span>
                            : exists
                            ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Exists</span>
                            : <span className="gain-positive" style={{ fontSize: '0.8rem' }}>New</span>}
                        </td>
                        {displayCols.map(h => (
                          <td key={h} style={{ fontSize: '0.85rem' }}>
                            {row[h] != null ? String(row[h]) : '-'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-upload" onClick={handleConfirm} disabled={activeData.length === 0}>
              Confirm & Save ({activeData.length} records)
            </button>
            <button className="btn-reset" onClick={handleReset}>Cancel</button>
          </div>
        </>
      )}

      {calMode === 'saving' && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Saving...</div>
      )}

      {calMode === 'done' && calResult && (
        <>
          <div className="success-message">
            Fetched {calResult.totalScraped} records. Created: {calResult.created}, Updated: {calResult.updated}, Skipped: {calResult.skipped}.
          </div>
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-reset" onClick={handleReset}>Done</button>
          </div>
        </>
      )}

      {calError && <div className="error-message">{calError}</div>}
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ margin: '0.75rem 0' }}>
      <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${(current / total) * 100}%`,
          background: 'var(--accent)', transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}

function PayoutTable({ payouts, existingDates }: { payouts: DividendPayoutData[]; existingDates?: Set<string> }) {
  const newCount = existingDates ? payouts.filter(p => !existingDates.has(p.exDividendDate)).length : payouts.length;
  const existCount = existingDates ? payouts.length - newCount : 0;

  return (
    <>
      {existingDates && existCount > 0 && (
        <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {newCount} new, {existCount} already exist
        </div>
      )}
      <div className="portfolio-table-wrap">
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Ex-Dividend Date</th>
              <th>Payment Date</th>
              <th className="text-right">Amount (LKR)</th>
              {existingDates && <th>Status</th>}
            </tr>
          </thead>
          <tbody>
            {payouts.map((p, i) => {
              const exists = existingDates?.has(p.exDividendDate);
              return (
                <tr key={i} style={exists ? { opacity: 0.5 } : undefined}>
                  <td>{p.exDividendDate || '-'}</td>
                  <td>{p.paymentDate || '-'}</td>
                  <td className="text-right mono">
                    {p.amountPerShare != null ? Number(p.amountPerShare).toFixed(3) : '-'}
                  </td>
                  {existingDates && (
                    <td>
                      {exists
                        ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Exists</span>
                        : <span className="gain-positive" style={{ fontSize: '0.8rem' }}>New</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ScrapeResultsTable({ results, onSave, defaultSort }: {
  results: CompanyScrapeResult[];
  onSave: (code: string) => void;
  defaultSort?: { key: SortKey; dir: 'asc' | 'desc' };
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort?.key ?? 'code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.dir ?? 'asc');

  useEffect(() => {
    if (defaultSort) {
      setSortKey(defaultSort.key);
      setSortDir(defaultSort.dir);
    }
  }, [defaultSort?.key, defaultSort?.dir]);


  const sorted = [...results].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'code': cmp = a.code.localeCompare(b.code); break;
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'records': cmp = a.payouts.length - b.payouts.length; break;
      case 'scrapeStatus': cmp = a.scrapeStatus.localeCompare(b.scrapeStatus); break;
      case 'saveStatus': cmp = a.saveStatus.localeCompare(b.saveStatus); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const toggle = (code: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });

  return (
    <div className="portfolio-table-wrap">
      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Company</th>
            <th className="text-right">Records</th>
            <th>Scrape</th>
            <th>Save</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <React.Fragment key={r.code}>
              <tr
                onClick={() => r.payouts.length > 0 && toggle(r.code)}
                style={{ cursor: r.payouts.length > 0 ? 'pointer' : 'default' }}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CompanyAvatar code={r.code} size={24} />
                    <span className="company-code">{r.code}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.name}</span>
                    {r.payouts.length > 0 && (
                      <span style={{ fontSize: '0.65rem', marginLeft: '0.25rem' }}>
                        {expanded.has(r.code) ? '\u25BC' : '\u25B6'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right mono">
                  {r.payouts.length > 0
                    ? <>{r.payouts.filter(p => !r.existingDates.has(p.exDividendDate)).length} new / {r.payouts.length}</>
                    : '-'}
                </td>
                <td>
                  {r.scrapeStatus === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Pending</span>}
                  {r.scrapeStatus === 'scraping' && <span style={{ color: 'var(--accent)' }}>Scraping...</span>}
                  {r.scrapeStatus === 'done' && <span className="gain-positive">Done</span>}
                  {r.scrapeStatus === 'error' && <span className="gain-negative" title={r.error}>Failed</span>}
                </td>
                <td>
                  {r.payouts.length > 0 && (r.saveStatus === 'unsaved' || r.saveStatus === 'saved') && (() => {
                    const newCount = r.payouts.filter(p => !r.existingDates.has(p.exDividendDate)).length;
                    if (r.saveStatus === 'saved') {
                      return (
                        <span className="gain-positive" style={{ fontSize: '0.8rem' }}>
                          Saved{r.savedCount != null ? ` (${r.savedCount} new)` : ''}
                        </span>
                      );
                    }
                    return newCount > 0 ? (
                      <button
                        className="btn-upload"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={e => { e.stopPropagation(); onSave(r.code); }}
                      >
                        Save ({newCount} new)
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Up to date</span>
                    );
                  })()}
                  {r.saveStatus === 'saving' && <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>Saving...</span>}
                  {r.saveStatus === 'error' && <span className="gain-negative" style={{ fontSize: '0.8rem' }}>Error</span>}
                  {r.payouts.length === 0 && r.scrapeStatus === 'done' && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</span>
                  )}
                </td>
              </tr>
              {expanded.has(r.code) && r.payouts.length > 0 && r.payouts.map((p, i) => {
                const exists = r.existingDates.has(p.exDividendDate);
                return (
                  <tr key={`${r.code}-${i}`} style={{ background: 'var(--bg-thead)', opacity: exists ? 0.5 : 1 }}>
                    <td style={{ paddingLeft: '2.5rem', fontSize: '0.85rem' }}>
                      {p.exDividendDate || '-'}
                      {exists
                        ? <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Exists</span>
                        : <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }} className="gain-positive">New</span>}
                    </td>
                    <td className="text-right mono" style={{ fontSize: '0.85rem' }}>
                      {p.amountPerShare != null ? Number(p.amountPerShare).toFixed(3) : '-'}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{p.paymentDate || '-'}</td>
                    <td></td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinancialsScraper({ companies }: { companies: Company[] }) {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'idle' | 'scraping' | 'preview' | 'saving' | 'done' | 'all-scraping' | 'all-done'>('idle');
  const [data, setData] = useState<{ year: number; dps: number | null; eps: number | null; yield: number | null }[]>([]);
  const [result, setResult] = useState<{ totalScraped: number; saved: number } | null>(null);
  const [allResults, setAllResults] = useState<{ code: string; status: 'pending' | 'scraping' | 'scraped' | 'saving' | 'saved' | 'done' | 'error' | 'save-error'; scraped?: number; saved?: number; error?: string }[]>([]);
  const [allProgress, setAllProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');

  const handlePreview = async () => {
    if (!code) return;
    setMode('scraping');
    setError('');
    setData([]);
    try {
      const res = await scrapeDividendFinancialsPreview(code);
      setData(res);
      setMode('preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Scraping failed.');
      setMode('idle');
    }
  };

  const handleConfirm = async () => {
    setMode('saving');
    setError('');
    try {
      const res = await scrapeDividendFinancialsConfirm(code);
      setResult(res);
      setMode('done');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed.');
      setMode('preview');
    }
  };

  const handleScrapeAll = async () => {
    setMode('all-scraping');
    setError('');
    const sorted = [...companies].sort((a, b) => a.code.localeCompare(b.code));
    const initial = sorted.map(c => ({ code: c.code, status: 'pending' as const }));
    setAllResults(initial);
    setAllProgress({ current: 0, total: sorted.length });

    const batchSize = 10;
    for (let i = 0; i < sorted.length; i += batchSize) {
      const batch = sorted.slice(i, i + batchSize);
      batch.forEach(c => {
        setAllResults(prev => prev.map(r => r.code === c.code ? { ...r, status: 'scraping' } : r));
      });
      setAllProgress({ current: Math.min(i + batchSize, sorted.length), total: sorted.length });

      await Promise.all(batch.map(async c => {
        try {
          const preview = await scrapeDividendFinancialsPreview(c.code);
          const validData = preview.filter(d => !('_debug' in d));
          setAllResults(prev => prev.map(r => r.code === c.code ? { ...r, status: 'scraped', scraped: validData.length } : r));
        } catch (err: any) {
          setAllResults(prev => prev.map(r => r.code === c.code ? { ...r, status: 'error', error: err?.message || 'Failed' } : r));
        }
      }));
    }
    setMode('all-done');
  };

  const handleSaveOne = async (companyCode: string) => {
    setAllResults(prev => prev.map(r => r.code === companyCode ? { ...r, status: 'saving' as any } : r));
    try {
      const res = await scrapeDividendFinancialsConfirm(companyCode);
      setAllResults(prev => prev.map(r => r.code === companyCode ? { ...r, status: 'saved' as any, saved: res.saved } : r));
    } catch {
      setAllResults(prev => prev.map(r => r.code === companyCode ? { ...r, status: 'save-error' as any } : r));
    }
  };

  const handleSaveAllRemaining = async () => {
    const toSave = allResults.filter(r => r.status === ('scraped' as any) && (r.scraped ?? 0) > 0);
    for (const r of toSave) {
      await handleSaveOne(r.code);
    }
  };

  const handleReset = () => {
    setCode('');
    setData([]);
    setResult(null);
    setAllResults([]);
    setError('');
    setMode('idle');
  };

  const fmt = (n: number | null) => n != null ? n.toFixed(2) : '-';

  return (
    <div style={{ marginTop: '2rem', borderTop: '2px solid var(--border-color)', paddingTop: '1.5rem' }}>
      <h2>Dividend Financials (TradingView FY Data)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
        Scrape annual DPS, dividend yield, and payout ratio from TradingView financials page.
      </p>

      {(mode === 'idle' || mode === 'preview') && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '250px' }}>
              <CompanySearchSelect companies={companies} value={code} onChange={setCode} />
            </div>
            <button className="btn-upload" onClick={handlePreview} disabled={!code}>
              {mode === 'preview' ? 'Re-scrape' : 'Scrape'}
            </button>
          </div>
          {mode === 'idle' && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginBottom: '1rem' }}>
              <button className="btn-upload" onClick={handleScrapeAll} disabled={companies.length === 0}>
                Scrape All Companies ({companies.length})
              </button>
              <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Scrapes FY data for each company sequentially (~10s each). Uses headless browser.
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'scraping' && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Scraping FY dividend data for {code}...
        </div>
      )}

      {mode === 'preview' && (
        <>
          <div className="success-message" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
            Found {data.filter(d => !('_debug' in d)).length} year{data.filter(d => !('_debug' in d)).length !== 1 ? 's' : ''} of data for {code}.
          </div>
          {data.length > 0 && (data as any)[0]?._debug && (
            <div className="error-message" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', maxHeight: '200px', overflow: 'auto' }}>
              Debug: {(data as any)[0]._debug}
            </div>
          )}
          {data.filter(d => !('_debug' in d)).length > 0 && (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th className="text-right">DPS (LKR)</th>
                    <th className="text-right">EPS (LKR)</th>
                    <th className="text-right">Yield %</th>
                    <th className="text-right">Payout %</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data].sort((a, b) => b.year - a.year).map(d => {
                    const payout = d.dps && d.eps && d.eps !== 0 ? (d.dps / d.eps * 100) : null;
                    return (
                      <tr key={d.year}>
                        <td style={{ fontWeight: 600 }}>{d.year}</td>
                        <td className="text-right mono">{fmt(d.dps)}</td>
                        <td className="text-right mono">{fmt(d.eps)}</td>
                        <td className="text-right mono">{fmt(d.yield)}</td>
                        <td className="text-right mono">{payout != null ? payout.toFixed(2) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-upload" onClick={handleConfirm} disabled={data.filter(d => !('_debug' in d)).length === 0}>
              Confirm & Save ({data.filter(d => !('_debug' in d)).length} records)
            </button>
            <button className="btn-reset" onClick={handleReset}>Cancel</button>
          </div>
        </>
      )}

      {mode === 'saving' && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Saving...</div>
      )}

      {mode === 'done' && result && (
        <>
          <div className="success-message">
            Saved {result.saved} of {result.totalScraped} records for {code}.
          </div>
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-reset" onClick={handleReset}>Done</button>
          </div>
        </>
      )}

      {(mode === 'all-scraping' || mode === 'all-done') && (
        <>
          <div className="success-message" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
            {mode === 'all-scraping'
              ? `Scraping ${allProgress.current} / ${allProgress.total} companies...`
              : `Done. ${allResults.filter(r => r.status === 'done').length} succeeded, ${allResults.filter(r => r.status === 'error').length} failed.`}
          </div>
          {mode === 'all-scraping' && (
            <div style={{ margin: '0.5rem 0' }}>
              <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(allProgress.current / allProgress.total) * 100}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          <div className="portfolio-table-wrap" style={{ maxHeight: '400px', overflow: 'auto', marginTop: '0.5rem' }}>
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="text-right">Years</th>
                  <th>Scrape</th>
                  <th>Save</th>
                </tr>
              </thead>
              <tbody>
                {allResults.map(r => (
                  <tr key={r.code} style={r.status === 'error' ? { opacity: 0.6 } : undefined}>
                    <td style={{ fontWeight: 600 }}>{r.code}</td>
                    <td className="text-right mono">{r.scraped ?? '-'}</td>
                    <td>
                      {r.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Pending</span>}
                      {r.status === 'scraping' && <span style={{ color: 'var(--accent)' }}>Scraping...</span>}
                      {(r.status === 'scraped' || r.status === 'saving' || r.status === 'saved' || r.status === 'save-error') && <span className="gain-positive">Done</span>}
                      {r.status === 'error' && <span className="gain-negative" title={r.error}>Failed</span>}
                    </td>
                    <td>
                      {r.status === 'scraped' && (r.scraped ?? 0) > 0 && (
                        <button className="btn-upload" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => handleSaveOne(r.code)}>Save</button>
                      )}
                      {r.status === 'scraped' && (r.scraped ?? 0) === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</span>}
                      {r.status === 'saving' && <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>Saving...</span>}
                      {r.status === 'saved' && <span className="gain-positive" style={{ fontSize: '0.8rem' }}>Saved{r.saved != null ? ` (${r.saved})` : ''}</span>}
                      {r.status === 'save-error' && <span className="gain-negative" style={{ fontSize: '0.8rem' }}>Error</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mode === 'all-done' && (
            <div className="upload-actions" style={{ marginTop: '1rem' }}>
              {allResults.filter(r => r.status === 'scraped' && (r.scraped ?? 0) > 0).length > 0 && (
                <button className="btn-upload" onClick={handleSaveAllRemaining}>
                  Save All ({allResults.filter(r => r.status === 'scraped' && (r.scraped ?? 0) > 0).length} companies)
                </button>
              )}
              <button className="btn-reset" onClick={handleReset}>Done</button>
            </div>
          )}
        </>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
