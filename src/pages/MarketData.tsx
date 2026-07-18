import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MarketDataView from '../components/MarketDataView';
import CompanyPriceMovement from '../components/CompanyPriceMovement';
import { useAuth } from '../context/AuthContext';
import { scrapeMarketDataCse } from '../api';

export default function MarketData() {
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const [tab, setTab] = useState<'byDate' | 'byCompany'>(
    searchParams.get('tab') === 'byCompany' || initialCode ? 'byCompany' : 'byDate'
  );

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const runCseFetch = async () => {
    setRunning(true);
    setResult('');
    setError('');
    try {
      const r = await scrapeMarketDataCse();
      setResult(`Fetched ${r.tradeDate}: ${r.succeeded} saved, ${r.failed} failed of ${r.totalCompanies} companies.`);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Fetch failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Market Data</h1>
        <div className="segmented-control">
          <button className={tab === 'byDate' ? 'active' : ''} onClick={() => setTab('byDate')}>By Date</button>
          <button className={tab === 'byCompany' ? 'active' : ''} onClick={() => setTab('byCompany')}>By Company</button>
        </div>
      </div>

      {isAdmin && (
        <div className="form-card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Fetch Today's Prices (CSE)</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Pulls today's last price, high/low and volume for every company straight from the CSE JSON API — no browser, lightweight enough to run anywhere.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={runCseFetch} disabled={running}>
              {running ? 'Fetching…' : 'Fetch Now'}
            </button>
            {result && <span style={{ color: '#2f855a', fontSize: '0.85rem' }}>{result}</span>}
            {error && <span style={{ color: '#c53030', fontSize: '0.85rem' }}>{error}</span>}
          </div>
        </div>
      )}

      {tab === 'byDate' && <MarketDataView />}
      {tab === 'byCompany' && <CompanyPriceMovement initialCode={initialCode} />}
    </div>
  );
}
