import { useEffect, useState, useRef } from 'react';
import { getBrokers, getUserSettings, updateSelectedBrokers, updateSelectedDataBrokers, updateTableColumns, clearAllCache, BrokerData } from '../api';
import { NO_BROKER } from '../utils/brokers';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const TABLE_COLUMN_OPTIONS: Record<string, { key: string; label: string }[]> = {
  portfolio: [
    { key: 'sharesHeld', label: 'Shares' },
    { key: 'avgBuyPrice', label: 'Avg Buy' },
    { key: 'lastTrade', label: 'Last Trade' },
    { key: 'currentValue', label: 'Value' },
    { key: 'totalInvested', label: 'Invested' },
    { key: 'unrealizedGain', label: 'Unrealized' },
    { key: 'unrealizedGainPercent', label: 'Gain %' },
    { key: 'unrealizedDayGain', label: 'Day Gain' },
    { key: 'changePercent', label: 'Day %' },
  ],
  watchlist: [
    { key: 'sharesHeld', label: 'Shares' },
    { key: 'avgBuyPrice', label: 'Avg Buy' },
    { key: 'lastTrade', label: 'Last Trade' },
    { key: 'changePercent', label: 'Change %' },
    { key: 'totalInvested', label: 'Invested' },
    { key: 'currentValue', label: 'Value' },
    { key: 'unrealizedGain', label: 'Unrealized' },
    { key: 'unrealizedGainPercent', label: 'Gain %' },
    { key: 'ytd', label: 'YTD %' },
    { key: 'ttmYield', label: 'TTM Yield' },
    { key: 'yieldAtYearLow', label: 'TTM @ YTD Low' },
    { key: 'nextDivDate', label: 'Next Div Date' },
    { key: 'lastDivAmount', label: 'Last Div Amount' },
    { key: 'nextAnnDate', label: 'Next Ann. Date' },
    { key: 'sparkline', label: 'Price Chart (YTD)' },
  ],
  sectors: [
    { key: 'sharesHeld', label: 'Shares' },
    { key: 'avgBuyPrice', label: 'Avg Buy Price' },
    { key: 'lastTrade', label: 'Last Trade' },
    { key: 'totalInvested', label: 'Invested' },
    { key: 'currentValue', label: 'Value' },
    { key: 'allocation', label: 'Allocation %' },
    { key: 'unrealizedGain', label: 'Unrealized Gain' },
    { key: 'unrealizedGainPercent', label: 'Gain %' },
    { key: 'unrealizedDayGain', label: 'Day Gain' },
    { key: 'changePercent', label: 'Change %' },
    { key: 'ttmYield', label: 'TTM Yield' },
  ],
  companies: [
    { key: 'name', label: 'Name' },
    { key: 'lastTrade', label: 'Last Trade' },
    { key: 'change', label: 'Change %' },
    { key: 'ytd', label: 'YTD %' },
    { key: 'ttmYield', label: 'TTM Yield' },
    { key: 'yield2025', label: '2025 XD Yield' },
    { key: 'yieldAtYearLow', label: 'TTM @ Year Low' },
    { key: 'sparkline', label: 'Price Chart (YTD)' },
    { key: 'industry', label: 'Industry' },
  ],
  upcomingDividends: [
    { key: 'yearsAppeared', label: 'Years (5yr)' },
    { key: 'avgAmountPerShare', label: 'Avg Amount' },
    { key: 'ttmYield', label: 'Yield (TTM)' },
    { key: 'lastXdDate', label: 'Last XD Date' },
    { key: 'dividendType', label: 'Type' },
    { key: 'announcementDate', label: 'Announced' },
    { key: 'lastTrade', label: 'Last Trade' },
    { key: 'yield2025', label: '2025 XD Yield' },
    { key: 'yieldAtYearLow', label: 'TTM Yield @ Year Low' },
  ],
  unrealized: [
    { key: 'sharesHeld', label: 'Shares' },
    { key: 'avgBuyPrice', label: 'Avg Buy' },
    { key: 'lastTrade', label: 'Last Trade' },
    { key: 'totalInvested', label: 'Invested' },
    { key: 'currentValue', label: 'Value' },
    { key: 'unrealizedGain', label: 'Unrealized' },
    { key: 'unrealizedGainPercent', label: 'Gain %' },
    { key: 'adjGain', label: 'Adj. Gain' },
    { key: 'adjGainPct', label: 'Adj. Gain %' },
  ],
};

