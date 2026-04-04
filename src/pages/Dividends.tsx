import { useEffect, useState } from 'react';
import { getDividends, getCompanies, getTransactions, createDividend, updateDividend, deleteDividend } from '../api';
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

  // Edit modal state
  const [editDividend, setEditDividend] = useState<Dividend | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'CASH' | 'SCRIP'>('CASH');
  const [editAmount, setEditAmount] = useState('');
  const [editShares, setEditShares] = useState('');
  const [editScripShares, setEditScripShares] = useState('');
  const [editTaxable, setEditTaxable] = useState(true);
  const [editTotal, setEditTotal] = useState('');

  const openEdit = (d: Dividend) => {
    setEditDividend(d);
    setEditDate(d.date);
    setEditType(d.type);
    setEditAmount(d.type === 'CASH' ? String(d.amount) : '');
    setEditShares(d.type === 'CASH' ? String(d.shares) : '');
    setEditScripShares(d.type === 'SCRIP' ? String(d.scripShares) : '');
    setEditTaxable(d.taxed !== false);
    setEditTotal(String(d.totalAmount));
  };

  const handleEditSubmit = async () => {
    if (!editDividend) return;
    try {
      await updateDividend(editDividend.id, {
        companyCode: editDividend.companyCode,
        type: editType,
        date: editDate,
        amount: editType === 'CASH' ? Number(editAmount) : 0,
        shares: editType === 'CASH' ? Number(editShares) : 0,
        scripShares: editType === 'SCRIP' ? Number(editScripShares) : 0,
        totalAmount: Number(editTotal),
        taxed: editType === 'CASH' ? editTaxable : undefined,
      });
      setEditDividend(null);
      loadData();
    } catch (err) {
      console.error('Failed to update dividend', err);
    }
  };

  const editGross = editType === 'CASH' ? (Number(editAmount) || 0) * (Number(editShares) || 0) : 0;
  const editTax = editTaxable ? editGross * 0.15 : 0;
  const editCalculatedTotal = editGross - editTax;

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
        taxed: type === 'CASH' ? taxable : undefined,
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

  const [divSortKey, setDivSortKey] = useState<'date' | 'companyCode' | 'type' | 'amount' | 'shares' | 'total'>('date');
  const [divSortDir, setDivSortDir] = useState<'asc' | 'desc'>('desc');
  const handleDivSort = (key: typeof divSortKey) => {
    if (divSortKey === key) setDivSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDivSortKey(key); setDivSortDir(key === 'companyCode' || key === 'type' ? 'asc' : 'desc'); }
  };
  const dsi = (key: typeof divSortKey) => divSortKey === key ? (divSortDir === 'asc' ? ' \u2191' : ' \u2193') : ' \u2195';
  const [divSearch, setDivSearch] = useState('');

  const sorted = [...dividends]
    .filter(d =>
      divSearch === '' ||
      d.companyCode.toLowerCase().includes(divSearch.toLowerCase()) ||
      d.type.toLowerCase().includes(divSearch.toLowerCase()) ||
      d.date.includes(divSearch)
    )
    .sort((a, b) => {
      let cmp = 0;
      if (divSortKey === 'date') cmp = a.date.localeCompare(b.date);
      else if (divSortKey === 'companyCode') cmp = a.companyCode.localeCompare(b.companyCode);
      else if (divSortKey === 'type') cmp = a.type.localeCompare(b.type);
      else if (divSortKey === 'amount') cmp = a.amount - b.amount;
      else if (divSortKey === 'shares') cmp = a.shares - b.shares;
      else if (divSortKey === 'total') cmp = a.totalAmount - b.totalAmount;
      return divSortDir === 'asc' ? cmp : -cmp;
    });

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
            {type === 'CASH' && (
              <label>
                XD Date
                <input type="date" value={xdDate} onChange={e => handleXdDateChange(e.target.value)} required />
              </label>
            )}
            <label>
              {type === 'CASH' ? 'Transaction Date' : 'Date'}
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

      {dividends.length >= 5 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <input className="search-bar" value={divSearch} onChange={e => setDivSearch(e.target.value)} placeholder="Search..." />
        </div>
      )}

      {sorted.length === 0 ? (
        <p>{dividends.length === 0 ? 'No dividends yet.' : 'No dividends match your search.'}</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleDivSort('date')}>Date{dsi('date')}</th>
                <th className="sort-header" onClick={() => handleDivSort('companyCode')}>Company{dsi('companyCode')}</th>
                <th className="sort-header" onClick={() => handleDivSort('type')}>Type{dsi('type')}</th>
                <th className="sort-header text-right" onClick={() => handleDivSort('amount')}>Amount/Share{dsi('amount')}</th>
                <th className="sort-header text-right" onClick={() => handleDivSort('shares')}>Shares{dsi('shares')}</th>
                <th className="text-right">Scrip Shares</th>
                <th className="sort-header text-right" onClick={() => handleDivSort('total')}>Total{dsi('total')}</th>
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
                  <td className="text-right mono">
                    {d.type === 'CASH' ? (
                      <>
                        {d.totalAmount.toFixed(2)}
                        {d.taxed === false && (
                          <span style={{ color: '#d69e2e', fontSize: '0.65rem', marginLeft: '0.3rem' }} title="Untaxed">*</span>
                        )}
                      </>
                    ) : `${d.scripShares} shares`}
                  </td>
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(d) },
                      { label: 'Delete', onClick: () => handleDelete(d.id), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editDividend && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setEditDividend(null)}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '480px', margin: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 1rem' }}>Edit Dividend</h2>
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <CompanyAvatar code={editDividend.companyCode} size={32} />
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{editDividend.companyCode}</span>
              </div>
            </div>
            <div className="form-row">
              <label>
                Date
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} required />
              </label>
              <label>
                Type
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" checked={editType === 'CASH'} onChange={() => setEditType('CASH')} /> Cash
                  </label>
                  <label className="radio-label">
                    <input type="radio" checked={editType === 'SCRIP'} onChange={() => setEditType('SCRIP')} /> Scrip
                  </label>
                </div>
              </label>
            </div>
            {editType === 'CASH' ? (
              <>
                <div className="form-row">
                  <label>
                    Amount per Share (LKR)
                    <input type="number" step="0.01" min="0" value={editAmount} onChange={e => setEditAmount(e.target.value)} required />
                  </label>
                  <label>
                    Shares Held
                    <input type="number" min="1" value={editShares} onChange={e => setEditShares(e.target.value)} required />
                  </label>
                </div>
                <div className="form-row">
                  <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={editTaxable} onChange={e => setEditTaxable(e.target.checked)} />
                    Taxable (15% WHT)
                  </label>
                </div>
                {editGross > 0 && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    <div>Gross: LKR {editGross.toFixed(2)}</div>
                    {editTaxable && <div style={{ color: '#e53e3e' }}>Tax (15%): -LKR {editTax.toFixed(2)}</div>}
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Suggested Net: LKR {editCalculatedTotal.toFixed(2)}</div>
                  </div>
                )}
                <div className="form-row">
                  <label>
                    Total Amount (editable)
                    <input type="number" step="0.01" min="0" value={editTotal} onChange={e => setEditTotal(e.target.value)} />
                  </label>
                </div>
              </>
            ) : (
              <div className="form-row">
                <label>
                  Shares Received (Free)
                  <input type="number" min="1" value={editScripShares} onChange={e => setEditScripShares(e.target.value)} required />
                </label>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setEditDividend(null)} style={{
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
    </div>
  );
}
