import { useEffect, useMemo, useState } from 'react';
import { getNotes, getNotesByCompany, createNote, updateNote, deleteNote, Note } from '../api';
import { Company } from '../types';
import ActionMenu from './ActionMenu';
import CompanyAvatar from './CompanyAvatar';
import CompanySearchSelect from './CompanySearchSelect';

interface Props {
  companyCode?: string;
  companies?: Company[];
}

export default function NotesView({ companyCode, companies }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newCompany, setNewCompany] = useState(companyCode || '');
  const [saving, setSaving] = useState(false);

  // Filters (only when no fixed company)
  const [filterCompany, setFilterCompany] = useState('');
  const [filterKey, setFilterKey] = useState('');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = companyCode ? await getNotesByCompany(companyCode) : await getNotes();
      setNotes(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load notes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCode]);

  useEffect(() => {
    if (companyCode) setNewCompany(companyCode);
  }, [companyCode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = companyCode || newCompany;
    if (!code || !newValue.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createNote({ companyCode: code, key: newKey.trim() || undefined, value: newValue.trim() });
      setNewKey('');
      setNewValue('');
      if (!companyCode) setNewCompany('');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setEditKey(n.key);
    setEditValue(n.value);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditKey('');
    setEditValue('');
  };

  const handleUpdate = async (id: string) => {
    if (!editValue.trim()) return;
    try {
      await updateNote(id, { key: editKey.trim() || undefined, value: editValue.trim() });
      cancelEdit();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to update note.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    try {
      await deleteNote(id);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete note.');
    }
  };

  const uniqueKeys = useMemo(() => Array.from(new Set(notes.map(n => n.key))).sort(), [notes]);
  const uniqueCompanies = useMemo(() => Array.from(new Set(notes.map(n => n.companyCode))).sort(), [notes]);

  const filtered = useMemo(() => {
    return notes.filter(n => {
      if (filterCompany && n.companyCode !== filterCompany) return false;
      if (filterKey && n.key !== filterKey) return false;
      return true;
    });
  }, [notes, filterCompany, filterKey]);

  const fmtDate = (s: string) => {
    try {
      return new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return s;
    }
  };

  return (
    <div>
      {error && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{error}</div>}

      {/* Add form */}
      <form onSubmit={handleCreate} className="form-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {!companyCode && companies && (
            <div style={{ minWidth: '200px', flex: '0 0 200px' }}>
              <CompanySearchSelect companies={companies} value={newCompany} onChange={setNewCompany} />
            </div>
          )}
          <input
            type="text"
            placeholder="Key (optional, default 'note')"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            style={{ flex: '0 0 200px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
          <input
            type="text"
            placeholder="Value"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            required
            style={{ flex: 1, minWidth: '240px', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          />
          <button type="submit" className="btn-upload" disabled={saving || !newValue.trim() || (!companyCode && !newCompany)}>
            {saving ? 'Saving...' : 'Add Note'}
          </button>
        </div>
      </form>

      {/* Filters */}
      {!companyCode && notes.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            Company
            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
              <option value="">All ({uniqueCompanies.length})</option>
              {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            Key
            <select value={filterKey} onChange={e => setFilterKey(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
              <option value="">All</option>
              {uniqueKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          {(filterCompany || filterKey) && (
            <button type="button" className="btn-reset" onClick={() => { setFilterCompany(''); setFilterKey(''); }}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Clear</button>
          )}
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {filtered.length} of {notes.length}
          </span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No notes yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(n => (
            <div key={n.id} className="form-card" style={{ padding: '0.75rem' }}>
              {editingId === n.id ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input type="text" value={editKey} onChange={e => setEditKey(e.target.value)}
                    style={{ flex: '0 0 160px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                    style={{ flex: 1, minWidth: '200px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  <button className="btn-upload" onClick={() => handleUpdate(n.id)} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>Save</button>
                  <button className="btn-reset" onClick={cancelEdit} style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {!companyCode && (
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flex: '0 0 auto' }}>
                      <CompanyAvatar code={n.companyCode} size={20} />
                      <span className="company-code" style={{ fontWeight: 600 }}>{n.companyCode}</span>
                    </div>
                  )}
                  {!filterKey && (
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', background: 'var(--bg-segmented)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                      {n.key}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: '200px', wordBreak: 'break-word' }}>{n.value}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtDate(n.updatedAt)}</span>
                  <ActionMenu actions={[
                    { label: 'Edit', onClick: () => startEdit(n) },
                    { label: 'Delete', onClick: () => handleDelete(n.id), danger: true },
                  ]} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
