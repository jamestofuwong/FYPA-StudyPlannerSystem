'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlannerIndexEntry, PlannerDiff } from '@core/services/plannerScraper/types';

// ---------------------------------------------------------------------------
// Supported planner unit codes
// Derived from the full portal entry list. A planner is supported if its
// trimmed unitCode appears in this set. Codes are matched exactly so new
// codes that appear on the portal are conservatively flagged as unsupported.
//
// Excluded by design:
//   BA-BUSMGT6, BA-BUSMGT7  — Bachelor of Business (Management)
//   BA-BUSMGDM              — Bachelor of Business (Management & Digital Media)
//   All double-degrees, foundations, masters, graduate certs, other diplomas
// ---------------------------------------------------------------------------

const SUPPORTED_UNIT_CODES = new Set([
  'BA-CS',                                   // Bachelor of Computer Science (all majors)
  'DP-IT',                                   // Diploma of Information Technology (Cybersecurity & Data Science)
  'BH-ESE1',                                 // Bachelor of Engineering (Hons) (Software)
  'BA-DES',                                  // Bachelor of Design with a Major in Graphic Design
  // Bachelor of Business — all except Management
  'BA-BUS10',  'BA-BUS11',                   // Bachelor of Business
  'BA-BUSACF3','BA-BUSACF4',                 // Bachelor of Business (Accounting and Finance)
  'BA-BUSACC7','BA-BUSACC8',                 // Bachelor of Business (Accounting)
  'BA-BUSFIN4','BA-BUSFIN5',                 // Bachelor of Business (Finance)
  'BA-BUSHRM6','BA-BUSHRM7',                 // Bachelor of Business (Human Resource Management)
  'BA-BUSINB5','BA-BUSINB6',                 // Bachelor of Business (International Business)
  'BA-BUSMKT7','BA-BUSMKT8',                 // Bachelor of Business (Marketing)
  'BA-MCMN',                                 // Bachelor of Media and Communication (Social Media)
  'BH-ECV',                                  // Bachelor of Engineering (Hons) (Civil)
  'BH-EME',                                  // Bachelor of Engineering (Hons) (Mechanical)
  'BH-EEE',                                  // Bachelor of Engineering (Hons) (Electrical and Electronic)
  'BH-QSUV',                                 // Bachelor of Quantity Surveying (Honours)
]);

