import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
}

// A nav-bar dropdown that groups related links under a single trigger. On desktop
// it opens as a floating menu; on mobile (inside the hamburger column) it expands
// inline. Marks itself active when the current route matches one of its items.
export default function NavDropdown({ label, items, onNavigate }: {
  label: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = items.some(i => location.pathname === i.to || location.pathname.startsWith(i.to + '/'));

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className={`nav-dropdown${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className={`nav-dropdown-trigger${isActive ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {label}<span className="nav-dropdown-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="nav-dropdown-menu">
          {items.map(i => (
            <NavLink key={i.to} to={i.to} onClick={() => { setOpen(false); onNavigate?.(); }}>
              {i.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
