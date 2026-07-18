import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getCompanies, scrapeMarketDataPreview, scrapeMarketDataSaveBars, scrapeMarketDataSaveBar, getMarketDataHistory, scrapeMarketDataCseOne, getCseTradeDate, getCseStatus, recordCseRun, setCseAuto, invalidate, ScrapedBar, CseScrapeStatus } from '../api';
import { Company, MarketData } from '../types';
import CompanySearchSelect from '../components/CompanySearchSelect';
import CompanyAvatar from '../components/CompanyAvatar';

interface CompanyScrapeResult {
  code: string;
  name: string;
  scrapeStatus: 'pending' | 'scraping' | 'done' | 'error';
  saveStatus: 'unsaved' | 'saving' | 'saved' | 'error';
  bars: ScrapedBar[];
  existing: Map<string, MarketData>;
  savedCount?: number;
  error?: string;
}

type Mode = 'select' | 'single-preview' | 'all-scraping' | 'all-preview' | 'done';

export default function MarketDataScraper() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState('');
  const [mode, setMode] = useState<Mode>('select');
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState('');

  // Single company
  const [singlePreview, setSinglePreview] = useState<ScrapedBar[]>([]);
  const [existingData, setExistingData] = useState<Map<string, MarketData>>(new Map());

  // Common date range filter
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [autoSave, setAutoSave] = useState(false);

  // All companies
  const [results, setResults] = useState<CompanyScrapeResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef(false);

  // CSE fetch (browserless HTTP) — looped per company so the UI shows live status.
  type CseStatus = 'pending' | 'fetching' | 'saved' | 'skipped' | 'error';
  const [cseRunning, setCseRunning] = useState(false);
  const [cseProgress, setCseProgress] = useState({ current: 0, total: 0 });
  const [cseResults, setCseResults] = useState<{ code: string; name: string; status: CseStatus; error?: string }[]>([]);
  const [cseTradeDate, setCseTradeDate] = useState('');
  const [cseStatus, setCseStatus] = useState<CseScrapeStatus | null>(null);
  const cseAbortRef = useRef(false);

  const autoOn = cseStatus?.autoEnabled !== false; // default on
  const toggleAuto = async () => {
    try {
      const st = await setCseAuto(!autoOn);
      setCseStatus(st);
    } catch { /* ignore */ }
  };

  const runCseFetch = async () => {
    cseAbortRef.current = false;
    setCseRunning(true);
    // Resolve the last actual market day once, so a run on a weekend/holiday still
    // saves under the day the data belongs to (not calendar today).
    const tradeDate = await getCseTradeDate().catch(() => '');
    setCseTradeDate(tradeDate);
    const sorted = [...companies].sort((a, b) => a.code.localeCompare(b.code));
    setCseResults(sorted.map(c => ({ code: c.code, name: c.name, status: 'pending' as CseStatus })));
    setCseProgress({ current: 0, total: sorted.length });

    let savedN = 0, failedN = 0, processed = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (cseAbortRef.current) break;
      const code = sorted[i].code;
      setCseProgress({ current: i + 1, total: sorted.length });
      setCseResults(prev => prev.map(r => r.code === code ? { ...r, status: 'fetching' } : r));
      try {
        const res = await scrapeMarketDataCseOne(code, tradeDate || undefined);
        const st: CseStatus = res.status === 'saved' ? 'saved' : res.status === 'skipped' ? 'skipped' : 'error';
        if (st === 'saved') savedN++; else if (st === 'error') failedN++;
        setCseResults(prev => prev.map(r => r.code === code ? { ...r, status: st, error: res.error } : r));
      } catch (err: any) {
        failedN++;
        setCseResults(prev => prev.map(r => r.code === code ? { ...r, status: 'error', error: err?.message } : r));
      }
      processed++;
      if (i < sorted.length - 1) await new Promise(res => setTimeout(res, 120)); // polite spacing
    }

    invalidate('market', 'ytd', 'year-low', 'dashboard-all', 'portfolio');
    // Record the run (server stamps the time) and refresh the status line.
    try {
      const st = await recordCseRun({ total: processed, saved: savedN, failed: failedN, tradeDate: tradeDate || '' });
      setCseStatus(st);
    } catch { /* status is best-effort */ }
    setCseRunning(false);
  };

  useEffect(() => {
    getCompanies().then(setCompanies).catch(() => {});
    getCseStatus().then(setCseStatus).catch(() => {});
  }, []);

  const handleScrape = async () => {
    if (!companyCode) return;
    setScraping(true);
    setError('');
    setSinglePreview([]);
    setExistingData(new Map());
    try {
      const [data, history] = await Promise.all([
        scrapeMarketDataPreview(companyCode),
        getMarketDataHistory(companyCode).catch(() => [] as MarketData[]),
      ]);
      setSinglePreview(data);
      const map = new Map<string, MarketData>();
      history.forEach(md => map.set(md.tradeDate, md));
      setExistingData(map);
      setMode('single-preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Scraping failed.');
    } finally {
      setScraping(false);
    }
  };

  const handleSingleConfirm = async () => {
    if (!companyCode) return;
    setScraping(true);
    setError('');
    try {
      const filtered = singlePreview.filter(b => {
        if (b.volume === 0) return false;
        if (dateFrom && b.date < dateFrom) return false;
        if (dateTo && b.date > dateTo) return false;
        return true;
      });
      await scrapeMarketDataSaveBars(companyCode, filtered);
      setMode('done');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed.');
    } finally {
      setScraping(false);
    }
  };

  const scrapeOne = async (code: string) => {
    setResults(prev => prev.map(r =>
      r.code === code ? { ...r, scrapeStatus: 'scraping' as const, error: undefined } : r
    ));
    try {
      const [bars, history] = await Promise.all([
        scrapeMarketDataPreview(code),
        getMarketDataHistory(code).catch(() => [] as MarketData[]),
      ]);
      const exMap = new Map<string, MarketData>();
      history.forEach(md => exMap.set(md.tradeDate, md));
      setResults(prev => prev.map(r =>
        r.code === code ? { ...r, scrapeStatus: 'done' as const, bars, existing: exMap } : r
      ));

      if (autoSave && bars.length > 0) {
        const filtered = bars.filter(b => {
          if (b.volume === 0) return false;
          if (dateFrom && b.date < dateFrom) return false;
          if (dateTo && b.date > dateTo) return false;
          return true;
        });
        if (filtered.length > 0) {
          setResults(prev => prev.map(r =>
            r.code === code ? { ...r, saveStatus: 'saving' as const } : r
          ));
          try {
            const res = await scrapeMarketDataSaveBars(code, filtered);
            setResults(prev => prev.map(r =>
              r.code === code ? { ...r, saveStatus: 'saved' as const, savedCount: res.newRecords } : r
            ));
          } catch {
            setResults(prev => prev.map(r =>
              r.code === code ? { ...r, saveStatus: 'error' as const } : r
            ));
          }
        }
      }
    } catch (err: any) {
      setResults(prev => prev.map(r =>
        r.code === code ? { ...r, scrapeStatus: 'error' as const, error: err?.response?.data?.error || err?.message || 'Failed' } : r
      ));
    }
  };

  const handleScrapeAll = async () => {
    abortRef.current = false;
    setError('');
    setMode('all-scraping');

    const sorted = [...companies].sort((a, b) => a.code.localeCompare(b.code));
    const initial: CompanyScrapeResult[] = sorted.map(c => ({
      code: c.code, name: c.name, scrapeStatus: 'pending', saveStatus: 'unsaved', bars: [], existing: new Map(),
    }));
    setResults(initial);
    setProgress({ current: 0, total: sorted.length });

    for (let i = 0; i < sorted.length; i++) {
      if (abortRef.current) break;
      setProgress({ current: i + 1, total: sorted.length });
      await scrapeOne(sorted[i].code);
    }

    setMode('all-preview');
  };

  const handleRetryScrape = (code: string) => {
    void scrapeOne(code);
  };

  const handleSaveCompany = async (code: string) => {
    setResults(prev => prev.map(r =>
      r.code === code ? { ...r, saveStatus: 'saving' as const } : r
    ));
    try {
      const r = results.find(r => r.code === code);
      if (!r) return;
      const filtered = r.bars.filter(b => {
        if (b.volume === 0) return false;
        if (dateFrom && b.date < dateFrom) return false;
        if (dateTo && b.date > dateTo) return false;
        return true;
      });
      const res = await scrapeMarketDataSaveBars(code, filtered);
      setResults(prev => prev.map(r =>
        r.code === code ? { ...r, saveStatus: 'saved' as const, savedCount: res.newRecords } : r
      ));
    } catch {
      setResults(prev => prev.map(r =>
        r.code === code ? { ...r, saveStatus: 'error' as const } : r
      ));
    }
  };

  const handleSaveAllRemaining = async () => {
    const unsaved = results.filter(r => r.saveStatus === 'unsaved' && r.bars.length > 0);
    for (const r of unsaved) {
      await handleSaveCompany(r.code);
    }
  };

  const handleReset = () => {
    setCompanyCode('');
    setSinglePreview([]);
    setExistingData(new Map());
    setResults([]);
    setError('');
    setMode('select');
    abortRef.current = false;
  };

  const totalScraped = results.reduce((s, r) => s + r.bars.length, 0);
  const companiesWithData = results.filter(r => r.bars.length > 0).length;
  const unsavedWithData = results.filter(r => r.saveStatus === 'unsaved' && r.bars.length > 0).length;
  const savedCount = results.filter(r => r.saveStatus === 'saved').length;
  const company = companies.find(c => c.code === companyCode);

  return (
    <div>
      <h1>Scrape Market Data</h1>

      {mode !== 'select' && mode !== 'done' && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
          <span style={{ background: 'var(--gain-pill-up-bg)', color: 'var(--gain-pill-up-color)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>New record</span>
          <span style={{ background: 'var(--gain-pill-down-bg)', color: 'var(--gain-pill-down-color)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>Value differs</span>
        </div>
      )}

      {mode === 'select' && (() => {
        const done = !cseRunning && cseProgress.total > 0;
        const savedN = cseResults.filter(r => r.status === 'saved').length;
        const skippedN = cseResults.filter(r => r.status === 'skipped').length;
        const failedN = cseResults.filter(r => r.status === 'error').length;
        return (
          <div className="form-card" style={{ maxWidth: '600px', marginBottom: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Today's Prices — CSE (fast)</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
              Pulls the last price, high/low and volume for every company straight from the CSE JSON API over plain HTTP — no headless browser. Saved under the last actual market day, so running on a weekend/holiday still aligns correctly.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem' }}>
                Auto-fetch (every 15 min, server):{' '}
                <strong className={autoOn ? 'gain-positive' : 'gain-negative'}>{autoOn ? 'ON' : 'OFF'}</strong>
              </span>
              <button className="btn-reset" onClick={toggleAuto}>
                {autoOn ? 'Stop auto-fetch' : 'Start auto-fetch'}
              </button>
            </div>
            {cseTradeDate && (
              <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Market day: <strong>{cseTradeDate}</strong>
              </div>
            )}
            {cseStatus?.lastRunAt && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Last run: {new Date(cseStatus.lastRunAt).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}
                {' — '}
                <span className={cseStatus.status === 'success' ? 'gain-positive' : cseStatus.status === 'failed' ? 'gain-negative' : undefined}>
                  {cseStatus.status}
                </span>
                {` (${cseStatus.saved} saved, ${cseStatus.failed} failed of ${cseStatus.total}${cseStatus.tradeDate ? `, ${cseStatus.tradeDate}` : ''})`}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn-upload" onClick={runCseFetch} disabled={cseRunning || companies.length === 0}>
                {cseRunning ? 'Fetching…' : 'Fetch Today’s Prices'}
              </button>
              {cseRunning && <button className="btn-reset" onClick={() => { cseAbortRef.current = true; }}>Stop</button>}
              {cseProgress.total > 0 && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {cseProgress.current}/{cseProgress.total}
                </span>
              )}
            </div>

            {cseProgress.total > 0 && <ProgressBar current={cseProgress.current} total={cseProgress.total} />}

            {cseResults.length > 0 && (
              <div style={{ fontSize: '0.85rem', margin: '0.5rem 0' }}>
                <span className="gain-positive">{savedN} saved</span>
                {', '}<span style={{ color: 'var(--text-muted)' }}>{skippedN} no price</span>
                {', '}<span className="gain-negative">{failedN} failed</span>
                {done && <span style={{ color: 'var(--text-muted)' }}> — done</span>}
              </div>
            )}

            {cseResults.length > 0 && (
              <div className="portfolio-table-wrap" style={{ maxHeight: '320px', overflow: 'auto' }}>
                <table className="portfolio-table">
                  <thead>
                    <tr><th>Company</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {cseResults.map(r => (
                      <tr key={r.code}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CompanyAvatar code={r.code} size={22} />
                            <span className="company-code">{r.code}</span>
                            <span className="hide-sm" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.name}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {r.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Pending</span>}
                          {r.status === 'fetching' && <span style={{ color: 'var(--accent)' }}>Fetching…</span>}
                          {r.status === 'saved' && <span className="gain-positive">Saved</span>}
                          {r.status === 'skipped' && <span style={{ color: 'var(--text-muted)' }}>No price</span>}
                          {r.status === 'error' && <span className="gain-negative" title={r.error}>Failed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {mode === 'select' && (
        <div className="form-card" style={{ maxWidth: '500px' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Date Range Filter</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem', flex: 1 }} />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem', flex: 1 }} />
              {(dateFrom || dateTo) && (
                <button className="btn-reset" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                  onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</button>
              )}
            </div>
            <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Applies to both single and all-company scrapes. Only bars in this range will be shown and saved.
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
            <div className="form-row">
              <label>Single Company</label>
              <CompanySearchSelect companies={companies} value={companyCode} onChange={setCompanyCode} />
            </div>
            <div className="upload-actions" style={{ marginTop: '1rem' }}>
              <button className="btn-upload" onClick={handleScrape} disabled={!companyCode || scraping}>
                {scraping ? 'Scraping...' : 'Scrape Company'}
              </button>
            </div>
          </div>

          <div style={{ margin: '1.5rem 0', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <label style={{ fontWeight: 600 }}>All Companies ({companies.length})</label>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
                Auto-save after scrape
              </label>
            </div>
            <div className="upload-actions" style={{ marginTop: '0.75rem' }}>
              <button className="btn-upload" onClick={handleScrapeAll} disabled={companies.length === 0}>
                Scrape All Companies
              </button>
            </div>
            <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Scrapes historical OHLC data from TradingView for each company (~15s each). Higher parallelism = faster but more server RAM.
            </div>
          </div>
          {scraping && (
            <div style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Loading headless browser and fetching chart data...
            </div>
          )}
        </div>
      )}

      {mode === 'single-preview' && (
        <>
          <div className="success-message" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {company && <CompanyAvatar code={company.code} size={24} />}
              <span>
                Found {singlePreview.length} bar{singlePreview.length !== 1 ? 's' : ''} for <strong>{companyCode}</strong>
                {company ? ` (${company.name})` : ''}.
                {singlePreview.length > 0 && (
                  <> Range: {singlePreview[singlePreview.length - 1].date} to {singlePreview[0].date}</>
                )}
              </span>
            </div>
          </div>
          {singlePreview.length > 0 && (
            <BarTableWithDiff
              bars={singlePreview}
              existing={existingData}
              companyCode={companyCode}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          )}
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            {(() => {
              const inRange = singlePreview.filter(b => {
                if (dateFrom && b.date < dateFrom) return false;
                if (dateTo && b.date > dateTo) return false;
                return b.volume > 0;
              });
              return (
                <button className="btn-upload" onClick={handleSingleConfirm} disabled={scraping || inRange.length === 0}>
                  {scraping ? 'Saving...' : `Save All ${inRange.length} Records`}
                </button>
              );
            })()}
            <button className="btn-reset" onClick={handleReset}>Cancel</button>
          </div>
        </>
      )}

      {mode === 'all-scraping' && (
        <>
          <div className="success-message" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
            Scraping {progress.current} / {progress.total} companies...
            {(dateFrom || dateTo) && <span> (filtering: {dateFrom || '...'} to {dateTo || '...'})</span>}
          </div>
          <ProgressBar current={progress.current} total={progress.total} />
          <ScrapeResultsTable results={results} onSave={handleSaveCompany} onRetry={handleRetryScrape} dateFrom={dateFrom} dateTo={dateTo} />
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-reset" onClick={() => { abortRef.current = true; }}>Stop</button>
          </div>
        </>
      )}

      {mode === 'all-preview' && (
        <>
          <div className="success-message" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>
            Scraped {companiesWithData} companies with {totalScraped} total bars.
            {savedCount > 0 && ` Saved: ${savedCount}.`}
            {unsavedWithData > 0 && ` Ready to save: ${unsavedWithData}.`}
          </div>
          <ScrapeResultsTable results={results} onSave={handleSaveCompany} onRetry={handleRetryScrape} dateFrom={dateFrom} dateTo={dateTo} />
          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            {unsavedWithData > 0 && (
              <button className="btn-upload" onClick={handleSaveAllRemaining}>
                Save All Remaining ({unsavedWithData} companies)
              </button>
            )}
            <button className="btn-reset" onClick={handleReset}>
              {unsavedWithData === 0 ? 'Done' : 'Cancel'}
            </button>
          </div>
        </>
      )}

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

function BarTableWithDiff({ bars, existing, companyCode, dateFrom, dateTo }: {
  bars: ScrapedBar[];
  existing: Map<string, MarketData>;
  companyCode: string;
  dateFrom: string;
  dateTo: string;
}) {
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtVol = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  const [savedRows, setSavedRows] = useState<Set<string>>(new Set());
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return bars.filter(b => {
      if (dateFrom && b.date < dateFrom) return false;
      if (dateTo && b.date > dateTo) return false;
      return true;
    });
  }, [bars, dateFrom, dateTo]);

  const nonZeroVolume = filtered.filter(b => b.volume > 0);
  const zeroVolume = filtered.length - nonZeroVolume.length;

  const handleSaveRow = async (bar: ScrapedBar) => {
    setSavingRows(prev => new Set(prev).add(bar.date));
    try {
      await scrapeMarketDataSaveBar(companyCode, bar);
      setSavedRows(prev => new Set(prev).add(bar.date));
    } catch (e) {
      console.error('Failed to save bar', bar.date, e);
    } finally {
      setSavingRows(prev => { const n = new Set(prev); n.delete(bar.date); return n; });
    }
  };

  const isDiff = (bar: ScrapedBar, field: 'open' | 'high' | 'low' | 'close') => {
    const ex = existing.get(bar.date);
    if (!ex) return false;
    const exVal = field === 'close' ? ex.lastTrade : ex[field];
    if (exVal == null) return field === 'open';
    return Math.abs(bar[field] - exVal) > 0.005;
  };

  const diffStyle = { background: 'var(--gain-pill-down-bg)', color: 'var(--gain-pill-down-color)', fontWeight: 600 } as const;
  const newStyle = { background: 'var(--gain-pill-up-bg)', color: 'var(--gain-pill-up-color)' } as const;

  return (
    <>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', margin: '0.75rem 0', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {filtered.length} bars{dateFrom || dateTo ? ' (filtered)' : ''} — {nonZeroVolume.length} tradable{zeroVolume > 0 && `, ${zeroVolume} skipped (vol=0)`}
        </span>
      </div>
      <div className="portfolio-table-wrap" style={{ maxHeight: '500px', overflow: 'auto' }}>
        <table className="portfolio-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Open</th>
              <th className="text-right">High</th>
              <th className="text-right">Low</th>
              <th className="text-right">Close</th>
              <th className="text-right">Volume</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => {
              const ex = existing.get(b.date);
              const isNew = !ex;
              const isZeroVol = b.volume === 0;
              const isSaved = savedRows.has(b.date);
              const isSaving = savingRows.has(b.date);
              const hasDiff = !isNew && (isDiff(b, 'open') || isDiff(b, 'high') || isDiff(b, 'low') || isDiff(b, 'close'));

              return (
                <tr key={b.date} style={isZeroVol ? { opacity: 0.4 } : isNew ? newStyle : undefined}>
                  <td>{b.date}</td>
                  <td className="text-right mono" style={!isNew && isDiff(b, 'open') ? diffStyle : undefined}>
                    {fmt(b.open)}
                    {!isNew && isDiff(b, 'open') && ex && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>was {ex.open != null ? fmt(ex.open) : '—'}</div>
                    )}
                  </td>
                  <td className="text-right mono" style={!isNew && isDiff(b, 'high') ? diffStyle : undefined}>
                    {fmt(b.high)}
                    {!isNew && isDiff(b, 'high') && ex && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>was {fmt(ex.high)}</div>
                    )}
                  </td>
                  <td className="text-right mono" style={!isNew && isDiff(b, 'low') ? diffStyle : undefined}>
                    {fmt(b.low)}
                    {!isNew && isDiff(b, 'low') && ex && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>was {fmt(ex.low)}</div>
                    )}
                  </td>
                  <td className="text-right mono" style={!isNew && isDiff(b, 'close') ? diffStyle : undefined}>
                    {fmt(b.close)}
                    {!isNew && isDiff(b, 'close') && ex && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>was {fmt(ex.lastTrade)}</div>
                    )}
                  </td>
                  <td className="text-right mono">{fmtVol(b.volume)}</td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {isZeroVol ? (
                      <span style={{ color: 'var(--text-muted)' }}>Skip</span>
                    ) : isNew ? (
                      <span className="gain-positive">New</span>
                    ) : hasDiff ? (
                      <span style={{ color: 'var(--gain-negative)' }}>Diff</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Match</span>
                    )}
                  </td>
                  <td>
                    {!isZeroVol && !isSaved && (isNew || hasDiff) && (
                      <button
                        className="btn-upload"
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}
                        onClick={() => handleSaveRow(b)}
                        disabled={isSaving}
                      >
                        {isSaving ? '...' : 'Save'}
                      </button>
                    )}
                    {isSaved && <span className="gain-positive" style={{ fontSize: '0.75rem' }}>Saved</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="portfolio-total">
              <td>{filtered.length} bars</td>
              <td></td><td></td><td></td><td></td><td></td>
              <td colSpan={2} style={{ fontSize: '0.8rem' }}>
                {filtered.filter(b => !existing.has(b.date) && b.volume > 0).length} new,{' '}
                {filtered.filter(b => {
                  const ex = existing.get(b.date);
                  if (!ex || b.volume === 0) return false;
                  return isDiff(b, 'open') || isDiff(b, 'high') || isDiff(b, 'low') || isDiff(b, 'close');
                }).length} diff
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function ScrapeResultsTable({ results, onSave, onRetry, dateFrom, dateTo }: {
  results: CompanyScrapeResult[];
  onSave: (code: string) => void;
  onRetry?: (code: string) => void;
  dateFrom: string;
  dateTo: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
            <th className="text-right">Bars</th>
            <th>Date Range</th>
            <th>Scrape</th>
            <th>Save</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => {
            const fb = r.bars.filter(b => {
              if (dateFrom && b.date < dateFrom) return false;
              if (dateTo && b.date > dateTo) return false;
              return true;
            });
            const first = fb.length > 0 ? fb[fb.length - 1].date : '';
            const last = fb.length > 0 ? fb[0].date : '';
            const newCount = fb.filter(b => !r.existing.has(b.date) && b.volume > 0).length;
            const diffCount = fb.filter(b => {
              const ex = r.existing.get(b.date);
              if (!ex || b.volume === 0) return false;
              const d = (f: number, e: number | null) => e == null || Math.abs(f - e) > 0.005;
              return d(b.open, ex.open) || d(b.high, ex.high) || d(b.low, ex.low) || d(b.close, ex.lastTrade);
            }).length;
            return (
              <React.Fragment key={r.code}>
                <tr
                  onClick={() => fb.length > 0 && toggle(r.code)}
                  style={{ cursor: fb.length > 0 ? 'pointer' : 'default' }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={r.code} size={24} />
                      <span className="company-code">{r.code}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.name}</span>
                      {fb.length > 0 && (
                        <span style={{ fontSize: '0.65rem', marginLeft: '0.25rem' }}>
                          {expanded.has(r.code) ? '\u25BC' : '\u25B6'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right mono">
                    {fb.length > 0 ? fb.length : '-'}
                    {(newCount > 0 || diffCount > 0) && (
                      <div style={{ fontSize: '0.7rem' }}>
                        {newCount > 0 && <span className="gain-positive">{newCount} new</span>}
                        {newCount > 0 && diffCount > 0 && ', '}
                        {diffCount > 0 && <span style={{ color: 'var(--gain-negative)' }}>{diffCount} diff</span>}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {fb.length > 0 ? `${first} - ${last}` : '-'}
                  </td>
                  <td>
                    {r.scrapeStatus === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Pending</span>}
                    {r.scrapeStatus === 'scraping' && <span style={{ color: 'var(--accent)' }}>Scraping...</span>}
                    {r.scrapeStatus === 'done' && <span className="gain-positive">Done</span>}
                    {r.scrapeStatus === 'error' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="gain-negative" title={r.error}>Failed</span>
                        {onRetry && (
                          <button
                            className="btn-upload"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={e => { e.stopPropagation(); onRetry(r.code); }}
                          >
                            Retry
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    {fb.length > 0 && r.saveStatus === 'unsaved' && (
                      <button
                        className="btn-upload"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={e => { e.stopPropagation(); onSave(r.code); }}
                      >
                        Save
                      </button>
                    )}
                    {r.saveStatus === 'saving' && <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>Saving...</span>}
                    {r.saveStatus === 'saved' && (
                      <span className="gain-positive" style={{ fontSize: '0.8rem' }}>
                        Saved{r.savedCount != null ? ` (${r.savedCount} new)` : ''}
                      </span>
                    )}
                    {r.saveStatus === 'error' && <span className="gain-negative" style={{ fontSize: '0.8rem' }}>Error</span>}
                    {fb.length === 0 && r.scrapeStatus === 'done' && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</span>
                    )}
                  </td>
                </tr>
                {expanded.has(r.code) && fb.length > 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <BarTableWithDiff bars={fb} existing={r.existing} companyCode={r.code} dateFrom={dateFrom} dateTo={dateTo} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

