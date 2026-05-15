'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortalPlannerEntry {
  id: string;
  year: string;
  unit_code: string;
  course_name: string;
  intake_month: string;
  program_level: string | null;
  pdf_url: string;
  last_updated: string | null;
  last_updated_iso: string | null;
  first_seen_at: string;
  last_synced_at: string;
  planner_template_id: string | null;
}

interface TemplateUnit {
  id: string;
  unit_id: string | null;
  category: string;
  year_level: number;
  semester: number;
  unit: {
    id: string;
    unit_code: string;
    unit_name: string;
  } | null;
}

interface ElectiveGroupUnit {
  unit: { id: string; unit_code: string; unit_name: string };
}

interface ElectiveGroup {
  id: string;
  units: ElectiveGroupUnit[];
}

interface PlannerTemplate {
  id: string;
  intake_year: number;
  intake_month: number | null;
  course_type: string;
  duration_semesters: number;
  core_count: number | null;
  core_cp: number | null;
  major_count: number | null;
  major_cp: number | null;
  elective_count: number | null;
  elective_cp: number | null;
  wil_count: number | null;
  wil_cp: number | null;
  course: { id: string; code: string; name: string };
  major: { id: string; name: string } | null;
  units: TemplateUnit[];
  elective_groups: ElectiveGroup[];
}

