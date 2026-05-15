'use client';

import { use } from 'react';
import Link from 'next/link';
import { MOCK_PLANNERS, type UnitType } from '../../../lib/mock-data';
import PlannerEditor from '../../../components/PlannerEditor';

const TYPE_CONFIG: Record<UnitType, { label: string; bg: string; color: string }> = {
  core:                { label: 'Core',              bg: 'var(--blue-light)',   color: 'var(--blue)' },
  elective:            { label: 'Elective',          bg: 'var(--purple-light)', color: 'var(--purple)' },
  mpu:                 { label: 'MPU / TITAS',       bg: 'var(--green-light)',  color: 'var(--green)' },
  'industrial-training': { label: 'Industrial Training', bg: 'var(--yellow-light)', color: 'var(--yellow)' },
};

export default function PlannerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const planner = MOCK_PLANNERS.find(p => p.id === id);
  if (!planner) return (
    <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>
      Planner not found.
    </div>
  );

  const hasSemesters = planner.semesters.length > 0;

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 13 }}>
        <Link href="/planners" style={{ color: 'var(--orange)', fontWeight: 500 }}>Planners</Link>
        <ChevronIcon />
        <span style={{ color: 'var(--text-muted)' }}>{planner.majorName}</span>
      </div>

      {/* Hero card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        {/* Orange top stripe */}
        <div style={{ height: 4, background: 'linear-gradient(90deg, #F6821F, #FDBA74)' }} />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>
                {planner.courseName}
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                {planner.majorName} &middot; {planner.majorCode} &middot; Intake {planner.intakeYear}
              </p>

              {/* Meta pills */}
              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
                {[
                  ['Course Code', planner.courseCode],
                  ['Major Code', planner.majorCode],
                  ['Total Units', planner.totalUnits],
                  ['Total Credits', planner.totalCredits],
                  ['Semesters', planner.totalSemesters],
                ].map(([label, value], i, arr) => (
                  <div key={label as string} style={{
                    paddingRight: 24,
                    marginRight: 24,
                    borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, fontFamily: typeof value === 'string' && value.includes('-') ? 'monospace' : undefined }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <PlannerEditor planner={planner} />
          </div>
        </div>
      </div>

      {/* Semester tables */}
      {hasSemesters ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {planner.semesters.map((sem) => {
            const semCredits = sem.units.reduce((s, u) => s + u.credits, 0);
            return (
              <div key={`${sem.year}-${sem.semester}`} style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface-raised)',
                }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    Year {sem.year} &middot; Semester {sem.semester}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {sem.units.length} units &middot; {semCredits} credits
                  </span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Code', 'Unit Name', 'Credits', 'Type'].map((h) => (
                        <th key={h} style={{
                          padding: '8px 16px',
                          textAlign: 'left',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--text-muted)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sem.units.map((unit, idx) => {
                      const cfg = TYPE_CONFIG[unit.type];
                      return (
                        <tr
                          key={unit.code}
                          style={{ borderBottom: idx < sem.units.length - 1 ? '1px solid var(--border)' : undefined }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {unit.code}
                          </td>
                          <td style={{ padding: '9px 16px', fontSize: 13 }}>{unit.name}</td>
                          <td style={{ padding: '9px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{unit.credits}</td>
                          <td style={{ padding: '9px 16px' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 600,
                              background: cfg.bg,
                              color: cfg.color,
                            }}>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '56px 24px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No semester data</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>This planner has not been fully parsed yet.</div>
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
