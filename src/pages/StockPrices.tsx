import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMarketData, getMarketDataHistory, getTransactions, getDividends, getDashboardAll } from '../api';
import { MarketData, Transaction, Dividend, PortfolioItem, RealizedGainItem } from '../types';
import CompanyAvatar from '../components/CompanyAvatar';
import { useTableSort } from '../hooks/useTableSort';
import { txDateTieBreaker } from '../utils/transactionSort';

export default function StockPrices() {
  const { code } = useParams<{ code: string }>();
  const [marketInfo, setMarketInfo] = useState<MarketData | null>(null);
  const [priceHistory, setPriceHistory] = useState<MarketData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem | null>(null);
  const [realizedItems, setRealizedItems] = useState<RealizedGainItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    Promise.all([
      getMarketData(),
      getMarketDataHistory(code),
      getTransactions(),
      getDividends(),
      getDashboardAll(),
    ]).then(([md, history, txns, divs, dash]) => {
      setMarketInfo(md.find(m => m.companyCode === code) || null);
      setPriceHistory(history);
      setTransactions(txns.filter(t => t.companyCode === code).sort((a, b) => b.date.localeCompare(a.date)));
      setDividends(divs.filter(d => d.companyCode === code).sort((a, b) => b.date.localeCompare(a.date)));
      setPortfolio(dash.portfolio.find(p => p.companyCode === code) || null);
      setRealizedItems(dash.realizedItems.filter(r => r.companyCode === code));
    }).catch(console.error).finally(() => setLoading(false));
  }, [code]);

  const priceSort = useTableSort(priceHistory, 'tradeDate');
  const txnSort = useTableSort(transactions, 'date', 'desc', txDateTieBreaker);
  const realizedSort = useTableSort(realizedItems, 'sellDate');
  const divSort = useTableSort(dividends, 'date');

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');
  const gainSign = (n: number) => (n >= 0 ? '+' : '');

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <Link to="/companies" className="back-link">&larr; Back to Companies</Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <CompanyAvatar code={code || ''} size={36} />
        {code} {marketInfo ? `— ${marketInfo.companyName}` : ''}
      </h1>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {marketInfo && (
          <>
            <div className="stat-card">
              <h3>Last Trade</h3>
              <p className="stat-value">{fmt(marketInfo.lastTrade)}</p>
              <small style={{ color: 'var(--text-muted)' }}>{marketInfo.tradeDate}</small>
            </div>
            <div className="stat-card">
              <h3>Change</h3>
              <p className={`stat-value ${gainClass(marketInfo.change)}`}>
                {gainSign(marketInfo.change)}{fmt(marketInfo.change)} ({gainSign(marketInfo.changePercent)}{fmt(marketInfo.changePercent)}%)
              </p>
            </div>
          </>
        )}
        {portfolio && portfolio.sharesHeld > 0 && (
          <>
            <div className="stat-card">
              <h3>Shares Held</h3>
              <p className="stat-value">{portfolio.sharesHeld}</p>
              <small style={{ color: 'var(--text-muted)' }}>Avg Buy: {fmt(portfolio.avgBuyPrice)}</small>
            </div>
            <div className="stat-card">
              <h3>Current Value</h3>
              <p className="stat-value">{fmt(portfolio.currentValue)}</p>
              <small style={{ color: 'var(--text-muted)' }}>Invested: {fmt(portfolio.totalInvested)}</small>
            </div>
            <div className="stat-card">
              <h3>Unrealized Gain</h3>
              <p className={`stat-value ${gainClass(portfolio.unrealizedGain)}`}>
                {gainSign(portfolio.unrealizedGain)}{fmt(portfolio.unrealizedGain)}
              </p>
              <small className={gainClass(portfolio.unrealizedGainPercent)}>
                {gainSign(portfolio.unrealizedGainPercent)}{fmt(portfolio.unrealizedGainPercent)}%
              </small>
            </div>
          </>
        )}
        {realizedItems.length > 0 && (
          <div className="stat-card">
            <h3>Realized Gain</h3>
            <p className={`stat-value ${gainClass(realizedItems.reduce((s, r) => s + r.realizedGain, 0))}`}>
              {gainSign(realizedItems.reduce((s, r) => s + r.realizedGain, 0))}{fmt(realizedItems.reduce((s, r) => s + r.realizedGain, 0))}
            </p>
            <small style={{ color: 'var(--text-muted)' }}>{realizedItems.length} sell transaction{realizedItems.length > 1 ? 's' : ''}</small>
          </div>
        )}
        {dividends.length > 0 && (
          <div className="stat-card">
            <h3>Dividends</h3>
            <p className="stat-value gain-positive">
              {fmt(dividends.filter(d => d.type === 'CASH').reduce((s, d) => s + d.totalAmount, 0))}
            </p>
            <small style={{ color: 'var(--text-muted)' }}>{dividends.length} dividend{dividends.length > 1 ? 's' : ''}</small>
          </div>
        )}
      </div>

      {/* Price History */}
      {priceHistory.length > 0 && (
        <>
          <h2>Price History</h2>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => priceSort.handleSort('tradeDate')}>Date{priceSort.sortIcon('tradeDate')}</th>
                  <th className="sort-header text-right" onClick={() => priceSort.handleSort('high')}>High{priceSort.sortIcon('high')}</th>
                  <th className="sort-header text-right" onClick={() => priceSort.handleSort('low')}>Low{priceSort.sortIcon('low')}</th>
                  <th className="sort-header text-right" onClick={() => priceSort.handleSort('lastTrade')}>Last Trade{priceSort.sortIcon('lastTrade')}</th>
                  <th className="sort-header text-right" onClick={() => priceSort.handleSort('change')}>Change{priceSort.sortIcon('change')}</th>
                  <th className="sort-header text-right" onClick={() => priceSort.handleSort('changePercent')}>Change %{priceSort.sortIcon('changePercent')}</th>
                </tr>
              </thead>
              <tbody>
                {priceSort.sorted.map(p => (
                  <tr key={p.id}>
                    <td>{p.tradeDate}</td>
                    <td className="text-right mono">{p.high ? fmt(p.high) : '—'}</td>
                    <td className="text-right mono">{p.low ? fmt(p.low) : '—'}</td>
                    <td className="text-right mono">{fmt(p.lastTrade)}</td>
                    <td className={`text-right mono ${gainClass(p.change)}`}>
                      {gainSign(p.change)}{fmt(p.change)}
                    </td>
                    <td className="text-right mono">
                      <span className={`gain-pill ${p.changePercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                        {gainSign(p.changePercent)}{fmt(p.changePercent)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Transactions */}
      {transactions.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Transactions</h2>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => txnSort.handleSort('date')}>Date{txnSort.sortIcon('date')}</th>
                  <th className="sort-header" onClick={() => txnSort.handleSort('type')}>Type{txnSort.sortIcon('type')}</th>
                  <th className="sort-header text-right" onClick={() => txnSort.handleSort('count')}>Count{txnSort.sortIcon('count')}</th>
                  <th className="sort-header text-right" onClick={() => txnSort.handleSort('price')}>Price{txnSort.sortIcon('price')}</th>
                  <th className="sort-header text-right" onClick={() => txnSort.handleSort('commission')}>Commission{txnSort.sortIcon('commission')}</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {txnSort.sorted.map(t => (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>
                      <span className={`gain-pill ${t.type === 'BUY' ? 'gain-pill-buy' : 'gain-pill-sell'}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="text-right mono">{t.count}</td>
                    <td className="text-right mono">{fmt(t.price)}</td>
                    <td className="text-right mono">{fmt(t.commission)}</td>
                    <td className="text-right mono">{fmt(t.count * t.price + t.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Realized Gains */}
      {realizedItems.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Realized Gains</h2>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => realizedSort.handleSort('sellDate')}>Sell Date{realizedSort.sortIcon('sellDate')}</th>
                  <th className="sort-header text-right" onClick={() => realizedSort.handleSort('sharesSold')}>Shares{realizedSort.sortIcon('sharesSold')}</th>
                  <th className="sort-header text-right" onClick={() => realizedSort.handleSort('avgBuyPrice')}>Avg Buy{realizedSort.sortIcon('avgBuyPrice')}</th>
                  <th className="sort-header text-right" onClick={() => realizedSort.handleSort('sellPrice')}>Sell Price{realizedSort.sortIcon('sellPrice')}</th>
                  <th className="sort-header text-right" onClick={() => realizedSort.handleSort('realizedGain')}>Realized Gain{realizedSort.sortIcon('realizedGain')}</th>
                  <th className="sort-header text-right" onClick={() => realizedSort.handleSort('gainPercent')}>Gain %{realizedSort.sortIcon('gainPercent')}</th>
                </tr>
              </thead>
              <tbody>
                {realizedSort.sorted.map((r, i) => (
                  <tr key={i}>
                    <td>{r.sellDate}</td>
                    <td className="text-right mono">{r.sharesSold}</td>
                    <td className="text-right mono">{fmt(r.avgBuyPrice)}</td>
                    <td className="text-right mono">{fmt(r.sellPrice)}</td>
                    <td className={`text-right mono ${gainClass(r.realizedGain)}`}>
                      {gainSign(r.realizedGain)}{fmt(r.realizedGain)}
                    </td>
                    <td className="text-right mono">
                      <span className={`gain-pill ${r.gainPercent >= 0 ? 'gain-pill-up' : 'gain-pill-down'}`}>
                        {gainSign(r.gainPercent)}{fmt(r.gainPercent)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Dividends */}
      {dividends.length > 0 && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Dividends</h2>
          <div className="portfolio-table-wrap">
            <table className="portfolio-table">
              <thead>
                <tr>
                  <th className="sort-header" onClick={() => divSort.handleSort('date')}>Date{divSort.sortIcon('date')}</th>
                  <th className="sort-header" onClick={() => divSort.handleSort('type')}>Type{divSort.sortIcon('type')}</th>
                  <th className="sort-header text-right" onClick={() => divSort.handleSort('amount')}>Amount/Share{divSort.sortIcon('amount')}</th>
                  <th className="sort-header text-right" onClick={() => divSort.handleSort('shares')}>Shares{divSort.sortIcon('shares')}</th>
                  <th className="sort-header text-right" onClick={() => divSort.handleSort('totalAmount')}>Total{divSort.sortIcon('totalAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {divSort.sorted.map(d => (
                  <tr key={d.id}>
                    <td>{d.date}</td>
                    <td>
                      <span className={`gain-pill ${d.type === 'CASH' ? 'gain-pill-cash' : 'gain-pill-scrip'}`}>
                        {d.type}
                      </span>
                    </td>
                    <td className="text-right mono">{d.type === 'CASH' ? fmt(d.amount) : '—'}</td>
                    <td className="text-right mono">{d.type === 'CASH' ? d.shares : d.scripShares}</td>
                    <td className="text-right mono">
                      {d.type === 'CASH' ? fmt(d.totalAmount) : `${d.scripShares} shares`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
