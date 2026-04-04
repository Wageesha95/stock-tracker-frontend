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

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="search-bar"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={selected ? `${selected.code} - ${selected.name}` : 'Search company...'}
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
                background: c.code === value ? 'var(--bg-dropdown-hover)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-dropdown-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = c.code === value ? 'var(--bg-dropdown-hover)' : 'transparent')}
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
