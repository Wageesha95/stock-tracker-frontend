import { useState, useRef, DragEvent } from 'react';
import { previewTradeSummary, uploadTradeSummary, deleteMarketDataRange, invalidate } from '../api';
import CompanyAvatar from '../components/CompanyAvatar';
import MarketDataView from '../components/MarketDataView';
import { useTableSort } from '../hooks/useTableSort';

interface PreviewItem {
  companyCode: string;
  companyName: string;
  lastTrade: number;
  change: number;
  changePercent: number;
}

export default function TradeSummaryUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [tradeDate, setTradeDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select');
  const [uploadCount, setUploadCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewSort = useTableSort(preview, 'companyCode', 'asc');

  const reloadMarketData = () => {
    invalidate('market');
    setReloadKey(k => k + 1);
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
      reloadMarketData();
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

      <DeleteMarketDataSection onDeleted={reloadMarketData} />

      <MarketDataView key={reloadKey} />
    </div>
  );
}

function DeleteMarketDataSection({ onDeleted }: { onDeleted: () => void }) {
  const [delFrom, setDelFrom] = useState('');
  const [delTo, setDelTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState('');

  const rangeLabel = () => {
    if (delFrom && delTo) return `${delFrom} to ${delTo}`;
    if (delFrom) return `from ${delFrom} onwards`;
    if (delTo) return `up to ${delTo}`;
    return '';
  };

  const handleDelete = async () => {
    setDeleting(true);
    setResult('');
    try {
      const res = await deleteMarketDataRange(delFrom || undefined, delTo || undefined);
      setResult(`Deleted ${res.deletedCount} records (${res.range}).`);
      setConfirmOpen(false);
      setDelFrom('');
      setDelTo('');
      onDeleted();
    } catch (err: any) {
      setResult(err?.response?.data?.error || err?.message || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="form-card" style={{ maxWidth: '500px', marginTop: '1.5rem' }}>
      <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Delete Market Data</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" value={delFrom} onChange={e => setDelFrom(e.target.value)}
          placeholder="From"
          style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
        <span style={{ color: 'var(--text-muted)' }}>to</span>
        <input type="date" value={delTo} onChange={e => setDelTo(e.target.value)}
          placeholder="To"
          style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
      </div>
      <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Leave "from" empty to delete up to a date. Leave "to" empty to delete from a date onwards.
      </div>
      <div className="upload-actions" style={{ marginTop: '0.75rem' }}>
        {!confirmOpen ? (
          <button
            className="btn-reset"
            style={{ background: 'var(--bg-error)', color: 'var(--text-error)' }}
            onClick={() => setConfirmOpen(true)}
            disabled={!delFrom && !delTo}
          >
            Delete
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-error)' }}>
              Delete all records {rangeLabel()}?
            </span>
            <button
              className="btn-reset"
              style={{ background: 'var(--bg-error)', color: 'var(--text-error)' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Confirm Delete'}
            </button>
            <button className="btn-reset" onClick={() => setConfirmOpen(false)}>Cancel</button>
          </div>
        )}
      </div>
      {result && <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{result}</div>}
    </div>
  );
}
