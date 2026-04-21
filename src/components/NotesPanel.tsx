import { useEffect, useRef, useState } from 'react';
import { getCompanies } from '../api';
import { Company } from '../types';
import NotesView from './NotesView';

interface NotesPanelProps {
  open: boolean;
  onClose: () => void;
  companyCode?: string;
}

const WIDTH_STORAGE_KEY = 'notesPanelWidth';
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 480;

export default function NotesPanel({ open, onClose, companyCode }: NotesPanelProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [width, setWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    getCompanies().then(setCompanies).catch(() => {});
  }, [open]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxWidth = window.innerWidth - 40;
      const next = Math.max(MIN_WIDTH, Math.min(maxWidth, window.innerWidth - e.clientX));
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [width]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!open) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel" style={{ width, maxWidth: '95vw' }}>
        <div
          onMouseDown={startDrag}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '6px',
            cursor: 'col-resize',
            background: 'transparent',
            zIndex: 1,
          }}
          title="Drag to resize"
        />
        <div className="settings-header">
          <h2 style={{ margin: 0 }}>Notes{companyCode ? ` — ${companyCode}` : ''}</h2>
          <button onClick={onClose} className="settings-close" aria-label="Close">&times;</button>
        </div>
        <div className="settings-body">
          <NotesView companyCode={companyCode} companies={companies} />
        </div>
      </div>
    </>
  );
}