interface ApiResponse {
  entry: PortalPlannerEntry;
  template: PlannerTemplate | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const CATEGORY_LABEL: Record<string, string> = {
  core: 'Core',
  major_core: 'Major Core',
  prescribed_elective: 'Prescribed Elective',
  elective: 'Free Elective',
  wil: 'WIL',
  mpu: 'MPU',
};

const CATEGORY_COLOR: Record<string, string> = {
  core: '#2563EB',
  major_core: '#7C3AED',
  prescribed_elective: '#0891B2',
  elective: '#059669',
  wil: '#D97706',
  mpu: '#64748B',
};

// Group TemplateUnits by year_level then semester
function groupBySemester(units: TemplateUnit[]): Map<number, Map<number, TemplateUnit[]>> {
  const byYear = new Map<number, Map<number, TemplateUnit[]>>();
  for (const u of units) {
    if (!byYear.has(u.year_level)) byYear.set(u.year_level, new Map());
    const bySem = byYear.get(u.year_level)!;
    if (!bySem.has(u.semester)) bySem.set(u.semester, []);
    bySem.get(u.semester)!.push(u);
  }
  return byYear;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryPill({ category }: { category: string }) {
  const label = CATEGORY_LABEL[category] ?? category;
  const color = CATEGORY_COLOR[category] ?? '#A3A3A3';
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      color,
      background: `${color}18`,
      padding: '2px 6px',
      borderRadius: 4,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function SemesterTable({ units }: { units: TemplateUnit[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
          {['Unit Code', 'Unit Name', 'Type'].map(h => (
            <th key={h} style={{
              padding: '7px 12px', textAlign: 'left',
              fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {units.map((u, i) => (
          <tr
            key={u.id}
            style={{ borderBottom: i < units.length - 1 ? '1px solid var(--border)' : undefined }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <td style={{ padding: '8px 12px' }}>
              {u.unit ? (
                <code style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--gray-light)', padding: '2px 5px', borderRadius: 3 }}>
                  {u.unit.unit_code}
                </code>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Elective slot</span>
              )}
            </td>
            <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>
              {u.unit?.unit_name ?? '—'}
            </td>
            <td style={{ padding: '8px 12px' }}>
              <CategoryPill category={u.category} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RequirementPill({ label, count, cp }: { label: string; count: number | null; cp: number | null }) {
  if (!count && !cp) return null;
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 14px',
      textAlign: 'center',
      minWidth: 80,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {count != null && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{count} units</div>}
      {cp != null && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{cp} CP</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlannerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/planners/${id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((res: ApiResponse | null) => {
        if (res) { setData(res); setLoading(false); }
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Planner not found</div>
        <Link href="/planners" style={{ color: 'var(--orange)', fontSize: 13 }}>← Back to Planners</Link>
      </div>
    );
  }

  const { entry, template } = data;

  const meta: Array<[string, string]> = [
    ['Unit Code', entry.unit_code],
    ['Year', entry.year],
    ['Intake', entry.intake_month || '—'],
    ['Program Level', entry.program_level || '—'],
    ['Last Updated', entry.last_updated || '—'],
    ['First Seen', formatDate(entry.first_seen_at)],
    ['Last Synced', formatDate(entry.last_synced_at)],
  ];

  const grouped = template ? groupBySemester(template.units) : null;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1024 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: 13 }}>
        <Link href="/planners" style={{ color: 'var(--orange)', fontWeight: 500 }}>Planners</Link>
        <ChevronIcon />
        <span style={{ color: 'var(--text-muted)' }}>{entry.unit_code}</span>
      </div>

      {/* Hero card */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg, #F6821F, #FDBA74)' }} />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {entry.course_name}
                </h1>
                {template && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--green)',
                    background: 'var(--green-light)', padding: '2px 8px',
                    borderRadius: 20, flexShrink: 0,
                  }}>
                    Parsed
                  </span>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                {entry.unit_code} &middot; {entry.year} &middot; {entry.intake_month || 'No intake info'}
              </p>

              {/* Meta pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                {meta.map(([label, value], i) => (
                  <div key={label} style={{
                    paddingRight: 24,
                    marginRight: 24,
                    marginBottom: 8,
                    borderRight: i < meta.length - 1 ? '1px solid var(--border)' : undefined,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PDF link */}
            <a
              href={entry.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                background: 'var(--orange)',
                color: '#fff',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 13,
                flexShrink: 0,
                textDecoration: 'none',
              }}
            >
              <PdfIcon />
              View PDF
            </a>
          </div>
        </div>
      </div>

      {/* Template requirements summary */}
      {template && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Requirements
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <RequirementPill label="Core" count={template.core_count} cp={template.core_cp} />
            <RequirementPill label="Major" count={template.major_count} cp={template.major_cp} />
            <RequirementPill label="Elective" count={template.elective_count} cp={template.elective_cp} />
            <RequirementPill label="WIL" count={template.wil_count} cp={template.wil_cp} />
            <div style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 14px',
              textAlign: 'center',
              minWidth: 80,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>Duration</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{template.duration_semesters}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>semesters</div>
            </div>
          </div>
        </div>
      )}

      {/* Unit schedule — year / semester breakdown */}
      {template && grouped && grouped.size > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Array.from(grouped.entries()).map(([yearLevel, bySem]) => (
            <div key={yearLevel}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Year {yearLevel}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from(bySem.entries()).map(([sem, semUnits]) => (
                  <div key={sem} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '8px 14px',
                      background: 'var(--surface-raised)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Semester {sem}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {semUnits.length} unit(s)
                      </span>
                    </div>
                    <SemesterTable units={semUnits} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Elective pool */}
          {template.elective_groups.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Elective Pool
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              {template.elective_groups.map(group => (
                <div key={group.id} style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '8px 14px',
                    background: 'var(--surface-raised)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Available Electives</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{group.units.length} unit(s)</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {group.units.map(({ unit }, i) => (
                        <tr key={unit.id} style={{ borderBottom: i < group.units.length - 1 ? '1px solid var(--border)' : undefined }}>
                          <td style={{ padding: '7px 12px', width: 120 }}>
                            <code style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--gray-light)', padding: '2px 5px', borderRadius: 3 }}>
                              {unit.unit_code}
                            </code>
                          </td>
                          <td style={{ padding: '7px 12px', color: 'var(--text-primary)' }}>{unit.unit_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : !template ? (
        /* Not yet parsed */
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '32px 24px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            Semester data not available
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380, margin: '0 auto' }}>
            Unit-level semester data is populated after the PDF has been downloaded and parsed.
            Run a <strong>Sync</strong> from the Planner Scraper to trigger parsing.
          </div>
          <div style={{ marginTop: 20 }}>
            <a
              href={entry.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none',
              }}
            >
              <PdfIcon size={14} />
              Open PDF directly
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PdfIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