const TABLE_LABELS: Record<string, string> = {
  portfolio: 'Portfolio',
  unrealized: 'Unrealized (Net / Profit / Loss)',
  watchlist: 'Watchlist',
  sectors: 'Sectors',
  companies: 'Companies',
  upcomingDividends: 'Upcoming Dividends',
};

const DEFAULT_COLUMNS: Record<string, string[]> = {
  portfolio: ['sharesHeld', 'avgBuyPrice', 'lastTrade', 'currentValue', 'totalInvested', 'unrealizedGain', 'unrealizedGainPercent', 'unrealizedDayGain', 'changePercent'],
  unrealized: ['sharesHeld', 'avgBuyPrice', 'lastTrade', 'totalInvested', 'currentValue', 'unrealizedGain', 'unrealizedGainPercent', 'adjGain', 'adjGainPct'],
  watchlist: ['sharesHeld', 'avgBuyPrice', 'lastTrade', 'changePercent', 'totalInvested', 'currentValue', 'unrealizedGain', 'unrealizedGainPercent'],
  sectors: ['sharesHeld', 'totalInvested', 'currentValue', 'allocation', 'unrealizedGain', 'unrealizedDayGain'],
  companies: ['name', 'lastTrade', 'change', 'ytd', 'ttmYield', 'industry'],
  upcomingDividends: ['yearsAppeared', 'avgAmountPerShare', 'ttmYield', 'lastXdDate', 'dividendType', 'announcementDate', 'lastTrade'],
};

export { TABLE_COLUMN_OPTIONS, DEFAULT_COLUMNS };

