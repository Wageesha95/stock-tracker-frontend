import { useState, useRef, useEffect, useMemo, DragEvent } from 'react';
import { previewTradeSummary, uploadTradeSummary, getMarketData } from '../api';
import { MarketData } from '../types';
import CompanyAvatar from '../components/CompanyAvatar';
import { useTableSort } from '../hooks/useTableSort';

interface PreviewItem {
  companyCode: string;
  companyName: string;
  lastTrade: number;
  change: number;
  changePercent: number;
}

type SortDir = 'asc' | 'desc';

export default function TradeSummaryUpload() {
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [tradeDate, setTradeDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select');
  const [uploadCount, setUploadCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mdSortKey, setMdSortKey] = useState<string>('');
  const [mdSortDir, setMdSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    getMarketData().then(setMarketData).catch(() => {});
  }, []);

  const previewSort = useTableSort(preview, 'companyCode', 'asc');

  const handleMdSort = (key: string) => {
    if (mdSortKey === key) {
      setMdSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setMdSortKey(key);
      setMdSortDir(typeof marketData[0]?.[key as keyof MarketData] === 'string' ? 'asc' : 'desc');
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

  const handleFile = (f: File | undefined) => {
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) {
      setFile(f);
      setError('');
    } else if (f) {
      setError('Please select a CSV file.');
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const result = await previewTradeSummary(file);
      setPreview(result);
      setStep('preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Preview failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !tradeDate) return;
    setConfirming(true);
    setError('');
    try {
      const result = await uploadTradeSummary(file, tradeDate);
      setUploadCount(result.recordsUpdated || 0);
      setStep('done');
      const refreshed = await getMarketData();
      setMarketData(refreshed);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Upload failed.');
    } finally {
      setConfirming(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setTradeDate('');
    setPreview([]);
    setError('');
    setStep('select');
    setUploadCount(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  return (
    <div>
      <h1>Upload Trade Summary</h1>

      {step === 'select' && (
        <>
          <div
            className={`upload-area${dragOver ? ' drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="upload-icon">&#128202;</div>
            <p>Drag and drop a CSV file here, or click to select</p>
            {file && <div className="file-name">{file.name}</div>}
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>
          <div className="upload-actions">
            <button className="btn-upload" onClick={handlePreview} disabled={!file || loading}>
              {loading ? 'Parsing...' : 'Preview'}
            </button>
          </div>
        </>
      )}

      {step === 'preview' && (
        <>
          <div className="success-message" style={{ background: '#bee3f8', color: '#2a4365' }}>
            Found {preview.length} record{preview.length !== 1 ? 's' : ''} in CSV. Review and confirm below.
          </div>

          {preview.length > 0 && (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => previewSort.handleSort('companyCode')}>Symbol{previewSort.sortIcon('companyCode')}</th>
                    <th className="sort-header" onClick={() => previewSort.handleSort('companyName')}>Company{previewSort.sortIcon('companyName')}</th>
                    <th className="sort-header text-right" onClick={() => previewSort.handleSort('lastTrade')}>Last Trade (LKR){previewSort.sortIcon('lastTrade')}</th>
                    <th className="sort-header text-right" onClick={() => previewSort.handleSort('change')}>Change{previewSort.sortIcon('change')}</th>
                    <th className="sort-header text-right" onClick={() => previewSort.handleSort('changePercent')}>Change%{previewSort.sortIcon('changePercent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewSort.sorted.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CompanyAvatar code={p.companyCode} size={24} />
                          <span className="company-code">{p.companyCode}</span>
                        </div>
                      </td>
                      <td>{p.companyName}</td>
                      <td className="text-right mono">{p.lastTrade.toFixed(2)}</td>
                      <td className={`text-right mono ${gainClass(p.change)}`}>
                        {gainSign(p.change)}{p.change.toFixed(2)}
                      </td>
                      <td className="text-right mono">
                        <span className={`gain-pill ${p.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                          {gainSign(p.changePercent)}{p.changePercent.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <label>
              Trade Date
              <input
                type="date"
                value={tradeDate}
                onChange={e => setTradeDate(e.target.value)}
                required
                style={{ marginLeft: '0.5rem', marginRight: '1rem' }}
              />
            </label>
            <button
              className="btn-upload"
              onClick={handleConfirm}
              disabled={confirming || !tradeDate || preview.length === 0}
            >
              {confirming ? 'Saving...' : 'Confirm & Save'}
            </button>
            <button className="btn-reset" onClick={handleReset}>Cancel</button>
          </div>
        </>
      )}

      {error && <div className="error-message">{error}</div>}

      {step === 'done' && (
        <>
          <div className="success-message">
            Successfully updated {uploadCount} market data record{uploadCount !== 1 ? 's' : ''}.
          </div>
          <div className="upload-actions">
            <button className="btn-reset" onClick={handleReset}>Upload Another</button>
          </div>
        </>
      )}

      {marketData.length > 0 && (() => {
        const byDate = marketData.reduce<Record<string, MarketData[]>>((acc, md) => {
          const d = md.tradeDate || 'Unknown';
          (acc[d] = acc[d] || []).push(md);
          return acc;
        }, {});
        const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
        const toggleDate = (d: string) => {
          setExpandedDates(prev => {
            const next = new Set(prev);
            next.has(d) ? next.delete(d) : next.add(d);
            return next;
          });
        };
        return (
          <>
            <h2>Market Data</h2>
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => handleMdSort('companyCode')}>Symbol{mdSortIcon('companyCode')}</th>
                    <th className="sort-header" onClick={() => handleMdSort('companyName')}>Company{mdSortIcon('companyName')}</th>
                    <th className="sort-header text-right" onClick={() => handleMdSort('lastTrade')}>Last Trade{mdSortIcon('lastTrade')}</th>
                    <th className="sort-header text-right" onClick={() => handleMdSort('change')}>Change{mdSortIcon('change')}</th>
                    <th className="sort-header text-right" onClick={() => handleMdSort('changePercent')}>Change%{mdSortIcon('changePercent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDates.map(date => {
                    const items = sortMdItems(byDate[date]);
                    const isExpanded = expandedDates.has(date);
                    return (
                      <>{/* Fragment for adjacent rows */}
                        <tr
                          key={date}
                          onClick={() => toggleDate(date)}
                          style={{ cursor: 'pointer', background: 'var(--bg-thead)' }}
                        >
                          <td colSpan={5} style={{ fontWeight: 700 }}>
                            <span style={{ fontSize: '0.7rem', marginRight: '0.5rem' }}>{isExpanded ? '▼' : '▶'}</span>
                            {date} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({items.length} companies)</span>
                          </td>
                        </tr>
                        {isExpanded && items.map(md => (
                          <tr key={md.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1.5rem' }}>
                                <CompanyAvatar code={md.companyCode} size={24} />
                                <span className="company-code">{md.companyCode}</span>
                              </div>
                            </td>
                            <td>{md.companyName}</td>
                            <td className="text-right mono">{md.lastTrade.toFixed(2)}</td>
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
      })()}
    </div>
  );
}
