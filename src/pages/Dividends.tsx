import { useEffect, useState } from 'react';
import { getDividends, getCompanies, getTransactions, createDividend, deleteDividend } from '../api';
import { Dividend, Company, Transaction } from '../types';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';

export default function Dividends() {
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [xdDate, setXdDate] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'CASH' | 'SCRIP'>('CASH');
  const [amount, setAmount] = useState('');
  const [shares, setShares] = useState('');
  const [scripShares, setScripShares] = useState('');
  const [taxable, setTaxable] = useState(true);

  const loadData = () => {
    Promise.all([getDividends(), getCompanies(), getTransactions()])
      .then(([divs, comps, txns]) => {
        setDividends(divs);
        setCompanies(comps);
        setTransactions(txns);
        if (comps.length > 0 && !companyCode) {
          setCompanyCode(comps[0].code);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Calculate shares held for a company just before a given date
  const getSharesHeldAtDate = (code: string, beforeDate: string): number => {
    return transactions
      .filter(t => t.companyCode === code && t.date < beforeDate)
      .reduce((total, t) => total + (t.type === 'BUY' ? t.count : -t.count), 0);
  };

  // Auto-suggest shares when XD date or company changes
  const handleXdDateChange = (newXdDate: string) => {
    setXdDate(newXdDate);
    if (newXdDate) {
      setDate(newXdDate);
      if (companyCode) {
        const held = getSharesHeldAtDate(companyCode, newXdDate);
        setShares(held > 0 ? String(held) : '');
      }
    }
  };

  const handleCompanyChange = (newCode: string) => {
    setCompanyCode(newCode);
    if (xdDate) {
      const held = getSharesHeldAtDate(newCode, xdDate);
      setShares(held > 0 ? String(held) : '');
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createDividend({
        companyCode,
        type,
        date,
        amount: type === 'CASH' ? Number(amount) : 0,
        shares: type === 'CASH' ? Number(shares) : 0,
        scripShares: type === 'SCRIP' ? Number(scripShares) : 0,
        totalAmount,
      });
      setXdDate('');
      setDate('');
      setAmount('');
      setShares('');
      setScripShares('');
      setCustomTotal('');
      loadData();
    } catch (err) {
      console.error('Failed to create dividend', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dividend?')) return;
    try {
      await deleteDividend(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete dividend', err);
    }
  };

  const [customTotal, setCustomTotal] = useState('');

  const grossAmount = type === 'CASH' ? (Number(amount) || 0) * (Number(shares) || 0) : 0;
  const taxAmount = taxable ? grossAmount * 0.15 : 0;
  const calculatedTotal = grossAmount - taxAmount;
  const totalAmount = customTotal !== '' ? Number(customTotal) : calculatedTotal;

  const sorted = [...dividends].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Dividends</h1>

      <div className="form-card">
        <h2>Add Dividend</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Company
              <select value={companyCode} onChange={e => handleCompanyChange(e.target.value)} required>
                {companies.map(c => (
                  <option key={c.id} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              XD Date
              <input type="date" value={xdDate} onChange={e => handleXdDateChange(e.target.value)} required />
            </label>
            <label>
              Transaction Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </label>
            <label>
              Type
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="dividendType"
                    value="CASH"
                    checked={type === 'CASH'}
                    onChange={() => setType('CASH')}
                  />
                  Cash
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="dividendType"
                    value="SCRIP"
                    checked={type === 'SCRIP'}
                    onChange={() => setType('SCRIP')}
                  />
                  Scrip
                </label>
              </div>
            </label>
          </div>
          {type === 'CASH' ? (
            <div className="form-row">
              <label>
                Amount per Share (LKR)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                />
              </label>
              <label>
                Shares Held
                <input
                  type="number"
                  min="1"
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                  required
                />
                {xdDate && companyCode && (
                  <small style={{ color: 'var(--text-muted)' }}>
                    Held before XD: {getSharesHeldAtDate(companyCode, xdDate)}
                  </small>
                )}
              </label>
            </div>
          ) : (
            <div className="form-row">
              <label>
                Shares Received (Free)
                <input
                  type="number"
                  min="1"
                  value={scripShares}
                  onChange={e => setScripShares(e.target.value)}
                  required
                />
              </label>
            </div>
          )}
          {type === 'CASH' && (
            <div className="form-row">
              <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={taxable}
                  onChange={e => setTaxable(e.target.checked)}
                />
                Taxable (15% WHT)
              </label>
            </div>
          )}
          {type === 'CASH' && grossAmount > 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              <div>Gross: LKR {grossAmount.toFixed(2)}</div>
              {taxable && <div style={{ color: '#e53e3e' }}>Tax (15%): -LKR {taxAmount.toFixed(2)}</div>}
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Suggested Net: LKR {calculatedTotal.toFixed(2)}</div>
            </div>
          )}
          {type === 'CASH' && (
            <div className="form-row">
              <label>
                Total Amount (editable)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customTotal !== '' ? customTotal : calculatedTotal.toFixed(2)}
                  onChange={e => setCustomTotal(e.target.value)}
                  onFocus={() => { if (customTotal === '') setCustomTotal(calculatedTotal.toFixed(2)); }}
                />
              </label>
            </div>
          )}
          <div className="form-row">
            <button type="submit">Add Dividend</button>
          </div>
        </form>
      </div>

      {sorted.length === 0 ? (
        <p>No dividends yet.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Type</th>
                <th className="text-right">Amount/Share</th>
                <th className="text-right">Shares</th>
                <th className="text-right">Scrip Shares</th>
                <th className="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(d => (
                <tr key={d.id}>
                  <td>{d.date}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={d.companyCode} size={26} />
                      {d.companyCode}
                    </div>
                  </td>
                  <td>
                    <span className={`gain-pill ${d.type === 'CASH' ? 'gain-pill-cash' : 'gain-pill-scrip'}`}>
                      {d.type}
                    </span>
                  </td>
                  <td className="text-right mono">{d.type === 'CASH' ? d.amount.toFixed(2) : '-'}</td>
                  <td className="text-right mono">{d.type === 'CASH' ? d.shares : '-'}</td>
                  <td className="text-right mono">{d.type === 'SCRIP' ? d.scripShares : '-'}</td>
                  <td className="text-right mono">{d.type === 'CASH' ? d.totalAmount.toFixed(2) : `${d.scripShares} shares`}</td>
                  <td>
                    <ActionMenu actions={[
                      { label: 'Delete', onClick: () => handleDelete(d.id), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
