import { useEffect, useState, useRef } from 'react';
import { getBrokers, getUserSettings, updateSelectedBrokers, BrokerData, UserSettingsData } from '../api';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [brokers, setBrokers] = useState<BrokerData[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([getBrokers(), getUserSettings()])
      .then(([b, s]) => {
        setBrokers(b);
        setSelectedIds(s.selectedBrokerIds || []);
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
      onClose();
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

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
                <div className="multi-select-dropdown" ref={dropdownRef}>
                  <div
                    className="multi-select-trigger"
                    onClick={() => setDropdownOpen(o => !o)}
                  >
                    {selectedIds.length === 0
                      ? <span style={{ color: 'var(--text-muted)' }}>Select brokers...</span>
                      : <span>{brokers.filter(b => selectedIds.includes(b.id)).map(b => b.name).join(', ')}</span>
                    }
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>{dropdownOpen ? '\u25B2' : '\u25BC'}</span>
                  </div>
                  {dropdownOpen && (
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
