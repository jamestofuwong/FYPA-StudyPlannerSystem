'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface PortalPlannerEntry {
  id: string;
  year: string;
  unit_code: string;
  course_name: string;
  intake_month: string;
  major_name: string;
  program_level: string | null;
  status: string;
  pdf_url: string;
  last_updated: string | null;
  last_updated_iso: string | null;
  first_seen_at: string;
  last_synced_at: string;
  planner_template_id: string | null;
}

// year → programLevel → entries
type Grouped = Map<string, Map<string, PortalPlannerEntry[]>>;

function groupEntries(entries: PortalPlannerEntry[]): Grouped {
  const grouped: Grouped = new Map();
  const sorted = [...entries].sort((a, b) => b.year.localeCompare(a.year));
  for (const entry of sorted) {
    const level = entry.program_level || 'Unknown';
    if (!grouped.has(entry.year)) grouped.set(entry.year, new Map());
    const byLevel = grouped.get(entry.year)!;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(entry);
  }
  return grouped;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase().trim();
  if (q.length <= 2) return t.includes(q);
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

function matchesSearch(entry: PortalPlannerEntry, query: string): boolean {
  if (!query.trim()) return true;
  return fuzzyMatch(entry.course_name, query) || fuzzyMatch(entry.unit_code, query);
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: '#92400E', bg: '#FEF3C7' },
  active:   { label: 'Active',   color: '#065F46', bg: '#D1FAE5' },
  archived: { label: 'Archived', color: '#374151', bg: '#F3F4F6' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      color: cfg.color,
      background: cfg.bg,
      padding: '2px 7px',
      borderRadius: 20,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

const TABLE_HEADERS = ['Course', 'Unit Code', 'Intake', 'Status', 'Last Updated', 'First Seen', ''];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 500 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: 12,
          color: 'var(--text-primary)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 28px 5px 10px',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
          cursor: 'pointer',
          outline: 'none',
          minWidth: 110,
        }}
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status tab bar
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'draft' | 'active' | 'archived';

