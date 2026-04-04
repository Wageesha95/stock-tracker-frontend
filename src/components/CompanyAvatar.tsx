import { useState, useEffect } from 'react';

const COLORS = [
  '#e53e3e', '#dd6b20', '#d69e2e', '#38a169', '#319795',
  '#3182ce', '#5a67d8', '#805ad5', '#d53f8c', '#2c7a7b',
  '#2b6cb0', '#6b46c1', '#b83280', '#c05621', '#2f855a',
];

function getColor(code: string) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = code.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Global cache: tracks which logos exist and which don't
const logoCache: Record<string, 'ok' | 'fail'> = {};

export default function CompanyAvatar({ code, size = 32 }: { code: string; size?: number }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'fail'>(
    logoCache[code] || 'loading'
  );
  const letters = code.replace(/\..+/, '').slice(0, 2).toUpperCase();
  const bg = getColor(code);
  const fontSize = size * 0.4;
  const logoSrc = `/logos/${code}.png`;

  useEffect(() => {
    if (logoCache[code]) {
      setStatus(logoCache[code]);
      return;
    }
    const img = new Image();
    img.onload = () => { logoCache[code] = 'ok'; setStatus('ok'); };
    img.onerror = () => { logoCache[code] = 'fail'; setStatus('fail'); };
    img.src = logoSrc;
  }, [code, logoSrc]);

  if (status === 'ok') {
    return (
      <img
        className="company-avatar"
        src={logoSrc}
        alt={code}
        style={{
          width: size,
          height: size,
          minWidth: size,
          borderRadius: '8px',
          objectFit: 'contain',
          background: 'white',
        }}
      />
    );
  }

  return (
    <div
      className="company-avatar"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: '8px',
        background: status === 'loading' ? '#e2e8f0' : bg,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.5px',
      }}
    >
      {status === 'loading' ? '' : letters}
    </div>
  );
}
