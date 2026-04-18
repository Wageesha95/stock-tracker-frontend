import { useState, useRef, useEffect, useLayoutEffect } from 'react';

interface Action {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export default function ActionMenu({ actions }: { actions: Action[] }) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !dropdownRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = dropdownRef.current.offsetHeight;

    let bottomBound = window.innerHeight;
    let topBound = 0;
    let el: HTMLElement | null = triggerRef.current.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      const clips = style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible';
      if (clips) {
        const r = el.getBoundingClientRect();
        if (r.bottom < bottomBound) bottomBound = r.bottom;
        if (r.top > topBound) topBound = r.top;
      }
      el = el.parentElement;
    }

    const spaceBelow = bottomBound - triggerRect.bottom;
    const spaceAbove = triggerRect.top - topBound;
    setFlipUp(spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow);
  }, [open]);

  return (
    <div className="action-menu" ref={ref}>
      <button ref={triggerRef} className="action-menu-trigger" onClick={() => setOpen(!open)}>
        &#8942;
      </button>
      {open && (
        <div ref={dropdownRef} className={`action-menu-dropdown${flipUp ? ' action-menu-dropdown-up' : ''}`}>
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
