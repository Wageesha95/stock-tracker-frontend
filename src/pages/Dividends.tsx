import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDividends, getCompanies, getTransactions, createDividend, updateDividend, deleteDividend, getDividendPayouts, getAllDividendPayouts, DividendPayoutData, getShareSplits, ShareSplitData } from '../api';
import { Dividend, Company, Transaction } from '../types';
import { sharesHeldAtDate } from '../utils/splits';
import { useAuth } from '../context/AuthContext';
import ActionMenu from '../components/ActionMenu';
import CompanyAvatar from '../components/CompanyAvatar';
import CompanySearchSelect from '../components/CompanySearchSelect';

export default function Dividends() {
  const navigate = useNavigate();
  const { isReadMode, dividendPayoutsEnabled } = useAuth();
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shareSplits, setShareSplits] = useState<ShareSplitData[]>([]);
  const formRef = useRef<HTMLDivElement>(null);
  const [allPayouts, setAllPayouts] = useState<DividendPayoutData[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyCode, setCompanyCode] = useState('');
  const [xdDate, setXdDate] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'CASH' | 'SCRIP'>('CASH');
  const [amount, setAmount] = useState('');
  const [shares, setShares] = useState('');
  const [scripShares, setScripShares] = useState('');
  const [taxable, setTaxable] = useState(true);
  const [companyPayouts, setCompanyPayouts] = useState<DividendPayoutData[]>([]);
  const [selectedPayout, setSelectedPayout] = useState<DividendPayoutData | null>(null);

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
  const [editPayouts, setEditPayouts] = useState<DividendPayoutData[]>([]);
  const [editSelectedPayout, setEditSelectedPayout] = useState<DividendPayoutData | null>(null);

  const openEdit = (d: Dividend) => {
    setEditDividend(d);
    setEditXdDate(d.xdDate || '');
    setEditDate(d.date);
    if (dividendPayoutsEnabled) {
      getDividendPayouts(d.companyCode).then(p => {
        setEditPayouts(p);
        setEditSelectedPayout(p.find(pp => pp.exDividendDate === d.xdDate) || null);
      }).catch(() => setEditPayouts([]));
    }
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
    Promise.all([
      getDividends(),
      getCompanies(),
      getTransactions(),
      getShareSplits(),
      dividendPayoutsEnabled
        ? getAllDividendPayouts().catch(() => [] as DividendPayoutData[])
        : Promise.resolve([] as DividendPayoutData[]),
    ])
      .then(([divs, comps, txns, splits, payouts]) => {
        setDividends(divs);
        setCompanies(comps);
        setTransactions(txns);
        setShareSplits(splits);
        setAllPayouts(payouts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  // Shares held for a company as of a given date, in that date's split basis and
  // counting every share-adding type (buys, rights, IPO, scrip) — not just BUY.
  const getSharesHeldAtDate = (code: string, beforeDate: string): number =>
    sharesHeldAtDate(
      transactions.filter(t => t.companyCode === code),
      shareSplits.filter(s => s.companyCode === code),
      beforeDate,
    );

  // A recorded cash dividend's shares/amount re-expressed in the split basis in
  // effect on its XD date. When a split is entered after the dividend, the shares
  // held at XD change; the net cash (totalAmount) is invariant, so the per-share
  // gross is rebased to keep gross = amount/share × shares consistent. Falls back
  // to the stored values when no XD date or no derivable holding.
  const divShares = (d: Dividend): number => {
    if (d.type !== 'CASH' || !d.xdDate) return d.shares;
    const held = getSharesHeldAtDate(d.companyCode, d.xdDate);
    return held > 0 ? held : d.shares;
  };
  const divAmountPerShare = (d: Dividend): number => {
    const shares = divShares(d);
    return shares > 0 ? (d.amount * d.shares) / shares : d.amount;
  };

  // Pending dividends: payout XD has passed, user held shares before XD, and no user dividend recorded yet for that company+XD date.
  const pendingDividends = useMemo(() => {
    if (!dividendPayoutsEnabled || allPayouts.length === 0) return [];
    const today = new Date().toLocaleDateString('en-CA');
    const recordedKeys = new Set(
      dividends.filter(d => d.xdDate).map(d => `${d.companyCode}|${d.xdDate}`)
    );
    return allPayouts
      .filter(p => p.exDividendDate && p.exDividendDate <= today)
      .filter(p => !recordedKeys.has(`${p.companyCode}|${p.exDividendDate}`))
      .map(p => ({ payout: p, sharesHeld: getSharesHeldAtDate(p.companyCode, p.exDividendDate) }))
      .filter(x => x.sharesHeld > 0)
      .sort((a, b) => b.payout.exDividendDate.localeCompare(a.payout.exDividendDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPayouts, dividends, transactions, dividendPayoutsEnabled]);

  // Auto-suggest shares when XD date or company changes
  const handleXdDateChange = (newXdDate: string) => {
    setXdDate(newXdDate);
    setDate('');
    const payout = companyPayouts.find(p => p.exDividendDate === newXdDate) || null;
    setSelectedPayout(payout);
    if (payout && payout.amountPerShare != null) {
      setAmount(String(payout.amountPerShare));
    }
    if (newXdDate && companyCode) {
      const held = getSharesHeldAtDate(companyCode, newXdDate);
      setShares(held > 0 ? String(held) : '');
    }
  };

  const handleCompanyChange = (newCode: string) => {
    setCompanyCode(newCode);
    setXdDate('');
    setDate('');
    setSelectedPayout(null);
    setCompanyPayouts([]);
    if (newCode && dividendPayoutsEnabled) {
      getDividendPayouts(newCode).then(setCompanyPayouts).catch(() => setCompanyPayouts([]));
    }
    if (xdDate && newCode) {
      const held = getSharesHeldAtDate(newCode, xdDate);
      setShares(held > 0 ? String(held) : '');
    }
  };

  // Prefill the Add Dividend card from a pending ("to be received") row and jump to it.
  const fillFromPending = (payout: DividendPayoutData, sharesHeld: number) => {
    setType('CASH');
    setCompanyCode(payout.companyCode);
    setXdDate(payout.exDividendDate);
    setDate(payout.paymentDate || '');
    setAmount(payout.amountPerShare != null ? String(payout.amountPerShare) : '');
    setShares(sharesHeld > 0 ? String(sharesHeld) : '');
    setTaxable(true);
    setCustomTotal('');
    setSelectedPayout(payout);
    if (dividendPayoutsEnabled) {
      getDividendPayouts(payout.companyCode).then(setCompanyPayouts).catch(() => setCompanyPayouts([]));
    }
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      // Clear the whole Add Dividend card after a successful add.
      setCompanyCode('');
      setXdDate('');
      setDate('');
      setType('CASH');
      setAmount('');
      setShares('');
      setScripShares('');
      setTaxable(true);
      setCustomTotal('');
      setSelectedPayout(null);
      setCompanyPayouts([]);
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
  const canAdd = companyCode !== '' && date !== '' && (type === 'CASH' ? amount !== '' && shares !== '' : scripShares !== '');

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
      else if (divSortKey === 'amount') cmp = divAmountPerShare(a) - divAmountPerShare(b);
      else if (divSortKey === 'shares') cmp = divShares(a) - divShares(b);
      else if (divSortKey === 'total') cmp = a.totalAmount - b.totalAmount;
      return divSortDir === 'asc' ? cmp : -cmp;
    });

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Dividends</h1>

      {pendingDividends.length > 0 && (
        <div className="form-card">
          <h2>Pending Dividends ({pendingDividends.length})</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            XD date has passed and you held shares — not yet recorded.
          </p>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th>XD Date</th>
                  <th>Company</th>
                  <th className="hide-sm">Type</th>
                  <th className="text-right">Amount/Share</th>
                  <th className="text-right">Shares Held</th>
                  <th className="text-right">Est. Gross</th>
                  <th className="text-right">Est. Net (−15%)</th>
                  <th className="hide-sm">Payment Date</th>
                  {!isReadMode && <th></th>}
                </tr>
              </thead>
              <tbody>
                {pendingDividends.map(({ payout, sharesHeld }) => {
                  const aps = payout.amountPerShare != null ? Number(payout.amountPerShare) : null;
                  const estGross = aps != null ? aps * sharesHeld : null;
                  const estNet = estGross != null ? estGross * 0.85 : null;
                  return (
                    <tr key={`${payout.companyCode}-${payout.exDividendDate}`}>
                      <td className="mono">{payout.exDividendDate}</td>
                      <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/company/${payout.companyCode}`)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CompanyAvatar code={payout.companyCode} size={26} />
                          {payout.companyCode}
                        </div>
                      </td>
                      <td className="hide-sm" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{payout.dividendType || '—'}</td>
                      <td className="text-right mono">{aps != null ? aps.toFixed(2) : '—'}</td>
                      <td className="text-right mono">{sharesHeld}</td>
                      <td className="text-right mono">{estGross != null ? estGross.toFixed(2) : '—'}</td>
                      <td className="text-right mono">{estNet != null ? estNet.toFixed(2) : '—'}</td>
                      <td className="hide-sm" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{payout.paymentDate || '—'}</td>
                      {!isReadMode && (
                        <td>
                          <button
                            onClick={() => fillFromPending(payout, sharesHeld)}
                            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: '#3182ce', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                          >
                            + Add
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isReadMode && (
      <div className="form-card" ref={formRef}>
        <h2>Add Dividend</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              Company
              <CompanySearchSelect companies={companies} value={companyCode} onChange={handleCompanyChange} />
            </label>
          </div>
          <div className="form-row">
            <label>
              XD Date
              {companyPayouts.length > 0 ? (() => {
                const usedXdDates = new Set(dividends.filter(d => d.companyCode === companyCode && d.type === type).map(d => d.xdDate));
                const available = companyPayouts.filter(p => !usedXdDates.has(p.exDividendDate));
                return (
                  <select value={xdDate} onChange={e => handleXdDateChange(e.target.value)}>
                    <option value="">— Select XD Date ({available.length} available) —</option>
                    {companyPayouts.map(p => {
                      const used = usedXdDates.has(p.exDividendDate);
                      return (
                        <option key={p.exDividendDate} value={p.exDividendDate} disabled={used}>
                          {p.exDividendDate}{type === 'CASH' && p.amountPerShare != null ? ' — ' + Number(p.amountPerShare).toFixed(2) + ' LKR' : ''}{used ? ' (already added)' : ''}
                        </option>
                      );
                    })}
                  </select>
                );
              })() : (
                <input type="date" value={xdDate} onChange={e => handleXdDateChange(e.target.value)} />
              )}
            </label>
            <label>
              <span>{type === 'CASH' ? 'Transaction Date' : 'Date'}{selectedPayout && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.5rem' }}>
                  ({xdDate} to {selectedPayout.paymentDate || 'any'})
                </span>
              )}</span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                min={xdDate || undefined}
                max={selectedPayout?.paymentDate || undefined}
              />
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
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                  Shares Held
                  {xdDate && companyCode && getSharesHeldAtDate(companyCode, xdDate) > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>(Held before XD: {getSharesHeldAtDate(companyCode, xdDate)})</span>}
                </span>
                <input
                  type="number"
                  min="1"
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                  required
                />
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
            <button type="submit" disabled={!canAdd}>Add Dividend</button>
          </div>
        </form>
      </div>
      )}

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
                {!isReadMode && <th></th>}
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
                  <td className="text-right mono">{divAmountPerShare(d).toFixed(2)}</td>
                  <td className="text-right mono">{divShares(d)}</td>
                  <td className="text-right mono">{d.totalAmount.toFixed(2)}</td>
                  {!isReadMode && (
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(d) },
                      { label: 'Delete', onClick: () => handleDelete(d.id), danger: true },
                    ]} />
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="portfolio-total">
                <td colSpan={4}>Total</td>
                <td></td>
                <td className="text-right mono">{cashDivs.reduce((s, d) => s + divShares(d), 0)}</td>
                <td className="text-right mono">{cashDivs.reduce((s, d) => s + d.totalAmount, 0).toFixed(2)}</td>
                {!isReadMode && <td></td>}
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
                {!isReadMode && <th></th>}
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
                  {!isReadMode && (
                  <td>
                    <ActionMenu actions={[
                      { label: 'Edit', onClick: () => openEdit(d) },
                      { label: 'Delete', onClick: () => handleDelete(d.id), danger: true },
                    ]} />
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="portfolio-total">
                <td colSpan={3}>Total</td>
                <td className="text-right mono">{scripDivs.reduce((s, d) => s + d.scripShares, 0)} shares</td>
                {!isReadMode && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
      </>);
      })()}

      {/* Edit Modal */}
      {!isReadMode && editDividend && (
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
                {editPayouts.length > 0 ? (
                  <select value={editXdDate} onChange={e => {
                    setEditXdDate(e.target.value);
                    setEditDate('');
                    const p = editPayouts.find(pp => pp.exDividendDate === e.target.value) || null;
                    setEditSelectedPayout(p);
                    if (p && p.amountPerShare != null) setEditAmount(String(p.amountPerShare));
                  }}>
                    <option value="">— Select XD Date —</option>
                    {editPayouts.map(p => (
                      <option key={p.exDividendDate} value={p.exDividendDate}>
                        {p.exDividendDate}{editType === 'CASH' && p.amountPerShare != null ? ' — ' + Number(p.amountPerShare).toFixed(2) + ' LKR' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="date" value={editXdDate} onChange={e => setEditXdDate(e.target.value)} />
                )}
              </label>
              <label>
                <span>Transaction Date{editSelectedPayout && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.5rem' }}>
                    ({editXdDate} to {editSelectedPayout.paymentDate || 'any'})
                  </span>
                )}</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  required
                  min={editXdDate || undefined}
                  max={editSelectedPayout?.paymentDate || undefined}
                />
              </label>
              <label>
                Type
                <div style={{ padding: '0.5rem 0', fontWeight: 600 }}>
                  {editType === 'CASH' ? 'Cash' : 'Scrip'}
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
