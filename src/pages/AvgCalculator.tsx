import { useEffect, useState, useMemo, useRef } from 'react';
import { getCompanies, getDashboardAll, getAllDividendPayouts, getMarketData, getUserSettings, DividendPayoutData } from '../api';
import { SELL_COMMISSION_PCT } from '../constants';
import { Company, PortfolioItem, MarketData } from '../types';
import CompanyAvatar from '../components/CompanyAvatar';
import { ttmDividendTotal, groupByCompanyCode } from '../utils/ttm';

export default function AvgCalculator() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [portfolioMap, setPortfolioMap] = useState<Record<string, PortfolioItem>>({});
  const [ttmDivMap, setTtmDivMap] = useState<Record<string, number>>({});
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [selectedCode, setSelectedCode] = useState('');
  const [mode, setMode] = useState<'calculate' | 'target'>('calculate');

  const [companySearch, setCompanySearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate mode
  const [newShares, setNewShares] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCommission, setNewCommission] = useState(SELL_COMMISSION_PCT);

  // Target mode
  const [targetAvg, setTargetAvg] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [targetCommission, setTargetCommission] = useState(SELL_COMMISSION_PCT);

  useEffect(() => {
    // Settings first so the calculator's holdings honour the selected broker filter.
    getUserSettings().then(settings => {
      const dataBrokers = settings.selectedDataBrokerIds || [];
      return Promise.all([
        getCompanies(),
        getDashboardAll(dataBrokers),
        getAllDividendPayouts().catch(() => [] as DividendPayoutData[]),
        getMarketData().catch(() => [] as MarketData[]),
      ])
      .then(([comps, dash, payouts, md]) => {
        setCompanies(comps);
        const map: Record<string, PortfolioItem> = {};
        dash.portfolio.forEach((p: PortfolioItem) => { map[p.companyCode] = p; });
        setPortfolioMap(map);

        // Latest price per company
        const pMap: Record<string, number> = {};
        md.forEach(m => {
          if (!pMap[m.companyCode] || m.tradeDate > (md.find(x => x.companyCode === m.companyCode)?.tradeDate || '')) {
            pMap[m.companyCode] = m.lastTrade;
          }
        });
        setPriceMap(pMap);

        // TTM dividend total per company, anchored at max(latest XD, today)
        const weeksByCode = settings.companyTtmWeeks;
        const byCode = groupByCompanyCode(payouts);
        const divMap: Record<string, number> = {};
        for (const [code, divs] of Object.entries(byCode)) {
          const total = ttmDividendTotal(divs, weeksByCode?.[code]);
          if (total > 0) divMap[code] = total;
        }
        setTtmDivMap(divMap);
      });
    })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const current = portfolioMap[selectedCode];
  const currentShares = current?.sharesHeld || 0;
  const currentAvg = current?.avgBuyPrice || 0;
  const currentCost = currentShares * currentAvg;
  const ttmDiv = ttmDivMap[selectedCode] || 0;
  const lastTrade = priceMap[selectedCode] || 0;
  const ttmYieldAtMarket = lastTrade > 0 ? (ttmDiv / lastTrade) * 100 : 0;
  const ttmYieldAtAvg = currentAvg > 0 ? (ttmDiv / currentAvg) * 100 : 0;

  // Calculate mode result
  const calcResult = useMemo(() => {
    const shares = Number(newShares) || 0;
    const price = Number(newPrice) || 0;
    const commissionPct = Number(newCommission) || 0;
    if (shares <= 0 || price <= 0) return null;
    // Commission is a percentage of the trade value (CSE brokerage ~1.12%), matching how
    // real transactions record it — not a flat amount.
    const commission = shares * price * commissionPct / 100;
    const buyCost = shares * price + commission;
    const totalShares = currentShares + shares;
    const totalCost = currentCost + buyCost;
    const newAvg = totalShares > 0 ? totalCost / totalShares : 0;
    return { totalShares, totalCost, buyCost, newAvg, change: newAvg - currentAvg, changePercent: currentAvg > 0 ? ((newAvg - currentAvg) / currentAvg) * 100 : 0 };
  }, [currentShares, currentCost, currentAvg, newShares, newPrice, newCommission]);

  // Target mode result
  const targetResult = useMemo(() => {
    const target = Number(targetAvg) || 0;
    const price = Number(buyPrice) || 0;
    const commissionPct = Number(targetCommission) || 0;
    if (target <= 0 || price <= 0) return null;
    // Commission is a % of trade value, so the effective per-share cost is price × (1 + pct/100).
    const effPrice = price * (1 + commissionPct / 100);
    if (effPrice >= target && target < currentAvg) {
      return { error: 'Buy price must be lower than target average to bring average down' };
    }
    if (effPrice <= target && target > currentAvg) {
      return { error: 'Buy price must be higher than target average to bring average up' };
    }
    // (currentCost + shares × effPrice) / (currentShares + shares) = target
    // shares × (effPrice - target) = target × currentShares - currentCost
    const sharesToBuy = (target * currentShares - currentCost) / (effPrice - target);
    if (sharesToBuy <= 0 || !isFinite(sharesToBuy)) {
      return { error: 'Not possible with given price and target' };
    }
    const shares = Math.ceil(sharesToBuy);
    const buyCost = shares * effPrice;
    const totalCost = currentCost + buyCost;
    const totalShares = currentShares + shares;
    const actualAvg = totalShares > 0 ? totalCost / totalShares : 0;
    return { sharesToBuy: shares, cost: buyCost, totalShares, totalCost, actualAvg };
  }, [currentShares, currentCost, currentAvg, targetAvg, buyPrice, targetCommission]);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gainClass = (n: number) => (n >= 0 ? 'gain-positive' : 'gain-negative');

  if (loading) return <p>Loading...</p>;

  const holdingCompanies = companies.filter(c => portfolioMap[c.code]?.sharesHeld > 0);

  return (
    <div>
      <h1>Average Calculator</h1>

      <div className="form-card">
        <div className="form-row">
          <label>
            Company
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <input
                className={`search-bar${companySearch ? ' search-bar-has-value' : ''}`}
                value={companySearch}
                onChange={e => { setCompanySearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                placeholder={selectedCode ? `${selectedCode}` : 'Search...'}
                style={{ width: '100%' }}
              />
              {showDropdown && companySearch.length > 0 && (() => {
                const s = companySearch.toLowerCase();
                const matches = holdingCompanies.filter(c =>
                  c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)
                ).slice(0, 8);
                return matches.length > 0 ? (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', boxShadow: 'var(--shadow-dropdown)',
                    maxHeight: '250px', overflow: 'auto', marginTop: '0.25rem',
                  }}>
                    {matches.map(c => (
                      <div
                        key={c.code}
                        onMouseDown={() => {
                          setSelectedCode(c.code);
                          setCompanySearch('');
                          setShowDropdown(false);
                          setNewShares(''); setNewPrice(''); setNewCommission(SELL_COMMISSION_PCT); setTargetAvg(''); setBuyPrice(''); setTargetCommission(SELL_COMMISSION_PCT);
                        }}
                        style={{
                          padding: '0.5rem 0.75rem', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-dropdown-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <CompanyAvatar code={c.code} size={24} />
                        <span style={{ fontWeight: 600 }}>{c.code}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          </label>
        </div>

        {current && (
          <div className="calc-holding" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', padding: '0.75rem', background: 'var(--bg-thead)', borderRadius: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <CompanyAvatar code={selectedCode} size={36} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedCode}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companies.find(c => c.code === selectedCode)?.name}</div>
              </div>
            </div>
            <div className="calc-holding-stats" style={{ display: 'flex', flex: 1, justifyContent: 'space-evenly' }}>
              <div style={{ textAlign: 'center', padding: '0.25rem 0.75rem' }}>
                <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Shares</div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{currentShares}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '0.25rem 0.75rem' }}>
                <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Avg. Price</div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(currentAvg)}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '0.25rem 0.75rem' }}>
                <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Invested</div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(currentCost)}</div>
              </div>
              {ttmDiv > 0 && (
                <div style={{ textAlign: 'center', padding: '0.25rem 0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }} title="TTM Yield at current avg">Yield @ Avg</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#805ad5' }}>{ttmYieldAtAvg.toFixed(2)}%</div>
                </div>
              )}
              {ttmDiv > 0 && lastTrade > 0 && (
                <div style={{ textAlign: 'center', padding: '0.25rem 0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }} title="TTM Yield at last trade price">Yield @ Mkt</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#805ad5' }}>{ttmYieldAtMarket.toFixed(2)}%</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <div className="segmented-control">
            <button className={mode === 'calculate' ? 'active' : ''} onClick={() => setMode('calculate')}>
              Calculate New Average
            </button>
            <button className={mode === 'target' ? 'active' : ''} onClick={() => setMode('target')}>
              Target Average
            </button>
          </div>
        </div>

        {mode === 'calculate' && (
          <>
            <div className="form-row">
              <label>
                Shares to Buy
                <input type="number" min="1" value={newShares} onChange={e => setNewShares(e.target.value)} placeholder="e.g. 100" />
              </label>
              <label>
                Buy Price
                <input type="number" step="0.01" min="0" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="e.g. 120.00" />
              </label>
              <label>
                Commission %
                <input type="number" step="0.01" min="0" value={newCommission} onChange={e => setNewCommission(e.target.value)} placeholder="1.12" />
              </label>
            </div>

            {calcResult && (
              <div style={{ marginTop: '1rem' }}>
                <div className="portfolio-table-wrap">
                  <table className="portfolio-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th className="text-right">Current</th>
                        <th className="text-right">After Buy</th>
                        <th className="text-right">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Shares</td>
                        <td className="text-right mono">{currentShares}</td>
                        <td className="text-right mono">{calcResult.totalShares}</td>
                        <td className="text-right mono">+{Number(newShares)}</td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Avg. Price</td>
                        <td className="text-right mono">{fmt(currentAvg)}</td>
                        <td className="text-right mono" style={{ fontWeight: 700 }}>{fmt(calcResult.newAvg)}</td>
                        <td className={`text-right mono ${gainClass(-calcResult.change)}`}>
                          {calcResult.change >= 0 ? '+' : ''}{fmt(calcResult.change)} ({calcResult.changePercent >= 0 ? '+' : ''}{calcResult.changePercent.toFixed(2)}%)
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Total Invested</td>
                        <td className="text-right mono">{fmt(currentCost)}</td>
                        <td className="text-right mono">{fmt(calcResult.totalCost)}</td>
                        <td className="text-right mono">+{fmt(calcResult.buyCost)}</td>
                      </tr>
                      {ttmDiv > 0 && (
                        <tr>
                          <td style={{ fontWeight: 600 }}>TTM Yield @ Avg</td>
                          <td className="text-right mono">{ttmYieldAtAvg.toFixed(2)}%</td>
                          <td className="text-right mono" style={{ fontWeight: 700, color: '#805ad5' }}>
                            {calcResult.newAvg > 0 ? ((ttmDiv / calcResult.newAvg) * 100).toFixed(2) : '0.00'}%
                          </td>
                          <td className="text-right mono">
                            {calcResult.newAvg > 0 ? (((ttmDiv / calcResult.newAvg) * 100) - ttmYieldAtAvg).toFixed(2) : '0.00'}%
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'target' && (
          <>
            <div className="form-row">
              <label>
                Target Average Price
                <input type="number" step="0.01" min="0" value={targetAvg} onChange={e => setTargetAvg(e.target.value)} placeholder={`Current: ${fmt(currentAvg)}`} />
              </label>
              <label>
                Buy Price
                <input type="number" step="0.01" min="0" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="e.g. 120.00" />
              </label>
              <label>
                Commission %
                <input type="number" step="0.01" min="0" value={targetCommission} onChange={e => setTargetCommission(e.target.value)} placeholder="1.12" />
              </label>
            </div>

            {targetResult && (
              <div style={{ marginTop: '1rem' }}>
                {'error' in targetResult ? (
                  <div className="error-message">{targetResult.error}</div>
                ) : (
                  <div className="portfolio-table-wrap">
                    <table className="portfolio-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th className="text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Shares to Buy</td>
                          <td className="text-right mono" style={{ fontWeight: 700, fontSize: '1.1rem' }}>{targetResult.sharesToBuy}</td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Cost</td>
                          <td className="text-right mono">LKR {fmt(targetResult.cost)}</td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Total Shares After</td>
                          <td className="text-right mono">{targetResult.totalShares}</td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Actual New Average</td>
                          <td className="text-right mono" style={{ fontWeight: 700 }}>{fmt(targetResult.actualAvg)}</td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Total Invested</td>
                          <td className="text-right mono">LKR {fmt(targetResult.totalCost)}</td>
                        </tr>
                        {ttmDiv > 0 && (
                          <tr>
                            <td style={{ fontWeight: 600 }}>TTM Yield @ New Avg</td>
                            <td className="text-right mono" style={{ fontWeight: 700, color: '#805ad5' }}>
                              {targetResult.actualAvg > 0 ? ((ttmDiv / targetResult.actualAvg) * 100).toFixed(2) : '0.00'}%
                              <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                                (was {ttmYieldAtAvg.toFixed(2)}%)
                              </span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
