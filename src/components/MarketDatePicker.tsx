import { useState, useRef, useEffect } from 'react';

interface Props {
  availableDates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
  align?: 'left' | 'right';
}

export default function MarketDatePicker({ availableDates, selectedDate, onSelect, align = 'right' }: Props) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);

  const availableSet = new Set(availableDates);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const fmt = (d: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'transparent',
          border: '1.5px solid var(--border-input)',
          borderRadius: '8px',
          padding: '0.35rem 0.5rem',
          cursor: 'pointer',
          fontSize: '1rem',
          lineHeight: 1,
          color: 'var(--text-muted)',
        }}
        title="Select a trading date"
      >
        <span className="calendar-icon-emoji">{'\uD83D\uDCC5'}</span>
        <svg className="calendar-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', ...(align === 'left' ? { left: 0 } : { right: 0 }), marginTop: '0.25rem', zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          padding: '0.75rem', width: '260px', maxWidth: 'calc(100vw - 2rem)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <button onClick={prevMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem', color: 'var(--text-muted)' }}>&lsaquo;</button>
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{monthNames[viewMonth]} {viewYear}</span>
            <button onClick={nextMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem', color: 'var(--text-muted)' }}>&rsaquo;</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d} style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, padding: '0.2rem 0' }}>{d}</div>
            ))}
            {days.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const dateStr = fmt(day);
              const available = availableSet.has(dateStr);
              const isSelected = dateStr === selectedDate;
              return (
                <div
                  key={dateStr}
                  onClick={() => { if (available) { onSelect(dateStr); setOpen(false); } }}
                  style={{
                    padding: '0.3rem 0',
                    fontSize: '0.78rem',
                    borderRadius: '6px',
                    cursor: available ? 'pointer' : 'default',
                    background: isSelected ? '#3182ce' : 'transparent',
                    color: isSelected ? 'white' : available ? '#38a169' : 'var(--text-muted)',
                    fontWeight: available ? 700 : 400,
                    opacity: available ? 1 : 0.35,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (available && !isSelected) (e.currentTarget.style.background = 'rgba(56, 161, 105, 0.12)'); }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget.style.background = 'transparent'); }}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
