import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDividends, getCompanies, getTransactions, createDividend, updateDividend, deleteDividend } from '../api';
import { Dividend, Company, Transaction } from '../types';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';

export default function Dividends() {
  const navigate = useNavigate();
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
  const [editXdDate, setEditXdDate] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'CASH' | 'SCRIP'>('CASH');
  const [editAmount, setEditAmount] = useState('');
  const [editShares, setEditShares] = useState('');
  const [editScripShares, setEditScripShares] = useState('');
  const [editTaxable, setEditTaxable] = useState(true);
  const [editTotal, setEditTotal] = useState('');

  const openEdit = (d: Dividend) => {
    setEditDividend(d);
    setEditXdDate(d.xdDate || '');
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
        xdDate: editXdDate || undefined,
        amount: editType === 'CASH' ? Number(editAmount) : 0,
        shares: editType === 'CASH' ? Number(editShares) : 0,
        scripShares: editType === 'SCRIP' ? Number(editScripShares) : 0,
        totalAmount: editType === 'CASH' ? Number(editTotal) : 0,
        taxed: editType === 'CASH' ? editTaxable : true,
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
    if (newXdDate && companyCode) {
      const held = getSharesHeldAtDate(companyCode, newXdDate);
      setShares(held > 0 ? String(held) : '');
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
        xdDate: xdDate || undefined,
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
  const [divTab, setDivTab] = useState<'cash' | 'scrip'>('cash');

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
              <CompanySearchSelect companies={companies} value={companyCode} onChange={handleCompanyChange} />
            </label>
            <label>
              XD Date
              <input type="date" value={xdDate} onChange={e => handleXdDateChange(e.target.value)} />
            </label>
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

      {(() => {
        const cashDivs = sorted.filter(d => d.type === 'CASH');
        const scripDivs = sorted.filter(d => d.type === 'SCRIP');
        return (<>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="segmented-control">
          <button className={divTab === 'cash' ? 'active' : ''} onClick={() => setDivTab('cash')}>Cash ({cashDivs.length})</button>
          <button className={divTab === 'scrip' ? 'active' : ''} onClick={() => setDivTab('scrip')}>Scrip ({scripDivs.length})</button>
        </div>
        {dividends.length >= 5 && (
          <input className="search-bar" value={divSearch} onChange={e => setDivSearch(e.target.value)} placeholder="Search..." />
        )}
      </div>

      {divTab === 'cash' && (cashDivs.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No cash dividends yet.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleDivSort('date')}>Date{dsi('date')}</th>
                <th>XD Date</th>
                <th className="sort-header" onClick={() => handleDivSort('companyCode')}>Company{dsi('companyCode')}</th>
                <th>Tax</th>
                <th className="sort-header text-right" onClick={() => handleDivSort('amount')}>Amount/Share{dsi('amount')}</th>
                <th className="sort-header text-right" onClick={() => handleDivSort('shares')}>Shares{dsi('shares')}</th>
                <th className="sort-header text-right" onClick={() => handleDivSort('total')}>Total{dsi('total')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cashDivs.map(d => (
                <tr key={d.id}>
                  <td>{d.date}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{d.xdDate || '\u2014'}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${d.companyCode}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={d.companyCode} size={26} />
                      {d.companyCode}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {d.taxed !== false ? <span className="gain-pill gain-pill-taxed" style={{ fontSize: '0.65rem' }}>Taxed</span> : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                  </td>
                  <td className="text-right mono">{d.amount.toFixed(2)}</td>
                  <td className="text-right mono">{d.shares}</td>
                  <td className="text-right mono">{d.totalAmount.toFixed(2)}</td>
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(d) },
                      { label: 'Delete', onClick: () => handleDelete(d.id), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="portfolio-total">
                <td colSpan={4}>Total</td>
                <td></td>
                <td className="text-right mono">{cashDivs.reduce((s, d) => s + d.shares, 0)}</td>
                <td className="text-right mono">{cashDivs.reduce((s, d) => s + d.totalAmount, 0).toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {divTab === 'scrip' && (scripDivs.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No scrip dividends yet.</p>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th className="sort-header" onClick={() => handleDivSort('date')}>Date{dsi('date')}</th>
                <th>XD Date</th>
                <th className="sort-header" onClick={() => handleDivSort('companyCode')}>Company{dsi('companyCode')}</th>
                <th className="text-right">Shares Received</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scripDivs.map(d => (
                <tr key={d.id}>
                  <td>{d.date}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{d.xdDate || '\u2014'}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${d.companyCode}`)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CompanyAvatar code={d.companyCode} size={26} />
                      {d.companyCode}
                    </div>
                  </td>
                  <td className="text-right mono">{d.scripShares}</td>
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(d) },
                      { label: 'Delete', onClick: () => handleDelete(d.id), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="portfolio-total">
                <td colSpan={3}>Total</td>
                <td className="text-right mono">{scripDivs.reduce((s, d) => s + d.scripShares, 0)} shares</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
      </>);
      })()}

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
                XD Date
                <input type="date" value={editXdDate} onChange={e => setEditXdDate(e.target.value)} />
              </label>
              <label>
                Transaction Date
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
