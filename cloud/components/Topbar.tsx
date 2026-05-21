'use client';

export default function Topbar() {
  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--topbar-bg)',
      borderBottom: '1px solid var(--topbar-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* Left — logo + app name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CloudIcon />
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Study Planner Sync System
        </span>
        <span style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          borderLeft: '1px solid var(--border)',
          paddingLeft: 10,
          marginLeft: 2,
        }}>
          Cloud Admin
        </span>
      </div>

      {/* Right — logout */}
      <button
        onClick={async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        }}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 12px',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </header>
  );
}

function CloudIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="8" fill="#F6821F" />
      <path d="M28 22.5a5 5 0 0 0-4.9-5.97 7 7 0 1 0-9.1 9.47H28v-3.5z" fill="#fff" />
    </svg>
  );
}
