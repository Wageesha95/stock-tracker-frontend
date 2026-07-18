import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRights, createRights, updateRights, deleteRights, getCompanies, getTransactions, getBrokers, getUserSettings, setTransactionsDisabledByCompany, RightsData, BrokerData } from '../api';
import { Company, Transaction } from '../types';
import { defaultBrokerId } from '../utils/brokers';
import { useAuth } from '../context/AuthContext';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';

export default function RightsPage({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const { isReadMode } = useAuth();
  const [rights, setRights] = useState<RightsData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [date, setDate] = useState('');
  const [count, setCount] = useState('');
  const [price, setPrice] = useState('');
  const [brokerId, setBrokerId] = useState('');
  // Per-share cost already paid to buy the right (from a ".R" holding); 0 for a
  // plain manual rights entry. The recorded price/share = purchasedCost + premium.
  const [purchasedCost, setPurchasedCost] = useState(0);
  // The ".R" code being converted, so its transactions are disabled after adding.
  const [convertCode, setConvertCode] = useState('');
  const [search, setSearch] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  // Edit modal
  const [editItem, setEditItem] = useState<RightsData | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editCount, setEditCount] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editBrokerId, setEditBrokerId] = useState('');

  const brokerName = (id: string | null | undefined) => id ? (brokers.find(b => b.id === id)?.name ?? '—') : '—';

  const loadData = () => {
    Promise.all([getRights(), getCompanies(), getTransactions(), getBrokers().catch(() => [] as BrokerData[]), getUserSettings().catch(() => ({ selectedBrokerIds: [] as string[] }))])
      .then(([r, comps, txns, brks, settings]) => {
        setRights(r);
        setCompanies(comps);
        setTransactions(txns);
        setBrokers(brks);
        const sel = settings.selectedBrokerIds || [];
        setSelectedBrokerIds(sel);
        setBrokerId(prev => prev || defaultBrokerId(brks, sel));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Purchased rights: holdings recorded under a ".R" code. Computed from
  // transactions so disabled (converted) ones are still listed and can be re-enabled.
  const purchasedRights = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    transactions.filter(t => t.companyCode.includes('.R')).forEach(t => {
      (groups[t.companyCode] = groups[t.companyCode] || []).push(t);
    });
    return Object.entries(groups).map(([code, txns]) => {
      let shares = 0, cost = 0, bought = 0;
      txns.forEach(t => {
        const c = t.count || 0;
        if (t.type === 'SELL') { shares -= c; }
        else { shares += c; cost += c * t.price + (t.commission || 0); bought += c; }
      });
      const disabled = txns.every(t => t.disabled === true);
      const converted = disabled && txns.every(t => t.converted === true);
      const holdingBrokerId = txns.find(t => t.brokerId)?.brokerId ?? null;
      return { companyCode: code, shares, avg: bought > 0 ? cost / bought : 0, disabled, converted, brokerId: holdingBrokerId };
    })
      .filter(r => r.shares > 0)
      .sort((a, b) => a.companyCode.localeCompare(b.companyCode));
  }, [transactions]);

  // Active holdings show in "Purchased Rights". Converted holdings are now held as
  // ".N" shares and drop out entirely. Wasted (disabled, not converted) holdings move
  // to the "Wasted / Lapsed Rights" table (their cost is booked as a realized loss).
  const activePurchased = purchasedRights.filter(r => !r.disabled);
  const wastedPurchased = purchasedRights.filter(r => r.disabled && !r.converted);

  // Load a purchased right into the Add Rights card: base company (.R -> .N),
  // shares held, and the average price paid for the rights.
  const fillFromPurchased = (code: string, shares: number, avg: number, holdingBrokerId: string | null) => {
    setCompanyCode(code.replace('.R', '.N'));
    setCount(String(shares));
    setPurchasedCost(avg);
    setConvertCode(code);
    setPrice(''); // user enters the rights-issue price (premium) to add on top
    setDate(new Date().toLocaleDateString('en-CA'));
    setBrokerId(holdingBrokerId || defaultBrokerId(brokers, selectedBrokerIds));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Enable/disable a purchased right's transactions directly from the panel.
  const toggleRightDisabled = async (code: string, value: boolean) => {
    try {
      await setTransactionsDisabledByCompany(code, value);
      loadData();
    } catch (err) {
      console.error('Failed to update rights record', err);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRights({
        companyCode,
        date,
        count: Number(count),
        // Total per-share cost = what was paid for the right + the rights-issue premium.
        price: purchasedCost + (Number(price) || 0),
        brokerId: brokerId || null,
      });
      // Converting a purchased right: retire its ".R" holding as CONVERTED (now held as
      // ".N" shares), so it is excluded from calculations but not booked as a loss.
      if (convertCode) {
        await setTransactionsDisabledByCompany(convertCode, true, true);
      }
      setCompanyCode('');
      setDate('');
      setCount('');
      setPrice('');
      setPurchasedCost(0);
      setConvertCode('');
      setBrokerId(defaultBrokerId(brokers, selectedBrokerIds));
      loadData();
    } catch (err) {
      console.error('Failed to create rights', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this rights issue? The linked transaction will also be deleted.')) return;
    await deleteRights(id);
    loadData();
  };

  const openEdit = (r: RightsData) => {
    setEditItem(r);
    setEditDate(r.date);
    setEditCount(String(r.count));
    setEditPrice(String(r.price));
    setEditBrokerId(r.brokerId || '');
  };

  const handleEditSubmit = async () => {
    if (!editItem) return;
    await updateRights(editItem.id, {
      date: editDate,
      count: Number(editCount),
      price: Number(editPrice),
      brokerId: editBrokerId || null,
    });
    setEditItem(null);
    loadData();
  };

  const perShareCost = purchasedCost + (Number(price) || 0);
  const totalCost = (Number(count) || 0) * perShareCost;
  const canAdd = companyCode !== '' && date !== '' && count !== '' && price !== '' && brokerId !== '';
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [rSortKey, setRSortKey] = useState<'date' | 'companyCode' | 'count' | 'price' | 'total'>('date');
  const [rSortDir, setRSortDir] = useState<'asc' | 'desc'>('desc');
  const handleRSort = (key: typeof rSortKey) => {
    if (rSortKey === key) setRSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setRSortKey(key); setRSortDir(key === 'companyCode' ? 'asc' : 'desc'); }
  };
  const rsi = (key: typeof rSortKey) => rSortKey === key ? (rSortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';

  const sorted = [...rights]
    .filter(r =>
      search === '' ||
      r.companyCode.toLowerCase().includes(search.toLowerCase()) ||
      r.date.includes(search)
    )
    .sort((a, b) => {
      let cmp = 0;
      if (rSortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (rSortKey === 'companyCode') cmp = a.companyCode.localeCompare(b.companyCode);
      else if (rSortKey === 'count') cmp = a.count - b.count;
      else if (rSortKey === 'price') cmp = a.price - b.price;
      else if (rSortKey === 'total') cmp = (a.count * a.price) - (b.count * b.price);
      return rSortDir === 'asc' ? cmp : -cmp;
    });

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {!embedded && <h1>Rights Issues ({sorted.length})</h1>}

      {activePurchased.length > 0 && (
        <div className="form-card">
          <h2>Purchased Rights ({activePurchased.length})</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Holdings recorded under a ".R" code. Convert them to a rights issue for the underlying ".N" shares — the ".R" holding is then disabled and drops out of calculations.
          </p>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Rights Code</th>
                  <th className="hide-sm">For</th>
                  <th>Broker</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Avg Price</th>
                  <th className="text-right">Value</th>
                  {!isReadMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {activePurchased.map(r => (
                  <tr key={r.companyCode}>
                    <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${r.companyCode}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CompanyAvatar code={r.companyCode} size={26} />
                        {r.companyCode}
                      </div>
                    </td>
                    <td className="mono hide-sm" style={{ color: 'var(--text-muted)' }}>{r.companyCode.replace('.R', '.N')}</td>
                    <td style={{ fontSize: '0.85rem' }}>{brokerName(r.brokerId)}</td>
                    <td className="text-right mono">{r.shares}</td>
                    <td className="text-right mono">{fmt(r.avg)}</td>
                    <td className="text-right mono">{fmt(r.shares * r.avg)}</td>
                    {!isReadMode && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => fillFromPurchased(r.companyCode, r.shares, r.avg, r.brokerId)}
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: '#3182ce', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                          >
                            + Add
                          </button>
                          <button
                            onClick={() => toggleRightDisabled(r.companyCode, true)}
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderRadius: '6px', border: '1.5px solid var(--border-input)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Disable
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isReadMode && (
      <div className="form-card" ref={formRef}>
        <h2>Add Rights Issue</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Company
              <CompanySearchSelect companies={companies} value={companyCode} onChange={c => { setCompanyCode(c); setPurchasedCost(0); setConvertCode(''); }} />
            </label>
          </div>
          <div className="form-row">
            <label>
              Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Shares
              <input type="number" min="1" value={count} onChange={e => setCount(e.target.value)} required />
            </label>
            <label>
              {purchasedCost > 0 ? 'Rights Issue Price (premium)' : 'Price per Share'}
              <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} required />
            </label>
            <label>
              Broker
              <select value={brokerId} onChange={e => setBrokerId(e.target.value)} required>
                <option value="">Select broker...</option>
                {(selectedBrokerIds.length > 0 ? brokers.filter(b => selectedBrokerIds.includes(b.id)) : brokers).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          </div>
          {purchasedCost > 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Purchased cost/share {fmt(purchasedCost)} + premium {fmt(Number(price) || 0)} = <strong style={{ color: 'var(--text-primary)' }}>{fmt(perShareCost)}</strong> per share
            </div>
          )}
          <div className="form-row">
            <span className="total-cost">Total Cost: {totalCost.toFixed(2)}</span>
            <button type="submit" disabled={!canAdd}>Add Rights</button>
          </div>
        </form>
      </div>
      )}

      {rights.length >= 3 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <input
            className="search-bar"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
          />
        </div>
      )}

      {sorted.length === 0 ? (
        <p>No rights issues yet.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleRSort('date')}>Date{rsi('date')}</th>
                <th className="sort-header" onClick={() => handleRSort('companyCode')}>Company{rsi('companyCode')}</th>
                <th>Broker</th>
                <th className="sort-header text-right" onClick={() => handleRSort('count')}>Shares{rsi('count')}</th>
                <th className="sort-header text-right" onClick={() => handleRSort('price')}>Price{rsi('price')}</th>
                <th className="sort-header text-right" onClick={() => handleRSort('total')}>Total{rsi('total')}</th>
                {!isReadMode && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${r.companyCode}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={r.companyCode} size={26} />
                      {r.companyCode}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{brokerName(r.brokerId)}</td>
                  <td className="text-right mono">{r.count}</td>
                  <td className="text-right mono">{fmt(r.price)}</td>
                  <td className="text-right mono">{fmt(r.count * r.price)}</td>
                  {!isReadMode && (
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(r) },
                      { label: 'Delete', onClick: () => handleDelete(r.id), danger: true },
                    ]} />
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {!isReadMode && editItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEditItem(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '420px', margin: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem' }}>Edit Rights Issue</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <CompanyAvatar code={editItem.companyCode} size={32} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{editItem.companyCode}</span>
            </div>
            <div className="form-row">
              <label>
                Date
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Shares
                <input type="number" min="1" value={editCount} onChange={e => setEditCount(e.target.value)} required />
              </label>
              <label>
                Price per Share
                <input type="number" step="0.01" min="0" value={editPrice} onChange={e => setEditPrice(e.target.value)} required />
              </label>
            </div>
            <div className="form-row">
              <label>
                Broker
                <select value={editBrokerId} onChange={e => setEditBrokerId(e.target.value)} required>
                  <option value="">Select broker...</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Total: LKR {((Number(editCount) || 0) * (Number(editPrice) || 0)).toFixed(2)}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditItem(null)} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: '1.5px solid var(--border-input)',
                background: 'transparent', cursor: 'pointer', fontSize: '0.85rem',
              }}>Cancel</button>
              <button onClick={handleEditSubmit} style={{
                padding: '0.5rem 1rem', borderRadius: '6px', border: 'none',
                background: '#3182ce', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {wastedPurchased.length > 0 && (
        <div className="form-card" style={{ marginTop: '1.5rem' }}>
          <h2>Wasted / Lapsed Rights ({wastedPurchased.length})</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Rights you purchased but did not convert to shares. The money paid is booked as a realized loss. Re-enable one to bring it back as an active holding.
          </p>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>Rights Code</th>
                  <th className="hide-sm">For</th>
                  <th>Broker</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Avg Price</th>
                  <th className="text-right">Value</th>
                  {!isReadMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {wastedPurchased.map(r => (
                  <tr key={r.companyCode} style={{ opacity: 0.65 }}>
                    <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${r.companyCode}`)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <CompanyAvatar code={r.companyCode} size={26} />
                        {r.companyCode}
                        <span className="gain-pill" style={{ fontSize: '0.6rem', background: '#fed7d7', color: '#9b2c2c' }}>LAPSED</span>
                      </div>
                    </td>
                    <td className="mono hide-sm" style={{ color: 'var(--text-muted)' }}>{r.companyCode.replace('.R', '.N')}</td>
                    <td style={{ fontSize: '0.85rem' }}>{brokerName(r.brokerId)}</td>
                    <td className="text-right mono">{r.shares}</td>
                    <td className="text-right mono">{fmt(r.avg)}</td>
                    <td className="text-right mono">{fmt(r.shares * r.avg)}</td>
                    {!isReadMode && (
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => toggleRightDisabled(r.companyCode, false)}
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderRadius: '6px', border: '1.5px solid var(--border-input)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Enable
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
