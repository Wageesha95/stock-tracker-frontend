import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import MarketDataView from '../components/MarketDataView';
import CompanyPriceMovement from '../components/CompanyPriceMovement';

export default function MarketData() {
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || '';
  const [tab, setTab] = useState<'byDate' | 'byCompany'>(
    searchParams.get('tab') === 'byCompany' || initialCode ? 'byCompany' : 'byDate'
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Market Data</h1>
        <div className="segmented-control">
          <button className={tab === 'byDate' ? 'active' : ''} onClick={() => setTab('byDate')}>By Date</button>
          <button className={tab === 'byCompany' ? 'active' : ''} onClick={() => setTab('byCompany')}>By Company</button>
        </div>
      </div>
      {tab === 'byDate' && <MarketDataView />}
      {tab === 'byCompany' && <CompanyPriceMovement initialCode={initialCode} />}
    </div>
  );
}
