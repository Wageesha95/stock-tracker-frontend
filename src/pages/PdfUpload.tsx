import { useState, useRef, useEffect, DragEvent } from 'react';
import { previewPdf, uploadPdf, getPdfUploads, deletePdfUpload, updatePdfUpload, getBrokers, getUserSettings, BrokerData } from '../api';
import { Transaction } from '../types';
import { defaultBrokerId } from '../utils/brokers';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import { useTableSort } from '../hooks/useTableSort';

interface PreviewItem {
  companyCode: string;
  companyName: string;
  date: string;
  type: 'BUY' | 'SELL';
  count: number;
  price: number;
  commission: number;
}

interface PdfRecord {
  id: string;
  filename: string;
  tradeDate: string;
  brokerId: string;
  transactionCount: number;
  uploadedAt: string;
}

export default function PdfUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [savedTransactions, setSavedTransactions] = useState<Transaction[]>([]);
  const [uploads, setUploads] = useState<PdfRecord[]>([]);
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select');
  const [dragOver, setDragOver] = useState(false);
  const [tradeDate, setTradeDate] = useState('');
  const [brokerId, setBrokerId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Edit-upload modal (change trade date / broker of an existing upload)
  const [editUpload, setEditUpload] = useState<PdfRecord | null>(null);
  const [editTradeDate, setEditTradeDate] = useState('');
  const [editBrokerId, setEditBrokerId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadUploads = () => {
    getPdfUploads().then(setUploads).catch(() => {});
  };

  const loadBrokers = () => {
    getBrokers().then(setBrokers).catch(() => {});
  };

  useEffect(() => {
    loadUploads();
    Promise.all([getBrokers(), getUserSettings()]).then(([b, s]) => {
      setBrokers(b);
      const selected = s.selectedBrokerIds || [];
      setSelectedBrokerIds(selected);
      // Auto-select if user has a single broker (from settings or system-wide)
      setBrokerId(defaultBrokerId(b, selected));
    }).catch(() => { loadBrokers(); });
  }, []);

  const handleFile = (f: File | undefined) => {
    if (f && f.type === 'application/pdf') {
      setFile(f);
      setError('');
    } else if (f) {
      setError('Please select a PDF file.');
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
      const result = await previewPdf(file);
      setPreview(result.transactions);
      if (result.suggestedDate) {
        setTradeDate(result.suggestedDate);
      }
      setStep('preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Preview failed.');
    } finally {
      setLoading(false);
    }
  };

  const dateMismatch = tradeDate && preview.length > 0 && preview.some(p => p.date !== tradeDate);

  const handleConfirm = async () => {
    if (!file) return;
    if (!tradeDate) {
      setError('Please select a trade date.');
      return;
    }
    if (!brokerId) {
      setError('Please select a broker.');
      return;
    }
    if (dateMismatch) {
      setError('Selected trade date does not match transaction dates in the PDF.');
      return;
    }
    setConfirming(true);
    setError('');
    try {
      const result = await uploadPdf(file, tradeDate, brokerId);
      setSavedTransactions(result);
      setStep('done');
      loadUploads();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Upload failed.');
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteUpload = async (id: string) => {
    if (!confirm('Delete this upload and all its transactions?')) return;
    try {
      await deletePdfUpload(id);
      loadUploads();
    } catch (err) {
      console.error('Failed to delete upload', err);
    }
  };

  const openEditUpload = (u: PdfRecord) => {
    setEditUpload(u);
    setEditTradeDate(u.tradeDate || '');
    setEditBrokerId(u.brokerId || '');
    setEditError('');
  };

  const handleUpdateUpload = async () => {
    if (!editUpload) return;
    if (!editTradeDate || !editBrokerId) {
      setEditError('Trade date and broker are required.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await updatePdfUpload(editUpload.id, editTradeDate, editBrokerId);
      setEditUpload(null);
      loadUploads();
    } catch (err: any) {
      setEditError(err?.response?.data?.error || err?.message || 'Update failed.');
    } finally {
      setEditSaving(false);
    }
  };

  const getDefaultBrokerId = () => defaultBrokerId(brokers, selectedBrokerIds);

  const handleReset = () => {
    setFile(null);
    setPreview([]);
    setSavedTransactions([]);
    setError('');
    setStep('select');
    setTradeDate('');
    setBrokerId(getDefaultBrokerId());
    if (inputRef.current) inputRef.current.value = '';
  };

  const getBrokerName = (id: string) => brokers.find(b => b.id === id)?.name || id;

  const previewSort = useTableSort(preview, 'date');
  const uploadSort = useTableSort(uploads, 'tradeDate');

  return (
    <div>
      <h1>Upload Daily Trade Confirmation</h1>

      {step === 'select' && (
        <>
          <div
            className={`upload-area${dragOver ? ' drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="upload-icon">&#128196;</div>
            <p>Drag and drop a PDF here, or click to select</p>
            {file && <div className="file-name">{file.name}</div>}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
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
            Found {preview.length} transaction{preview.length !== 1 ? 's' : ''} in {file?.name}. Review and confirm below.
          </div>

          <div className="upload-fields">
            <div className="upload-field">
              <label htmlFor="tradeDate">Trade Date</label>
              <input
                id="tradeDate"
                type="date"
                value={tradeDate}
                onChange={e => setTradeDate(e.target.value)}
              />
            </div>
            <div className="upload-field">
              <label htmlFor="broker">Broker</label>
              <select
                id="broker"
                value={brokerId}
                onChange={e => setBrokerId(e.target.value)}
              >
                <option value="">Select broker...</option>
                {(selectedBrokerIds.length > 0
                  ? brokers.filter(b => selectedBrokerIds.includes(b.id))
                  : brokers
                ).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {dateMismatch && (
            <div className="error-message" style={{ background: '#fefcbf', color: '#744210', border: '1px solid #ecc94b' }}>
              Selected trade date ({tradeDate}) does not match transaction dates in the PDF.
            </div>
          )}

          {preview.length > 0 && (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th className="sort-header" onClick={() => previewSort.handleSort('date')}>Date{previewSort.sortIcon('date')}</th>
                    <th className="sort-header" onClick={() => previewSort.handleSort('companyCode')}>Company{previewSort.sortIcon('companyCode')}</th>
                    <th className="sort-header" onClick={() => previewSort.handleSort('type')}>Type{previewSort.sortIcon('type')}</th>
                    <th className="sort-header text-right" onClick={() => previewSort.handleSort('count')}>Count{previewSort.sortIcon('count')}</th>
                    <th className="sort-header text-right" onClick={() => previewSort.handleSort('price')}>Price{previewSort.sortIcon('price')}</th>
                    <th className="sort-header text-right" onClick={() => previewSort.handleSort('commission')}>Commission{previewSort.sortIcon('commission')}</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewSort.sorted.map((p, i) => (
                    <tr key={i}>
                      <td>{p.date}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CompanyAvatar code={p.companyCode} size={26} />
                          <div className="company-cell">
                            <span className="company-code">{p.companyCode}</span>
                            <span className="company-name">{p.companyName}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`gain-pill ${p.type === 'BUY' ? 'gain-pill-buy' : 'gain-pill-sell'}`}>
                          {p.type}
                        </span>
                      </td>
                      <td className="text-right mono">{p.count}</td>
                      <td className="text-right mono">{p.price.toFixed(2)}</td>
                      <td className="text-right mono">{p.commission.toFixed(2)}</td>
                      <td className="text-right mono">{(p.count * p.price + p.commission).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="upload-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-upload" onClick={handleConfirm} disabled={confirming || preview.length === 0 || !tradeDate || !brokerId || !!dateMismatch}>
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
            Successfully saved {savedTransactions.length} transaction{savedTransactions.length !== 1 ? 's' : ''}.
          </div>
          <div className="upload-actions">
            <button className="btn-reset" onClick={handleReset}>Upload Another</button>
          </div>
        </>
      )}

      {uploads.length > 0 && (
        <>
          <h2>Upload History ({uploads.length})</h2>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => uploadSort.handleSort('tradeDate')}>Trade Date{uploadSort.sortIcon('tradeDate')}</th>
                  <th className="sort-header" onClick={() => uploadSort.handleSort('brokerId')}>Broker{uploadSort.sortIcon('brokerId')}</th>
                  <th className="sort-header text-right" onClick={() => uploadSort.handleSort('transactionCount')}>Transactions{uploadSort.sortIcon('transactionCount')}</th>
                  <th className="sort-header" onClick={() => uploadSort.handleSort('uploadedAt')}>Uploaded At{uploadSort.sortIcon('uploadedAt')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {uploadSort.sorted.map(u => (
                  <tr key={u.id}>
                    <td>{u.tradeDate || u.filename}</td>
                    <td>{getBrokerName(u.brokerId)}</td>
                    <td className="text-right mono">{u.transactionCount}</td>
                    <td>{new Date(u.uploadedAt).toLocaleString('en-US', { timeZone: 'Asia/Colombo' })}</td>
                    <td>
                      <ActionMenu actions={[
                        { label: 'Edit', onClick: () => openEditUpload(u) },
                        { label: 'Delete', onClick: () => handleDeleteUpload(u.id), danger: true },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editUpload && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEditUpload(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '420px', margin: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem' }}>Edit Upload</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 1rem' }}>
              Changing the date or broker updates all {editUpload.transactionCount} linked transaction{editUpload.transactionCount !== 1 ? 's' : ''}.
            </p>
            <div className="upload-fields">
              <div className="upload-field">
                <label htmlFor="editTradeDate">Trade Date</label>
                <input
                  id="editTradeDate"
                  type="date"
                  value={editTradeDate}
                  onChange={e => setEditTradeDate(e.target.value)}
                />
              </div>
              <div className="upload-field">
                <label htmlFor="editBroker">Broker</label>
                <select id="editBroker" value={editBrokerId} onChange={e => setEditBrokerId(e.target.value)}>
                  <option value="">Select broker...</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {editError && <div className="error-message" style={{ marginTop: '0.75rem' }}>{editError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setEditUpload(null)} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: '1.5px solid var(--border-input)',
                background: 'transparent', cursor: 'pointer', fontSize: '0.85rem',
              }}>Cancel</button>
              <button onClick={handleUpdateUpload} disabled={editSaving} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                background: '#3182ce', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}>{editSaving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
