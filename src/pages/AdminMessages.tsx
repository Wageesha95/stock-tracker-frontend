import { useEffect, useState } from 'react';
import { getAdminMessages, markMessageRead, deleteMessage, replyToMessage, Message } from '../api';

// Notify the navbar badge that unread counts may have changed.
const notifyUpdated = () => window.dispatchEvent(new Event('admin-messages-updated'));

export default function AdminMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getAdminMessages().then(setMessages).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleMarkRead = async (m: Message) => {
    if (m.read) return;
    try {
      const updated = await markMessageRead(m.id);
      setMessages(prev => prev.map(x => x.id === m.id ? updated : x));
      notifyUpdated();
    } catch (err) {
      console.error('Failed to mark message read', err);
    }
  };

  const handleReply = async (id: string) => {
    const text = (replyText[id] || '').trim();
    if (text === '' || replying) return;
    setReplying(id);
    try {
      const updated = await replyToMessage(id, text);
      setMessages(prev => prev.map(x => x.id === id ? updated : x));
      setReplyText(prev => ({ ...prev, [id]: '' }));
      notifyUpdated();
    } catch (err) {
      console.error('Failed to send reply', err);
    } finally {
      setReplying(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    try {
      await deleteMessage(id);
      setMessages(prev => prev.filter(x => x.id !== id));
      notifyUpdated();
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  const unreadCount = messages.filter(m => !m.read).length;
  const visible = filter === 'unread' ? messages.filter(m => !m.read) : messages;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0 }}>Messages</h1>
          <div className="segmented-control">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All ({messages.length})</button>
            <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread ({unreadCount})</button>
          </div>
        </div>
        <button
          onClick={load}
          style={{
            background: 'transparent', border: '1.5px solid var(--border-input)', borderRadius: '8px',
            padding: '0.35rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)',
          }}
          title="Refresh"
        >{'↻'} Refresh</button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : visible.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>
          {filter === 'unread' ? 'No unread messages.' : 'No messages yet.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {visible.map(m => (
            <div
              key={m.id}
              onClick={() => handleMarkRead(m)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderLeft: `4px solid ${m.read ? 'var(--border-color)' : '#3182ce'}`,
                borderRadius: '8px', padding: '0.85rem 1rem',
                boxShadow: 'var(--shadow-card)',
                cursor: m.read ? 'default' : 'pointer',
              }}
              title={m.read ? '' : 'Click to mark as read'}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700 }}>{m.fromUsername}</span>
                  {!m.read && <span className="gain-pill gain-pill-neutral" style={{ fontSize: '0.62rem' }}>New</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(m.createdAt).toLocaleString()}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(m.id); }}
                    className="btn-delete"
                    style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem' }}
                  >Delete</button>
                </div>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.content}
              </div>

              {m.replies && m.replies.length > 0 && (
                <div style={{ marginTop: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {m.replies.map((r, i) => (
                    <div key={i} style={{ background: 'var(--bg-input)', borderRadius: '6px', padding: '0.45rem 0.6rem', marginLeft: '1rem' }}>
                      <div style={{ fontSize: '0.7rem', color: '#3182ce', fontWeight: 700, marginBottom: '0.2rem' }}>
                        {'↳'} {r.fromUsername} (you)
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {r.content}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }} onClick={e => e.stopPropagation()}>
                <textarea
                  value={replyText[m.id] || ''}
                  onChange={e => setReplyText(prev => ({ ...prev, [m.id]: e.target.value }))}
                  placeholder="Write a reply..."
                  rows={1}
                  maxLength={2000}
                  style={{
                    flex: 1, boxSizing: 'border-box', padding: '0.45rem 0.6rem', borderRadius: '6px',
                    border: '1px solid var(--border-input)', background: 'var(--bg-input)',
                    color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={() => handleReply(m.id)}
                  disabled={(replyText[m.id] || '').trim() === '' || replying === m.id}
                  style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                >{replying === m.id ? 'Sending...' : 'Reply'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
