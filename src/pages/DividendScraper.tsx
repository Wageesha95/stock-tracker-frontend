import React, { useState, useEffect, useRef } from 'react';
import { getCompanies, scrapeDividendPreview, scrapeDividendConfirm, getDividendPayouts, DividendPayoutData } from '../api';
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'records' ? 'desc' : 'asc');
    }
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';

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
