'use client';

import { useState } from 'react';

interface Props {
  logs: string[];
}

export default function RunLogs({ logs }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '8px 20px',
          background: 'none',
          border: 'none',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
      >
        <span style={{
          display: 'inline-block',
          transform: open ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
          fontSize: 14,
          lineHeight: 1,
        }}>
          ›
        </span>
        {open ? 'Collapse' : 'Expand'} logs
        <span style={{
          marginLeft: 4,
          padding: '1px 6px',
          background: 'var(--gray-light)',
          borderRadius: 20,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          {logs.length}
        </span>
      </button>

      {open && (
        <div style={{
          margin: '0 20px 16px',
          border: '1px solid #2D2D2D',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
        }}>
          {/* Terminal header */}
          <div style={{
            background: '#1D1D1D',
            padding: '6px 12px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {['#FF5F56', '#FFBD2E', '#27C93F'].map((c, i) => (
              <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
            ))}
            <span style={{ fontSize: 11, color: '#525252', marginLeft: 6 }}>parse.log</span>
          </div>

          {/* Log lines */}
          <div style={{
            background: '#111111',
            padding: '12px 16px',
            fontFamily: 'Menlo, Consolas, Monaco, monospace',
            fontSize: 11,
            lineHeight: 1.75,
            color: '#A3A3A3',
            overflowX: 'auto',
          }}>
            {logs.map((line, i) => {
              const color =
                line.includes('ERROR')       ? '#FCA5A5' :
                line.includes('WARN')        ? '#FDE68A' :
                line.includes('NEW') || line.includes('successfully') || line.includes('complete') ? '#86EFAC' :
                line.includes('UPDATED')     ? '#93C5FD' :
                '#A3A3A3';
              return (
                <div key={i} style={{ color, display: 'flex', gap: 16 }}>
                  <span style={{ color: '#3D3D3D', flexShrink: 0, userSelect: 'none' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{line}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
