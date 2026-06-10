import { useState } from 'react';
import MarketDataView from '../components/MarketDataView';
import CompanyPriceMovement from '../components/CompanyPriceMovement';

export default function MarketData() {
  const [tab, setTab] = useState<'byDate' | 'byCompany'>('byDate');

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
      {tab === 'byCompany' && <CompanyPriceMovement />}
    </div>
  );
}
