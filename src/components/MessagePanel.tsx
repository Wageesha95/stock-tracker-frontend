import { useEffect, useState } from 'react';
import { sendMessage, getMyMessages, invalidate, Message } from '../api';

interface MessagePanelProps {
  open: boolean;
  onClose: () => void;
}

export default function MessagePanel({ open, onClose }: MessagePanelProps) {
  const [content, setContent] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getMyMessages().then(setMessages).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    invalidate('my-messages');
    load();
  }, [open]);

  const handleSend = async () => {
    const trimmed = content.trim();
    if (trimmed === '' || sending) return;
    setSending(true);
    try {
      await sendMessage(trimmed);
      setContent('');
      invalidate('my-messages');
      load();
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel" style={{ width: 420, maxWidth: '95vw' }}>
        <div className="settings-header">
          <h2 style={{ margin: 0 }}>Message Admin</h2>
          <button onClick={onClose} className="settings-close" aria-label="Close">&times;</button>
        </div>
        <div className="settings-body">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
            Send a message to the administrator. Your sent messages appear below.
          </p>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your message..."
            rows={4}
            maxLength={2000}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem',
              borderRadius: '8px', border: '1px solid var(--border-input)',
              background: 'var(--bg-input)', color: 'var(--text-primary)',
              fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{content.length}/2000</span>
            <button onClick={handleSend} disabled={content.trim() === '' || sending}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>

          <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Sent Messages</h3>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
          ) : messages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No messages sent yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {messages.map(m => (
                <div key={m.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '8px', padding: '0.6rem 0.75rem',
                }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.content}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                    <span className={`gain-pill ${m.read ? 'gain-pill-up' : 'gain-pill-neutral'}`} style={{ fontSize: '0.62rem' }}>
                      {m.read ? 'Read' : 'Sent'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
