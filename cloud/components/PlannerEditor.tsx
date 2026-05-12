'use client';

import { useState } from 'react';
import type { Planner } from '../lib/mock-data';

interface Props {
  planner: Planner;
}

const INPUT_STYLE = {
  width: '100%',
  padding: '8px 11px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  outline: 'none',
  color: 'var(--text-primary)',
  background: '#fff',
} as const;

export default function PlannerEditor({ planner }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Planner['status']>(planner.status);
  const [majorName, setMajorName] = useState(planner.majorName);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 900);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '7px 16px',
          background: 'var(--orange)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--orange-hover)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--orange)'; }}
      >
        Edit Planner
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              width: 460,
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Orange stripe */}
            <div style={{ height: 3, background: 'linear-gradient(90deg, #F6821F, #FDBA74)' }} />

            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Edit Planner</span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              <Field label="Course Code">
                <input value={planner.courseCode} disabled style={{ ...INPUT_STYLE, background: 'var(--gray-light)', color: 'var(--text-muted)' }} />
              </Field>

              <Field label="Major Name">
                <input
                  value={majorName}
                  onChange={e => setMajorName(e.target.value)}
                  style={INPUT_STYLE}
                  onFocus={e => { e.target.style.borderColor = 'var(--orange)'; e.target.style.boxShadow = '0 0 0 3px var(--orange-light)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }}
                />
              </Field>

              <Field label="Status">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as Planner['status'])}
                  style={INPUT_STYLE}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="draft">Draft</option>
                </select>
              </Field>

              <div style={{
                display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: '10px 12px',
                background: 'var(--yellow-light)',
                border: '1px solid var(--yellow-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12, color: 'var(--yellow)',
                marginTop: 4,
              }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}>ⓘ</span>
                Semester and unit data can only be updated by re-parsing from the portal.
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex', gap: 8, justifyContent: 'flex-end',
              background: 'var(--surface-raised)',
            }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '7px 16px',
                  background: 'none',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13, cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '7px 20px',
                  background: saved ? 'var(--green)' : 'var(--orange)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {saved ? '✓ Saved' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
