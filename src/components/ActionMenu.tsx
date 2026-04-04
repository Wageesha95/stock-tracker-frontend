import { useState, useRef, useEffect } from 'react';

interface Action {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export default function ActionMenu({ actions }: { actions: Action[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="action-menu" ref={ref}>
      <button className="action-menu-trigger" onClick={() => setOpen(!open)}>
        &#8942;
      </button>
      {open && (
        <div className="action-menu-dropdown">
          {actions.map((a, i) => (
            <button
              key={i}
              className={`action-menu-item${a.danger ? ' action-menu-danger' : ''}`}
              onClick={() => { a.onClick(); setOpen(false); }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
