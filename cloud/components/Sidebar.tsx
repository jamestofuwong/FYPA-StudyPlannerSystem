'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_SECTIONS = [
  {
    label: 'Planner Data',
    items: [
      { href: '/planners', label: 'Study Planners', icon: GridIcon },
      { href: '/history', label: 'Parse History', icon: ClockIcon },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      minWidth: 'var(--sidebar-width)',
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--sidebar-border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    }}>
      <nav style={{ flex: 1, padding: '16px 0' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ marginBottom: 8 }}>
            <div style={{
              padding: '4px 20px 8px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
            }}>
              {section.label}
            </div>
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '7px 20px',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                    borderLeft: active ? '3px solid var(--sidebar-active-border)' : '3px solid transparent',
                    background: active ? 'var(--orange-light)' : 'transparent',
                    transition: 'background 0.1s, color 0.1s',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text-hover)';
                      (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)';
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }
                  }}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '14px 20px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
        lineHeight: 1.6,
      }}>
        <div>Sync: daily at 08:00</div>
        <div>Last run: 10 May 2025</div>
      </div>
    </aside>
  );
}

function GridIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
