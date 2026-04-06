import { useState, useRef, useEffect, DragEvent } from 'react';
import { previewPdf, uploadPdf, getPdfUploads, deletePdfUpload, getBrokers, getUserSettings, BrokerData } from '../api';
import { Transaction } from '../types';
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
      const available = selected.length > 0 ? b.filter(x => selected.includes(x.id)) : b;
      if (available.length === 1) {
        setBrokerId(available[0].id);
      }
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

  const getDefaultBrokerId = () => {
    const available = selectedBrokerIds.length > 0
      ? brokers.filter(x => selectedBrokerIds.includes(x.id))
      : brokers;
    return available.length === 1 ? available[0].id : '';
  };

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
      <h1>Upload PDF</h1>

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
    </div>
  );
}
