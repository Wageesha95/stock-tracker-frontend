import { useState } from 'react';
import { Company } from '../types';
import CompanyAvatar from './CompanyAvatar';

interface Props {
  companies: Company[];
  value: string;
  onChange: (code: string) => void;
}

export default function CompanySearchSelect({ companies, value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const selected = companies.find(c => c.code === value);
  const s = search.toLowerCase();
  const matches = search.length > 0
    ? companies.filter(c => c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)).slice(0, 8)
    : companies.slice(0, 8);

  if (selected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.45rem 0.75rem', background: 'var(--bg-thead)',
        borderRadius: '8px', border: '1.5px solid var(--border-input)',
      }}>
        <CompanyAvatar code={selected.code} size={24} />
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selected.code}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flex: 1 }}>{selected.name}</span>
        <button
          type="button"
          onClick={() => { onChange(''); setSearch(''); }}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '1.1rem', padding: '0 0.25rem',
            lineHeight: 1,
          }}
          title="Clear"
        >&times;</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="search-bar"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search company..."
        style={{ width: '100%' }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '8px', boxShadow: 'var(--shadow-dropdown)',
          maxHeight: '250px', overflow: 'auto', marginTop: '0.25rem',
        }}>
          {matches.map(c => (
            <div
              key={c.code}
              onMouseDown={() => { onChange(c.code); setSearch(''); setOpen(false); }}
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
      )}
    </div>
  );
}
