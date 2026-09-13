import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTransactions, getCompanies, getMarketData, getUserSettings, getBrokers, createTransaction, deleteTransaction, BrokerData } from '../api';
import { Transaction, Company, MarketData } from '../types';
import { defaultBrokerId, filterTxByBroker } from '../utils/brokers';
import { SELL_COMMISSION_PCT } from '../constants';
import { useAuth } from '../context/AuthContext';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';
import { compareTxDateBuysFirst, txDateTieBreaker } from '../utils/transactionSort';
import { isAcquisition, shareDelta, txTypeLabel, txTypePillClass } from '../utils/transactionTypes';

export default function Transactions() {
  const navigate = useNavigate();
  const { isReadMode } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [marketMap, setMarketMap] = useState<Record<string, MarketData>>({});
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [selectedBrokerIds, setSelectedBrokerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [count, setCount] = useState('');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState(SELL_COMMISSION_PCT);
  const [brokerId, setBrokerId] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'group' | 'date'>('list');

  const brokerName = (id: string | null | undefined) => id ? (brokers.find(b => b.id === id)?.name ?? '—') : '—';

  const loadData = () => {
    Promise.all([getTransactions(), getCompanies(), getMarketData(), getUserSettings(), getBrokers().catch(() => [] as BrokerData[])])
      .then(([txns, comps, md, settings, brks]) => {
        setTransactions(filterTxByBroker(txns, settings.selectedDataBrokerIds || []));
        setCompanies(comps);
        setBrokers(brks);
        const sel = settings.selectedBrokerIds || [];
        setSelectedBrokerIds(sel);
        setBrokerId(prev => prev || defaultBrokerId(brks, sel));
        const map: Record<string, MarketData> = {};
        md.forEach(m => {
          if (!map[m.companyCode] || m.tradeDate > map[m.companyCode].tradeDate) {
            map[m.companyCode] = m;
          }
        });
        setMarketMap(map);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTransaction({
        companyCode,
        date,
        type,
        count: Number(count),
        price: Number(price),
        commission: Number(commission),
        brokerId: brokerId || null,
      });
      setDate('');
      setCount('');
      setPrice('');
      setCommission('0');
      setBrokerId(defaultBrokerId(brokers, selectedBrokerIds));
      loadData();
    } catch (err) {
      console.error('Failed to create transaction', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    try {
      await deleteTransaction(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete transaction', err);
    }
  };

  const totalCost = (Number(count) || 0) * (Number(price) || 0) + (Number(commission) || 0);
  // Brokers the user can pick from: their selected brokers when set, else all.
  const availableBrokers = selectedBrokerIds.length > 0
    ? brokers.filter(b => selectedBrokerIds.includes(b.id))
    : brokers;
  // A broker is required once the user has any, so trades stay attributable.
  const canAdd = companyCode !== '' && date !== '' && count !== '' && price !== ''
    && (availableBrokers.length === 0 || brokerId !== '');

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'companyCode' | 'type' | 'count' | 'price' | 'commission' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'companyCode' || key === 'type' ? 'asc' : 'desc'); }
  };
  const si = (key: typeof sortKey) => sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';

  const sorted = [...transactions]
    .filter(t =>
      search === '' ||
      t.companyCode.toLowerCase().includes(search.toLowerCase()) ||
      t.type.toLowerCase().includes(search.toLowerCase()) ||
      t.date.includes(search)
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortKey === 'companyCode') cmp = a.companyCode.localeCompare(b.companyCode);
      else if (sortKey === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortKey === 'count') cmp = a.count - b.count;
      else if (sortKey === 'price') cmp = a.price - b.price;
      else if (sortKey === 'commission') cmp = a.commission - b.commission;
      else if (sortKey === 'total') cmp = (a.count * a.price + a.commission) - (b.count * b.price + b.commission);
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      const tb = txDateTieBreaker(a, b, sortKey);
      return sortDir === 'asc' ? tb : -tb;
    });

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Transactions ({sorted.length})</h1>

      {!isReadMode && (
      <div className="form-card">
        <h2>Add Transaction</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Company
              <CompanySearchSelect companies={companies} value={companyCode} onChange={setCompanyCode} />
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
              Type
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="type"
                    value="BUY"
                    checked={type === 'BUY'}
                    onChange={() => setType('BUY')}
                  />
                  BUY
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="type"
                    value="SELL"
                    checked={type === 'SELL'}
                    onChange={() => setType('SELL')}
                  />
                  SELL
                </label>
              </div>
            </label>
            <label>
              Count
              <input
                type="number"
                min="1"
                value={count}
                onChange={e => setCount(e.target.value)}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Price per Share
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                required
              />
            </label>
            <label>
              Commission
              <input
                type="number"
                step="0.01"
                min="0"
                value={commission}
                onChange={e => setCommission(e.target.value)}
              />
            </label>
            {availableBrokers.length > 0 && (
              <label>
                Broker
                <select value={brokerId} onChange={e => setBrokerId(e.target.value)} required>
                  <option value="">Select broker...</option>
                  {availableBrokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="form-row">
            <span className="total-cost">Total Cost: {totalCost.toFixed(2)}</span>
            <button type="submit" disabled={!canAdd}>Add Transaction</button>
          </div>
        </form>
      </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div className="segmented-control">
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            List View
          </button>
          <button
            className={viewMode === 'group' ? 'active' : ''}
            onClick={() => setViewMode('group')}
          >
            By Company
          </button>
          <button
            className={viewMode === 'date' ? 'active' : ''}
            onClick={() => setViewMode('date')}
          >
            By Date
          </button>
        </div>
        {transactions.length >= 5 && (
          <input
            className="search-bar"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
          />
        )}
      </div>

      {sorted.length === 0 ? (
        <p>No transactions yet.</p>
      ) : viewMode === 'list' ? (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleSort('date')}>Date{si('date')}</th>
                <th className="sort-header" onClick={() => handleSort('companyCode')}>Company{si('companyCode')}</th>
                <th className="sort-header" onClick={() => handleSort('type')}>Type{si('type')}</th>
                <th>Broker</th>
                <th className="sort-header text-right" onClick={() => handleSort('count')}>Count{si('count')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('price')}>Price{si('price')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('commission')}>Commission{si('commission')}</th>
                <th className="sort-header text-right" onClick={() => handleSort('total')}>Total{si('total')}</th>
                {!isReadMode && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${t.companyCode}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={t.companyCode} size={26} />
                      {t.companyCode}
                    </div>
                  </td>
                  <td>
                    <span className={`gain-pill ${txTypePillClass(t.type)}`}>
                      {txTypeLabel(t.type)}
                    </span>
                  </td>
                  <td>{brokerName(t.brokerId)}</td>
                  <td className="text-right mono">{t.count}</td>
                  <td className="text-right mono">{t.price.toFixed(2)}</td>
                  <td className="text-right mono">{t.commission.toFixed(2)}</td>
                  <td className="text-right mono">{(t.count * t.price + t.commission).toFixed(2)}</td>
                  {!isReadMode && (
                  <td>
                    <ActionMenu actions={[
                      { label: 'Delete', onClick: () => handleDelete(t.id), danger: true },
                    ]} />
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'group' ? (
        (() => {
          const grouped = sorted.reduce<Record<string, typeof sorted>>((acc, t) => {
            (acc[t.companyCode] = acc[t.companyCode] || []).push(t);
            return acc;
          }, {});
          return Object.entries(grouped).map(([code, txns]) => {
            // FIFO avg price calculation
            const chronological = [...txns].sort(compareTxDateBuysFirst);
            let fifoShares = 0;
            let fifoCost = 0;
            for (const t of chronological) {
              if (isAcquisition(t.type)) {
                fifoShares += t.count;
                fifoCost += t.count * t.price + t.commission;
              } else if (t.type === 'TRANSFER_OUT') {
                // Not a disposal: removes exactly the cost its own price represents,
                // mirroring what the matching TRANSFER_IN adds at the other broker.
                fifoCost -= t.count * t.price;
                fifoShares -= t.count;
              } else if (t.type === 'SELL') {
                const avgAtSell = fifoShares > 0 ? fifoCost / fifoShares : 0;
                fifoCost -= avgAtSell * t.count;
                fifoShares -= t.count;
              } else {
                throw new Error(`Unknown transaction type: ${t.type}`);
              }
            }
            const avgPrice = fifoShares > 0 ? fifoCost / fifoShares : 0;
            const lastTrade = marketMap[code]?.lastTrade || 0;
            const comp = companies.find(x => x.code === code);
            return (
            <div key={code} className="group-card">
              <div className="group-header">
                <div className="group-header-left" style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${code}`)}>
                  <CompanyAvatar code={code} size={32} />
                  <div>
                    <div className="group-code">{code}</div>
                    {comp && comp.name !== code && <div className="group-name">{comp.name}</div>}
                  </div>
                </div>
                <div className="group-header-stats">
                  <div className="group-stat">
                    <div className="group-stat-label">Avg. Price</div>
                    <div className="group-stat-value">{avgPrice.toFixed(2)}</div>
                  </div>
                  {lastTrade > 0 && (
                    <div className="group-stat">
                      <div className="group-stat-label">Last Trade</div>
                      <div className="group-stat-value">{lastTrade.toFixed(2)}</div>
                    </div>
                  )}
                  <div className="group-stat">
                    <div className="group-stat-label">Trades</div>
                    <div className="group-stat-value">{txns.length}</div>
                  </div>
                </div>
              </div>
              <div className="portfolio-table-wrap">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="text-right">Count</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Commission</th>
                      <th className="text-right">Total</th>
                      {!isReadMode && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map(t => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>
                          <span className={`gain-pill ${txTypePillClass(t.type)}`}>
                            {txTypeLabel(t.type)}
                          </span>
                        </td>
                        <td className="text-right mono">{t.count}</td>
                        <td className="text-right mono">{t.price.toFixed(2)}</td>
                        <td className="text-right mono">{t.commission.toFixed(2)}</td>
                        <td className="text-right mono">{(t.count * t.price + t.commission).toFixed(2)}</td>
                        {!isReadMode && (
                        <td>
                          <ActionMenu actions={[
                            { label: 'Delete', onClick: () => handleDelete(t.id), danger: true },
                          ]} />
                        </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="portfolio-total">
                      <td colSpan={2}>Total ({txns.length})</td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + shareDelta(t), 0)}</td>
                      <td></td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + t.commission, 0).toFixed(2)}</td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + (t.count * t.price + t.commission), 0).toFixed(2)}</td>
                      {!isReadMode && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );});
        })()
      ) : null}
      {viewMode === 'date' && sorted.length > 0 && (
        (() => {
          const byDate = sorted.reduce<Record<string, typeof sorted>>((acc, t) => {
            (acc[t.date] = acc[t.date] || []).push(t);
            return acc;
          }, {});
          const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
          return sortedDates.map(date => {
            const txns = byDate[date];
            return (
            <div key={date} className="group-card">
              <div className="group-header">
                <div className="group-header-left">
                  <div>
                    <div className="group-code">{date}</div>
                    <div className="group-name">{txns.length} transaction{txns.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className="group-header-stats">
                  <div className="group-stat">
                    <div className="group-stat-label">Total</div>
                    <div className="group-stat-value">{txns.reduce((s, t) => s + (t.count * t.price + t.commission), 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>
              <div className="portfolio-table-wrap">
                <table className="portfolio-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Type</th>
                      <th className="text-right">Count</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Commission</th>
                      <th className="text-right">Total</th>
                      {!isReadMode && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map(t => (
                      <tr key={t.id}>
                        <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${t.companyCode}`)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CompanyAvatar code={t.companyCode} size={26} />
                            {t.companyCode}
                          </div>
                        </td>
                        <td>
                          <span className={`gain-pill ${txTypePillClass(t.type)}`}>
                            {txTypeLabel(t.type)}
                          </span>
                        </td>
                        <td className="text-right mono">{t.count}</td>
                        <td className="text-right mono">{t.price.toFixed(2)}</td>
                        <td className="text-right mono">{t.commission.toFixed(2)}</td>
                        <td className="text-right mono">{(t.count * t.price + t.commission).toFixed(2)}</td>
                        {!isReadMode && (
                        <td>
                          <ActionMenu actions={[
                            { label: 'Delete', onClick: () => handleDelete(t.id), danger: true },
                          ]} />
                        </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="portfolio-total">
                      <td colSpan={2}>Total ({txns.length})</td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + shareDelta(t), 0)}</td>
                      <td></td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + t.commission, 0).toFixed(2)}</td>
                      <td className="text-right mono">{txns.reduce((s, t) => s + (t.count * t.price + t.commission), 0).toFixed(2)}</td>
                      {!isReadMode && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            );
          });
        })()
      )}
    </div>
  );
}