function MultiSelectDropdown({ label, options, selected, onChange }: {
  label: string;
  options: { key: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  };

  const selectedLabels = options.filter(o => selected.includes(o.key)).map(o => o.label);

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>{label}</label>
      <div className="multi-select-dropdown" ref={ref}>
        <div className="multi-select-trigger" onClick={() => setOpen(o => !o)}>
          {selectedLabels.length === 0
            ? <span style={{ color: 'var(--text-muted)' }}>Select columns...</span>
            : <span style={{ fontSize: '0.8rem' }}>{selectedLabels.join(', ')}</span>
          }
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>{open ? '\u25B2' : '\u25BC'}</span>
        </div>
        {open && (
          <div className="multi-select-options">
            {options.map(o => (
              <label key={o.key} className="multi-select-option">
                <input type="checkbox" checked={selected.includes(o.key)} onChange={() => toggle(o.key)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dataBrokerIds, setDataBrokerIds] = useState<string[]>([]);
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [brokerDropdownOpen, setBrokerDropdownOpen] = useState(false);
  const brokerDropdownRef = useRef<HTMLDivElement>(null);
  const [dataBrokerDropdownOpen, setDataBrokerDropdownOpen] = useState(false);
  const dataBrokerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([getBrokers(), getUserSettings()])
      .then(([b, s]) => {
        setBrokers(b);
        setSelectedIds(s.selectedBrokerIds || []);
        setDataBrokerIds(s.selectedDataBrokerIds || []);
        setTableColumns(s.tableColumns || {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  const toggleBroker = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSelectedBrokers(selectedIds);
      await updateSelectedDataBrokers(dataBrokerIds);
      await updateTableColumns(tableColumns);
      clearAllCache();
      onClose();
      window.location.reload();
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!brokerDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (brokerDropdownRef.current && !brokerDropdownRef.current.contains(e.target as Node)) {
        setBrokerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [brokerDropdownOpen]);

  useEffect(() => {
    if (!dataBrokerDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dataBrokerDropdownRef.current && !dataBrokerDropdownRef.current.contains(e.target as Node)) {
        setDataBrokerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dataBrokerDropdownOpen]);

  if (!open) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel">
        <div className="settings-header">
          <h2 style={{ margin: 0 }}>Settings</h2>
          <button onClick={onClose} className="settings-close" aria-label="Close">&times;</button>
        </div>

        {loading ? (
          <p style={{ padding: '1rem' }}>Loading...</p>
        ) : (
          <div className="settings-body">
            <div className="settings-section">
              <h3>My Brokers</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
                Select the brokers you use. If only one is selected, it will be auto-filled when uploading PDFs.
              </p>
              {brokers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No brokers configured yet.</p>
              ) : (
                <div className="multi-select-dropdown" ref={brokerDropdownRef}>
                  <div
                    className="multi-select-trigger"
                    onClick={() => setBrokerDropdownOpen(o => !o)}
                  >
                    {selectedIds.length === 0
                      ? <span style={{ color: 'var(--text-muted)' }}>Select brokers...</span>
                      : <span>{brokers.filter(b => selectedIds.includes(b.id)).map(b => b.name).join(', ')}</span>
                    }
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>{brokerDropdownOpen ? '\u25B2' : '\u25BC'}</span>
                  </div>
                  {brokerDropdownOpen && (
                    <div className="multi-select-options">
                      {brokers.map(b => (
                        <label key={b.id} className="multi-select-option">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(b.id)}
                            onChange={() => toggleBroker(b.id)}
                          />
                          <span>{b.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="settings-section">
              <h3>Filter Data by Broker</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
                Limit the Dashboard and Transactions to specific brokers. Leave all unchecked to show everything.
              </p>
              {brokers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No brokers configured yet.</p>
              ) : (
                <div className="multi-select-dropdown" ref={dataBrokerDropdownRef}>
                  <div
                    className="multi-select-trigger"
                    onClick={() => setDataBrokerDropdownOpen(o => !o)}
                  >
                    {dataBrokerIds.length === 0
                      ? <span style={{ color: 'var(--text-muted)' }}>All brokers</span>
                      : <span>{[
                          ...brokers.filter(b => dataBrokerIds.includes(b.id)).map(b => b.name),
                          ...(dataBrokerIds.includes(NO_BROKER) ? ['No broker'] : []),
                        ].join(', ')}</span>
                    }
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>{dataBrokerDropdownOpen ? '▲' : '▼'}</span>
                  </div>
                  {dataBrokerDropdownOpen && (
                    <div className="multi-select-options">
                      {brokers.map(b => (
                        <label key={b.id} className="multi-select-option">
                          <input
                            type="checkbox"
                            checked={dataBrokerIds.includes(b.id)}
                            onChange={() => setDataBrokerIds(prev => prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                          />
                          <span>{b.name}</span>
                        </label>
                      ))}
                      <label className="multi-select-option">
                        <input
                          type="checkbox"
                          checked={dataBrokerIds.includes(NO_BROKER)}
                          onChange={() => setDataBrokerIds(prev => prev.includes(NO_BROKER) ? prev.filter(x => x !== NO_BROKER) : [...prev, NO_BROKER])}
                        />
                        <span>No broker (manual entries)</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="settings-section">
              <h3>Table Columns</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
                Choose which columns to display in each table.
              </p>
              {Object.keys(TABLE_COLUMN_OPTIONS).map(tableKey => (
                <MultiSelectDropdown
                  key={tableKey}
                  label={TABLE_LABELS[tableKey]}
                  options={TABLE_COLUMN_OPTIONS[tableKey]}
                  selected={tableColumns[tableKey] || DEFAULT_COLUMNS[tableKey]}
                  onChange={cols => setTableColumns(prev => ({ ...prev, [tableKey]: cols }))}
                />
              ))}
            </div>

            <div className="settings-footer">
              <button onClick={onClose} className="btn-settings-cancel">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-settings-save">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
