import { useState, useRef, useEffect, DragEvent } from 'react';
import { previewPdf, uploadPdf, getPdfUploads, deletePdfUpload } from '../api';
import { Transaction } from '../types';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';

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
  const [error, setError] = useState('');
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadUploads = () => {
    getPdfUploads().then(setUploads).catch(() => {});
  };

  useEffect(() => {
    loadUploads();
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
      setPreview(result);
      setStep('preview');
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Preview failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setConfirming(true);
    setError('');
    try {
      const result = await uploadPdf(file);
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

  const handleReset = () => {
    setFile(null);
    setPreview([]);
    setSavedTransactions([]);
    setError('');
    setStep('select');
    if (inputRef.current) inputRef.current.value = '';
  };

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

          {preview.length > 0 && (
            <div className="portfolio-table-wrap">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Company</th>
                    <th>Type</th>
                    <th className="text-right">Count</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Commission</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
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
            <button className="btn-upload" onClick={handleConfirm} disabled={confirming || preview.length === 0}>
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
          <h2>Upload History</h2>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Trade Date</th>
                  <th className="text-right">Transactions</th>
                  <th>Uploaded At</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {uploads.map(u => (
                  <tr key={u.id}>
                    <td>{u.tradeDate || u.filename}</td>
                    <td className="text-right mono">{u.transactionCount}</td>
                    <td>{new Date(u.uploadedAt).toLocaleString()}</td>
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