function StatusTabs({
  entries, value, onChange,
}: {
  entries: PortalPlannerEntry[];
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  const counts = useMemo(() => ({
    all:      entries.length,
    draft:    entries.filter(e => e.status === 'draft').length,
    active:   entries.filter(e => e.status === 'active').length,
    archived: entries.filter(e => e.status === 'archived').length,
  }), [entries]);

  const tabs: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all',      label: 'All' },
    { id: 'active',   label: 'Active' },
    { id: 'draft',    label: 'Draft' },
    { id: 'archived', label: 'Archived' },
  ];

  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
      {tabs.map(tab => {
        const active = value === tab.id;
        const cfg = STATUS_CONFIG[tab.id];
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? 'var(--orange)' : 'var(--text-secondary)',
              background: active ? 'rgba(234, 88, 12, 0.06)' : 'transparent',
              border: '1px solid',
              borderColor: active ? 'var(--orange)' : 'var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: active ? 'var(--orange)' : (cfg ? cfg.color : 'var(--text-muted)'),
              background: active ? 'rgba(234, 88, 12, 0.12)' : (cfg ? cfg.bg : '#F3F4F6'),
              padding: '1px 6px',
              borderRadius: 10,
              minWidth: 18,
              textAlign: 'center',
            }}>
              {counts[tab.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlannersPage() {
  const [entries, setEntries] = useState<PortalPlannerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filter state
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [intakeFilter, setIntakeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    // ?all=true — cloud UI sees all statuses
    fetch('/api/planners?all=true')
      .then(r => r.json())
      .then((data: PortalPlannerEntry[]) => { setEntries(data); setLoading(false); })
      .catch(() => { setError('Failed to load planners from database.'); setLoading(false); });
  }, []);

  // Derive filter options from all entries
  const yearOptions = useMemo(
    () => [...new Set(entries.map(e => e.year))].sort((a, b) => b.localeCompare(a)),
    [entries],
  );
  const intakeOptions = useMemo(
    () => [...new Set(entries.map(e => e.intake_month).filter(Boolean))].sort(),
    [entries],
  );

  // Apply search + filters
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (yearFilter && e.year !== yearFilter) return false;
      if (intakeFilter && e.intake_month !== intakeFilter) return false;
      if (!matchesSearch(e, search)) return false;
      return true;
    });
  }, [entries, search, yearFilter, intakeFilter, statusFilter]);

  const hasActiveFilter = search.trim() || yearFilter || intakeFilter;

  const uniqueYears = new Set(entries.map(e => e.year)).size;
  const uniqueCourses = new Set(entries.map(e => e.unit_code)).size;
  const lastSynced = entries.length > 0 ? formatDate(entries[0].last_synced_at) : '—';
  const grouped = groupEntries(filtered);

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.01em' }}>
          Study Planners
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Planners discovered from the Swinburne portal. Run a scraper check to populate.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 200px))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Entries', value: loading ? '—' : entries.length, note: 'planners on portal' },
          { label: 'Unique Courses', value: loading ? '—' : uniqueCourses, note: `across ${uniqueYears} year(s)` },
          { label: 'Last Synced', value: loading ? '—' : lastSynced, note: 'most recently updated' },
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

      {/* Status tabs */}
      {!loading && !error && entries.length > 0 && (
        <StatusTabs entries={entries} value={statusFilter} onChange={setStatusFilter} />
      )}

      {/* Search + Filters */}
      {!loading && !error && entries.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}>
          {/* Search bar */}
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
            <svg
              width="14" height="14" viewBox="0 0 16 16" fill="none"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
            >
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search by course name or unit code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                paddingLeft: 32,
                paddingRight: search ? 32 : 12,
                paddingTop: 6,
                paddingBottom: 6,
                fontSize: 13,
                color: 'var(--text-primary)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 0,
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

          {/* Year filter */}
          <FilterSelect
            label="Year"
            value={yearFilter}
            onChange={setYearFilter}
            options={yearOptions}
          />

          {/* Intake filter */}
          <FilterSelect
            label="Intake"
            value={intakeFilter}
            onChange={setIntakeFilter}
            options={intakeOptions}
          />

          {/* Clear filters */}
          {hasActiveFilter && (
            <button
              onClick={() => { setSearch(''); setYearFilter(''); setIntakeFilter(''); }}
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '5px 4px',
                textDecoration: 'underline',
                whiteSpace: 'nowrap',
              }}
            >
              Clear all
            </button>
          )}

          {/* Result count when filtering */}
          {hasActiveFilter && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* States */}
      {loading && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Loading planners…
        </div>
      )}
      {error && (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--red)', fontSize: 13 }}>{error}</div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No planners found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Run a <strong>Check for Updates</strong> from the Planner Scraper to discover planners on the portal.
          </div>
        </div>
      )}

      {/* No results from filter/search */}
      {!loading && !error && entries.length > 0 && filtered.length === 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '48px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No matching planners</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Try adjusting your search or filters.
          </div>
        </div>
      )}

      {/* Grouped sections: year → program level → table */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {Array.from(grouped.entries()).map(([year, byLevel]) => (
            <div key={year}>
              {/* Year heading */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
              }}>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em',
                }}>
                  {year}
                </div>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {Array.from(byLevel.values()).reduce((s, arr) => s + arr.length, 0)} planner(s)
                </div>
              </div>

              {/* Program level groups */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from(byLevel.entries()).map(([level, levelEntries]) => (
                  <div key={level} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}>
                    {/* Level sub-header */}
                    <div style={{
                      padding: '9px 20px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--surface-raised)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          display: 'inline-block',
                          width: 7, height: 7, borderRadius: '50%',
                          background: level === 'Undergraduate' ? '#2563EB'
                            : level === 'Postgraduate' ? '#7C3AED'
                            : '#A3A3A3',
                        }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{level}</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {levelEntries.length} planner(s)
                      </span>
                    </div>

                    {/* Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
                          {TABLE_HEADERS.map((h, i) => (
                            <th key={i} style={{
                              padding: '8px 16px',
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
                        {levelEntries.map((entry, idx) => (
                          <tr
                            key={entry.id}
                            style={{ borderBottom: idx < levelEntries.length - 1 ? '1px solid var(--border)' : undefined }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FAFAFA'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <td style={{ padding: '10px 16px' }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', maxWidth: 300 }}>
                                <HighlightedText text={entry.course_name} query={search} />
                              </div>
                              {entry.major_name && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {entry.major_name}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <code style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--gray-light)', padding: '2px 6px', borderRadius: 4 }}>
                                <HighlightedText text={entry.unit_code} query={search} />
                              </code>
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                              {entry.intake_month || '—'}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <StatusBadge status={entry.status} />
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {entry.last_updated || '—'}
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {formatDate(entry.first_seen_at)}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <Link href={`/planners/${entry.id}`} style={{
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HighlightedText — bolds matched characters when a query is active
// ---------------------------------------------------------------------------

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const q = query.toLowerCase().trim();
  const result: { char: string; matched: boolean }[] = [];
  let qi = 0;

  for (let i = 0; i < text.length; i++) {
    const matched = qi < q.length && text[i].toLowerCase() === q[qi];
    if (matched) qi++;
    result.push({ char: text[i], matched });
  }

  return (
    <>
      {result.map(({ char, matched }, i) =>
        matched ? (
          <mark key={i} style={{ background: 'rgba(234, 88, 12, 0.15)', color: 'inherit', borderRadius: 2, padding: 0 }}>
            {char}
          </mark>
        ) : (
          <span key={i}>{char}</span>
        ),
      )}
    </>
  );
}
