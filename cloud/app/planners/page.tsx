'use client';

import Link from 'next/link';
import { MOCK_PLANNERS, type Planner } from '../../lib/mock-data';

const STATUS_MAP: Record<Planner['status'], { dot: string; label: string; color: string }> = {
  active:   { dot: '#15803D', label: 'Active',   color: 'var(--green)' },
  archived: { dot: '#A3A3A3', label: 'Archived', color: 'var(--gray)' },
  draft:    { dot: '#D97706', label: 'Draft',    color: 'var(--yellow)' },
};

function StatusDot({ status }: { status: Planner['status'] }) {
  const s = STATUS_MAP[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: s.color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

export default function PlannersPage() {
  const active = MOCK_PLANNERS.filter(p => p.status === 'active').length;
  const courses = new Set(MOCK_PLANNERS.map(p => p.courseCode)).size;
  const total = MOCK_PLANNERS.length;

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em' }}>
            Study Planners
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            All planners parsed from the university portal.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 200px))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Planners', value: total, note: `${active} active` },
          { label: 'Courses', value: courses, note: 'unique programmes' },
          { label: 'Last Sync', value: '10 May', note: '08:21 · 2 new' },
        ].map(({ label, value, note }) => (
          <div key={label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}>
        {/* Table toolbar */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface-raised)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>All Planners</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} records</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
              {['Course', 'Major', 'Intake', 'Units', 'Credits', 'Status', 'Parsed', ''].map((h, i) => (
                <th key={i} style={{
                  padding: '9px 16px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_PLANNERS.map((planner, idx) => (
              <tr
                key={planner.id}
                style={{ borderBottom: idx < MOCK_PLANNERS.length - 1 ? '1px solid var(--border)' : undefined }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{planner.courseName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{planner.courseCode}</div>
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{planner.majorName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{planner.majorCode}</div>
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {planner.intakeYear}
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {planner.totalUnits}
                </td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {planner.totalCredits}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <StatusDot status={planner.status} />
                </td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(planner.parsedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <Link href={`/planners/${planner.id}`} style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    background: 'var(--orange)',
                    color: '#fff',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
