import { useState } from 'react';
import RightsPage from './Rights';
import IpoPage from './Ipos';

export default function RightsAndIpo() {
  const [tab, setTab] = useState<'rights' | 'ipo'>('rights');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Rights & IPO</h1>
        <div className="segmented-control">
          <button className={tab === 'rights' ? 'active' : ''} onClick={() => setTab('rights')}>Rights</button>
          <button className={tab === 'ipo' ? 'active' : ''} onClick={() => setTab('ipo')}>IPO</button>
        </div>
      </div>
      {tab === 'rights' && <RightsPage embedded />}
      {tab === 'ipo' && <IpoPage embedded />}
    </div>
  );
}
