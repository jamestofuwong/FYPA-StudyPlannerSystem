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

      {/* Right — status pill + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--green)',
            display: 'inline-block',
            boxShadow: '0 0 0 2px var(--green-border)',
          }} />
          Scheduler active
        </div>
        <div style={{
          width: 30, height: 30,
          borderRadius: '50%',
          background: 'var(--orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
        }}>
          A
        </div>
      </div>
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