function isSupportedEntry(entry: PlannerIndexEntry): boolean {
  return SUPPORTED_UNIT_CODES.has(entry.unitCode.trim());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Action = 'check' | 'sync';
type RunState = 'idle' | 'running' | 'done' | 'error';

interface LogLine {
  text: string;
  color: string;
}

interface CheckResult {
  totalScraped: number;
  diff: PlannerDiff;
}

interface SyncResult {
  totalScraped: number;
  diff: PlannerDiff;
  dbSaved: number;
  dbFailed: number;
  parsedOk: number;
  parseFailed: number;
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logColor(line: string): string {
  if (line.startsWith('✓')) return '#86EFAC';
  if (line.startsWith('✗')) return '#FCA5A5';
  if (line.startsWith('→')) return '#93C5FD';
  return '#A3A3A3';
}

function parseLogLines(messages: string[]): LogLine[] {
  return messages.filter(Boolean).map(text => ({ text, color: logColor(text) }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------


function StepIndicator({ stepLabel }: { stepLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--orange)',
        display: 'inline-block',
        boxShadow: '0 0 0 3px var(--orange-light)',
        animation: 'pulse 1.5s infinite',
      }} />
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
        {stepLabel}
      </span>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function LogTerminal({ lines, runState }: { lines: LogLine[]; runState: RunState }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Terminal bar */}
      <div style={{
        background: '#1D1D1D',
        padding: '7px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#FF5F56', '#FFBD2E', '#27C93F'].map((c, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color: '#525252' }}>scraper.log</span>
        <span style={{ fontSize: 10, color: runState === 'running' ? '#FFBD2E' : runState === 'done' ? '#27C93F' : runState === 'error' ? '#FF5F56' : '#525252' }}>
          {runState === 'running' ? '● running' : runState === 'done' ? '● done' : runState === 'error' ? '● error' : '○ idle'}
        </span>
      </div>

      {/* Log body */}
      <div ref={scrollRef} style={{
        background: '#111',
        minHeight: 280,
        maxHeight: 420,
        overflowY: 'auto',
        padding: '12px 16px',
        fontFamily: 'Menlo, Consolas, Monaco, monospace',
        fontSize: 11,
        lineHeight: 1.75,
      }}>
        {lines.length === 0 ? (
          <span style={{ color: '#3D3D3D' }}>Run a workflow to see logs here.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <span style={{ color: '#3D3D3D', flexShrink: 0, userSelect: 'none', minWidth: 22 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ color: line.color }}>{line.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

function groupByYearAndLevel(entries: PlannerIndexEntry[]): Map<string, Map<string, PlannerIndexEntry[]>> {
  const grouped = new Map<string, Map<string, PlannerIndexEntry[]>>();
  const sorted = [...entries].sort((a, b) => b.year.localeCompare(a.year));
  for (const entry of sorted) {
    const level = entry.programLevel || 'Unknown';
    if (!grouped.has(entry.year)) grouped.set(entry.year, new Map());
    const byLevel = grouped.get(entry.year)!;
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(entry);
  }
  return grouped;
}

const LEVEL_DOT: Record<string, string> = {
  Undergraduate: '#2563EB',
  Postgraduate:  '#7C3AED',
};

const INITIAL_SHOW = 5; // rows visible before "show more"

function entryKey(entry: PlannerIndexEntry): string {
  return `${entry.pdfUrl}||${entry.unitCode}||${entry.year}||${entry.intakeMonth ?? ''}||${entry.courseName}||${entry.programLevel ?? ''}`;
}

// ---------------------------------------------------------------------------
// LevelCard — one program level group with a "show more" toggle
// ---------------------------------------------------------------------------

function LevelCard({
  level, entries, accentColor, selectedKeys, onToggle,
}: {
  level: string;
  entries: PlannerIndexEntry[];
  accentColor: string;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const clipped = !expanded && entries.length > INITIAL_SHOW;
  const visible = clipped ? entries.slice(0, INITIAL_SHOW) : entries;
  const hidden = entries.length - INITIAL_SHOW;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Level sub-header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-raised)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: LEVEL_DOT[level] ?? '#A3A3A3', display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{level}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entries.length} planner(s)</span>
      </div>

      {/* Entry rows */}
      {visible.map((entry, i) => {
        const key = entryKey(entry);
        const checked = selectedKeys.has(key);
        return (
          <label key={i} style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer',
            background: checked ? 'rgba(255,255,255,0.03)' : 'none',
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(key)}
              style={{ flexShrink: 0, accentColor }}
            />
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0, display: 'inline-block' }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {entry.courseName}
                {entry.majorName && (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    — {entry.majorName}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                <code style={{ fontFamily: 'monospace' }}>{entry.unitCode}</code>
                {entry.intakeMonth && ` · ${entry.intakeMonth}`}
                {entry.lastUpdated && ` · Updated ${entry.lastUpdated}`}
              </div>
            </div>
          </label>
        );
      })}

      {/* Show more / show less */}
      {entries.length > INITIAL_SHOW && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            borderTop: clipped ? '1px solid var(--border)' : undefined,
            fontSize: 12,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
        >
          <span style={{ display: 'inline-block', transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.15s', fontSize: 14, lineHeight: 1 }}>›</span>
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// DiffSection — collapsible top-level "New Planners" / "Updated Planners" block
// Years shown as a sidebar tab list; clicking a year shows its planners.
// ---------------------------------------------------------------------------

function DiffSection({
  title, count, entries, accentColor, headerColor, selectedKeys, onToggle, onToggleYear, onToggleAll,
}: {
  title: string;
  count: number;
  entries: PlannerIndexEntry[];
  accentColor: string;
  headerColor: string;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onToggleYear: (yearEntries: PlannerIndexEntry[], select: boolean) => void;
  onToggleAll: (select: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const grouped = groupByYearAndLevel(entries);
  const years = Array.from(grouped.keys());
  const [selectedYear, setSelectedYear] = useState<string>(years[0] ?? '');

  const byLevel = grouped.get(selectedYear) ?? new Map();

  const allSelected = entries.length > 0 && entries.every(e => selectedKeys.has(entryKey(e)));
  const someSelected = !allSelected && entries.some(e => selectedKeys.has(entryKey(e)));

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Section header */}
      <div style={{
        background: 'var(--surface-raised)',
        borderBottom: open ? '1px solid var(--border)' : 'none',
        display: 'flex', alignItems: 'center',
      }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, background: 'none', border: 'none',
            padding: '11px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          }}
        >
          <span style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
            fontSize: 14, color: 'var(--text-muted)', lineHeight: 1,
          }}>›</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        </button>
        {/* Select all + count badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
            title="Select all planners in this section">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected; }}
              onChange={() => onToggleAll(!allSelected)}
              style={{ accentColor }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', userSelect: 'none' }}>All</span>
          </label>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: headerColor === 'var(--green)' ? 'var(--green-light)' : 'var(--orange-light)',
            color: headerColor,
            padding: '2px 8px', borderRadius: 20,
          }}>
            {count}
          </span>
        </div>
      </div>

      {/* Split: year sidebar + planner list */}
      {open && (
        <div style={{ display: 'flex', minHeight: 0 }}>
          {/* Year tab sidebar */}
          <div style={{
            width: 110,
            flexShrink: 0,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 8,
            paddingBottom: 8,
          }}>
            {years.map(year => {
              const isActive = year === selectedYear;
              const yearEntries = Array.from((grouped.get(year) ?? new Map()).values()).flat();
              const yearCount = yearEntries.length;
              const yearAllSelected = yearEntries.every(e => selectedKeys.has(entryKey(e)));
              const yearSomeSelected = !yearAllSelected && yearEntries.some(e => selectedKeys.has(entryKey(e)));
              return (
                <div
                  key={year}
                  style={{
                    display: 'flex', alignItems: 'center',
                    background: isActive ? 'var(--surface-raised)' : 'none',
                    borderLeft: `3px solid ${isActive ? accentColor : 'transparent'}`,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-raised)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <button
                    onClick={() => setSelectedYear(year)}
                    style={{
                      flex: 1, background: 'none', border: 'none',
                      padding: '9px 8px 9px 10px',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {year}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {yearCount} planner{yearCount !== 1 ? 's' : ''}
                    </div>
                  </button>
                  <label style={{ padding: '0 8px', cursor: 'pointer', display: 'flex' }}
                    title={`Select all ${year} planners`}>
                    <input
                      type="checkbox"
                      checked={yearAllSelected}
                      ref={el => { if (el) el.indeterminate = yearSomeSelected; }}
                      onChange={() => onToggleYear(yearEntries, !yearAllSelected)}
                      style={{ accentColor }}
                    />
                  </label>
                </div>
              );
            })}
          </div>

          {/* Planner list for selected year */}
          <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            {Array.from(byLevel.entries()).map(([level, levelEntries]) => (
              <LevelCard
                key={level}
                level={level}
                entries={levelEntries}
                accentColor={accentColor}
                selectedKeys={selectedKeys}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function SyncSuccessBanner({ result }: { result: SyncResult }) {
  const { dbSaved, dbFailed, parsedOk, parseFailed } = result;
  const hasDbIssues = dbFailed > 0;
  const hasParseIssues = parseFailed > 0;
  const savedNotParsed = dbSaved - parsedOk - parseFailed;

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${hasDbIssues || hasParseIssues ? 'var(--orange-border, #FED7AA)' : 'var(--green-border, #BBF7D0)'}`,
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        background: hasDbIssues || hasParseIssues ? 'var(--orange-light)' : 'var(--green-light)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 14, color: hasDbIssues || hasParseIssues ? 'var(--orange)' : 'var(--green)' }}>
          {hasDbIssues || hasParseIssues ? '⚠' : '✓'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: hasDbIssues || hasParseIssues ? 'var(--orange)' : 'var(--green)' }}>
          Sync complete{hasDbIssues || hasParseIssues ? ' with errors' : ''}
        </span>
      </div>

      {/* Two-section metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: savedNotParsed > 0 ? '1px solid var(--border)' : 'none' }}>
        {/* Database section */}
        <div style={{ padding: '14px 18px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Database
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>{dbSaved}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>saved</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: hasDbIssues ? 'var(--red)' : 'var(--text-muted)', lineHeight: 1 }}>{dbFailed}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>failed to save</div>
            </div>
          </div>
        </div>

        {/* Parsing section */}
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Parsing
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)', lineHeight: 1 }}>{parsedOk}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>parsed</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: hasParseIssues ? 'var(--orange)' : 'var(--text-muted)', lineHeight: 1 }}>{parseFailed}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>failed to parse</div>
            </div>
          </div>
        </div>
      </div>

      {/* Warning when entries were saved to DB but not fully parsed */}
      {savedNotParsed > 0 && (
        <div style={{
          padding: '8px 16px',
          fontSize: 12,
          color: 'var(--orange)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⚠</span>
          {savedNotParsed} planner{savedNotParsed !== 1 ? 's were' : ' was'} saved to the database but could not be fully parsed — portal entry is recorded, planner template is missing.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnsupportedWarningModal
// ---------------------------------------------------------------------------

function UnsupportedWarningModal({
  unsupported,
  totalSelected,
  onSyncAll,
  onSyncSupportedOnly,
  onCancel,
}: {
  unsupported: PlannerIndexEntry[];
  totalSelected: number;
  onSyncAll: () => void;
  onSyncSupportedOnly: () => void;
  onCancel: () => void;
}) {
  const supportedCount = totalSelected - unsupported.length;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        width: '100%', maxWidth: 520,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--orange-light)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>
              Unsupported planners detected
            </div>
            <div style={{ fontSize: 11, color: 'var(--orange)', opacity: 0.85, marginTop: 2 }}>
              {unsupported.length} of {totalSelected} selected planner{totalSelected !== 1 ? 's are' : ' is'} not fully supported by the parser
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 18px' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            The following planners may produce inaccurate or incomplete results when parsed.
            You can still sync them, but the parsed data should be reviewed carefully.
          </p>

          {/* Unsupported list */}
          <div style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            maxHeight: 200,
            overflowY: 'auto',
            marginBottom: 14,
          }}>
            {unsupported.map((e, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                borderBottom: i < unsupported.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {e.courseName}
                  {e.majorName && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — {e.majorName}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  <code>{e.unitCode}</code>
                  {e.intakeMonth && ` · ${e.intakeMonth}`}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '7px 14px', background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', fontSize: 12,
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {supportedCount > 0 && (
              <button
                onClick={onSyncSupportedOnly}
                style={{
                  padding: '7px 14px',
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', fontSize: 12,
                  fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                Sync supported only ({supportedCount})
              </button>
            )}
            <button
              onClick={onSyncAll}
              style={{
                padding: '7px 14px',
                background: 'var(--orange)',
                border: 'none',
                borderRadius: 'var(--radius-sm)', fontSize: 12,
                fontWeight: 600, color: '#fff', cursor: 'pointer',
              }}
            >
              Sync all ({totalSelected})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiffResult
// ---------------------------------------------------------------------------

function DiffResult({ result, onSync, syncing }: { result: CheckResult; onSync: (selected: PlannerIndexEntry[]) => void; syncing: boolean }) {
  const { diff, totalScraped } = result;
  const allChangedEntries = [...diff.newEntries, ...diff.updatedEntries];
  const hasChanges = allChangedEntries.length > 0;
  const changeCount = allChangedEntries.length;

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(allChangedEntries.map(entryKey))
  );
  const selectedCount = selectedKeys.size;
  const [pendingEntries, setPendingEntries] = useState<PlannerIndexEntry[] | null>(null);

  function handleSyncClick() {
    const selected = allChangedEntries.filter(e => selectedKeys.has(entryKey(e)));
    const unsupported = selected.filter(e => !isSupportedEntry(e));
    if (unsupported.length > 0) {
      setPendingEntries(selected);
    } else {
      onSync(selected);
    }
  }

  const toggle = (key: string) => setSelectedKeys(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const toggleYear = (yearEntries: PlannerIndexEntry[], select: boolean) =>
    setSelectedKeys(prev => {
      const next = new Set(prev);
      yearEntries.forEach(e => select ? next.add(entryKey(e)) : next.delete(entryKey(e)));
      return next;
    });

  const toggleAll = (sectionEntries: PlannerIndexEntry[], select: boolean) =>
    setSelectedKeys(prev => {
      const next = new Set(prev);
      sectionEntries.forEach(e => select ? next.add(entryKey(e)) : next.delete(entryKey(e)));
      return next;
    });

  const syncDisabled = syncing || selectedCount === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pendingEntries && (
        <UnsupportedWarningModal
          unsupported={pendingEntries.filter(e => !isSupportedEntry(e))}
          totalSelected={pendingEntries.length}
          onSyncAll={() => { onSync(pendingEntries); setPendingEntries(null); }}
          onSyncSupportedOnly={() => { onSync(pendingEntries.filter(e => isSupportedEntry(e))); setPendingEntries(null); }}
          onCancel={() => setPendingEntries(null)}
        />
      )}
      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Scanned',   value: totalScraped,               color: 'var(--text-primary)', bg: 'var(--gray-light)' },
          { label: 'New',       value: diff.newEntries.length,      color: diff.newEntries.length > 0 ? 'var(--green)' : 'var(--text-muted)',   bg: diff.newEntries.length > 0 ? 'var(--green-light)' : 'var(--gray-light)' },
          { label: 'Updated',   value: diff.updatedEntries.length,  color: diff.updatedEntries.length > 0 ? 'var(--orange)' : 'var(--text-muted)', bg: diff.updatedEntries.length > 0 ? 'var(--orange-light)' : 'var(--gray-light)' },
          { label: 'Unchanged', value: totalScraped - changeCount,  color: 'var(--text-muted)', bg: 'var(--gray-light)' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ flex: 1, background: bg, borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Sync Updates button */}
      {hasChanges && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
              {selectedCount > 0
                ? `${selectedCount} of ${changeCount} planner${changeCount !== 1 ? 's' : ''} selected`
                : 'No planners selected'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {selectedCount > 0
                ? 'Save the selected entries to the database.'
                : 'Select planners below to enable sync.'}
            </div>
          </div>
          <button
            onClick={handleSyncClick}
            disabled={syncDisabled}
            style={{
              padding: '8px 20px',
              background: syncDisabled ? 'var(--gray-light)' : 'var(--orange)',
              color: syncDisabled ? 'var(--text-muted)' : '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: 13,
              cursor: syncDisabled ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!syncDisabled) (e.currentTarget as HTMLElement).style.background = 'var(--orange-hover)'; }}
            onMouseLeave={e => { if (!syncDisabled) (e.currentTarget as HTMLElement).style.background = syncDisabled ? 'var(--gray-light)' : 'var(--orange)'; }}
          >
            {syncing ? 'Syncing…' : `Sync Updates${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </button>
        </div>
      )}

      {/* Grouped entry lists */}
      {hasChanges && [
        { title: 'New Planners',     entries: diff.newEntries,     accentColor: 'var(--green)',  headerColor: 'var(--green)' },
        { title: 'Updated Planners', entries: diff.updatedEntries, accentColor: 'var(--orange)', headerColor: 'var(--orange)' },
      ].filter(g => g.entries.length > 0).map(g => (
        <DiffSection
          key={g.title}
          title={g.title}
          count={g.entries.length}
          entries={g.entries}
          accentColor={g.accentColor}
          headerColor={g.headerColor}
          selectedKeys={selectedKeys}
          onToggle={toggle}
          onToggleYear={toggleYear}
          onToggleAll={(select) => toggleAll(g.entries, select)}
        />
      ))}

      {!hasChanges && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 13 }}>
          All planners are up to date.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScraperPage() {
  const [runState, setRunState] = useState<RunState>('idle');
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [currentStepLabel, setCurrentStepLabel] = useState('');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; description: string } | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isRunning = runState === 'running';
  const isSyncing = isRunning && activeAction === 'sync';

  async function startRun(action: Action, selectedEntries?: PlannerIndexEntry[]) {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setActiveAction(action);
    setRunState('running');
    setLogs([]);
    setCurrentStepLabel('Connecting...');
    setProgress(null);
    if (action === 'check') {
      setCheckResult(null);
      setSyncResult(null);
    } else {
      setSyncResult(null);
    }

    try {
      const res = await fetch(`/api/scraper/run?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedEntries: selectedEntries ?? null }),
        signal: abort.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(action, event);
          } catch { /* malformed chunk */ }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setLogs(prev => [...prev, { text: `✗ Connection error: ${(e as Error).message}`, color: '#FCA5A5' }]);
      setRunState('error');
    }
  }

  function handleEvent(action: Action, event: Record<string, unknown>) {
    switch (event.type) {
      case 'step':
        setCurrentStepLabel(event.label as string);
        break;
      case 'log':
        setLogs(prev => [...prev, ...parseLogLines(event.messages as string[])]);
        break;
      case 'progress':
        setProgress({
          current: event.current as number,
          total: event.total as number,
          description: event.description as string,
        });
        break;
      case 'result': {
        if (action === 'check') {
          setCheckResult(event.data as CheckResult);
        } else {
          setSyncResult(event.data as SyncResult);
        }
        break;
      }
      case 'error':
        setLogs(prev => [...prev, { text: `✗ ${event.message}`, color: '#FCA5A5' }]);
        setRunState('error');
        setCurrentStepLabel('');
        break;
      case 'done':
        setRunState(prev => prev === 'error' ? 'error' : 'done');
        setCurrentStepLabel('');
        setProgress(null);
        break;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setRunState('idle');
    setActiveAction(null);
    setCurrentStepLabel('');
    setProgress(null);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960 }}>
      {/* Page header with Check button */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>
            Planner Scraper
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Check the university portal for new or updated study planners.
          </p>
        </div>
        <button
          onClick={() => startRun('check')}
          disabled={isRunning}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 18px',
            background: isRunning ? 'var(--gray-light)' : 'var(--orange)',
            color: isRunning ? 'var(--text-muted)' : '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            fontSize: 13,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (!isRunning) (e.currentTarget as HTMLElement).style.background = 'var(--orange-hover)'; }}
          onMouseLeave={e => { if (!isRunning) (e.currentTarget as HTMLElement).style.background = 'var(--orange)'; }}
        >
          <RefreshIcon spinning={isRunning && activeAction === 'check'} />
          {isRunning && activeAction === 'check' ? 'Checking…' : 'Check for Updates'}
        </button>
      </div>

      {/* Status bar */}
      {(isRunning || currentStepLabel) && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            {isRunning && <StepIndicator stepLabel={currentStepLabel} />}
            {progress && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', minWidth: 0 }}>
                <span style={{
                  background: 'var(--orange-light)', color: 'var(--orange)',
                  fontWeight: 600, padding: '1px 7px', borderRadius: 20, fontSize: 11, flexShrink: 0,
                }}>
                  {progress.current}/{progress.total}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {progress.description}
                </span>
              </div>
            )}
          </div>
          {isRunning && (
            <button
              onClick={handleStop}
              style={{
                padding: '4px 12px', background: 'none',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)', fontSize: 12,
                color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              Stop
            </button>
          )}
        </div>
      )}

      {/* Log terminal */}
      <div style={{ marginBottom: 20 }}>
        <LogTerminal lines={logs} runState={runState} />
      </div>

      {/* Check results + sync button */}
      {checkResult && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            Results
          </div>
          <DiffResult result={checkResult} onSync={(selected) => startRun('sync', selected)} syncing={isSyncing} />
        </div>
      )}

      {/* Sync success banner */}
      {syncResult !== null && (
        <div style={{ marginTop: checkResult ? 20 : 0 }}>
          <SyncSuccessBanner result={syncResult} />
        </div>
      )}
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, animation: spinning ? 'spin 1s linear infinite' : 'none' }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}
