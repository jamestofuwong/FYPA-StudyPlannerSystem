'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './page.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CloudEntry {
  id: string;
  unit_code: string;
  course_name: string;
  year: string;
  intake_month: string;
  program_level: string | null;
  last_updated: string | null;
  planner_template_id: string | null;
  is_parsed: boolean;
  local_status: 'available' | 'already_imported';
}

type PullStatus = 'pulled' | 'duplicate' | 'failed';

interface PullResult {
  id: string;
  status: PullStatus;
  error?: string;
}

type FilterMode = 'all' | 'available' | 'parsed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByYear(entries: CloudEntry[]): Map<string, CloudEntry[]> {
  const map = new Map<string, CloudEntry[]>();
  const sorted = [...entries].sort((a, b) => b.year.localeCompare(a.year));
  for (const e of sorted) {
    if (!map.has(e.year)) map.set(e.year, []);
    map.get(e.year)!.push(e);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CloudSyncPage() {
  const [entries, setEntries] = useState<CloudEntry[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [loadError, setLoadError] = useState('');
  const [cloudUrl, setCloudUrl] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');

  const [pulling, setPulling] = useState(false);
  const [pullResults, setPullResults] = useState<PullResult[] | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    setPullResults(null);
    setSelected(new Set());
    try {
      const res = await fetch('/api/cloud-sync');
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? `Server error ${res.status}`);
        setLoadState('error');
        return;
      }
      setEntries(data);
      // Extract the cloud URL from the first entry's response headers isn't possible;
      // read from a meta endpoint or just show what we know from config.
      setLoadState('done');
    } catch (e: any) {
      setLoadError(e.message);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    load();
    // Expose cloud URL via env (Next.js only exposes NEXT_PUBLIC_ vars to client)
    // We'll derive it from the error message or just show "cloud app"
  }, [load]);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const visible = entries.filter((e) => {
    if (filter === 'available' && e.local_status !== 'available') return false;
    if (filter === 'parsed' && !e.is_parsed) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.course_name.toLowerCase().includes(q) && !e.unit_code.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pullable = visible.filter((e) => e.is_parsed && e.local_status === 'available');

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAllVisible = () =>
    setSelected(new Set(pullable.map((e) => e.id)));

  const clearSelection = () => setSelected(new Set());

  const selectedCount = [...selected].filter((id) =>
    pullable.some((e) => e.id === id)
  ).length;

  // ---------------------------------------------------------------------------
  // Pull
  // ---------------------------------------------------------------------------

  async function handlePull() {
    const ids = [...selected].filter((id) => pullable.some((e) => e.id === id));
    if (ids.length === 0) return;

    setPulling(true);
    setPullResults(null);
    try {
      const res = await fetch('/api/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      setPullResults(data.results ?? []);
      // Refresh the list to update local_status
      await load();
    } catch (e: any) {
      setPullResults([{ id: '__request__', status: 'failed', error: e.message }]);
    } finally {
      setPulling(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Result lookup
  // ---------------------------------------------------------------------------

  const resultFor = (id: string): PullResult | undefined =>
    pullResults?.find((r) => r.id === id);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const grouped = groupByYear(visible);

  const pulledCount   = pullResults?.filter((r) => r.status === 'pulled').length ?? 0;
  const duplicateCount= pullResults?.filter((r) => r.status === 'duplicate').length ?? 0;
  const failedCount   = pullResults?.filter((r) => r.status === 'failed').length ?? 0;

  return (
    <div className={styles.panel}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Cloud Sync</h1>
          <p>Pull parsed planners from the cloud app into your local database.</p>
        </div>
        <div className={styles.connectionBadge}>
          <span
            className={styles.connectionDot}
            style={{
              background: loadState === 'done' ? '#16a34a'
                        : loadState === 'error' ? '#dc2626'
                        : '#d97706',
            }}
          />
          {loadState === 'done'    ? 'Connected'
         : loadState === 'error'  ? 'Unreachable'
         : loadState === 'loading' ? 'Connecting…'
         : 'Idle'}
        </div>
      </div>

      {/* Pull results banner */}
      {pullResults && pullResults.length > 0 && (
        <div className={styles.resultsBanner}>
          <div className={styles.resultsSummary}>
            {pulledCount > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultStatVal} style={{ color: 'var(--accent-green, #16a34a)' }}>
                  {pulledCount}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>pulled</span>
              </div>
            )}
            {duplicateCount > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultStatVal} style={{ color: 'var(--text-muted)' }}>
                  {duplicateCount}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>already local</span>
              </div>
            )}
            {failedCount > 0 && (
              <div className={styles.resultStat}>
                <span className={styles.resultStatVal} style={{ color: 'var(--accent-red, #dc2626)' }}>
                  {failedCount}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>failed</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── States ── */}
      {loadState === 'loading' && (
        <div className={styles.stateBox}>
          <div className={styles.stateIcon}>☁️</div>
          <div className={styles.stateTitle}>Connecting to cloud app…</div>
          <div className={styles.stateDesc}>Fetching available planners.</div>
        </div>
      )}

      {loadState === 'error' && (
        <div className={styles.stateBox}>
          <div className={styles.stateIcon}>⚠️</div>
          <div className={styles.stateTitle}>Could not reach cloud app</div>
          <div className={styles.stateDesc}>{loadError}</div>
          <div className={styles.stateDesc} style={{ marginTop: 8 }}>
            Make sure <code>CLOUD_API_URL</code> in <code>web/.env</code> points to the running cloud app,
            then restart the local server.
          </div>
          <button className={styles.refreshBtn} style={{ marginTop: 12 }} onClick={load}>
            Retry
          </button>
        </div>
      )}

      {loadState === 'done' && (
        <>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by course or unit code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {(['all', 'available', 'parsed'] as FilterMode[]).map((f) => (
                <button
                  key={f}
                  className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all'       ? 'All'
                 : f === 'available' ? 'Not yet local'
                 :                    'Parsed only'}
                </button>
              ))}
            </div>

            <button
              className={styles.refreshBtn}
              onClick={load}
              disabled={pulling}
            >
              ↻ Refresh
            </button>

            {selectedCount > 0 ? (
              <button className={styles.pullBtn} disabled={pulling} onClick={handlePull}>
                {pulling ? 'Pulling…' : `Pull ${selectedCount} planner${selectedCount !== 1 ? 's' : ''}`}
              </button>
            ) : (
              pullable.length > 0 && (
                <button className={styles.pullBtn} onClick={selectAllVisible}>
                  Select all
                </button>
              )
            )}
          </div>

          {/* Section title */}
          <div className={styles.sectionTitle}>
            {visible.length} planner{visible.length !== 1 ? 's' : ''} on cloud
          </div>

          {/* Empty state */}
          {visible.length === 0 && (
            <div className={styles.stateBox}>
              <div className={styles.stateIcon}>📭</div>
              <div className={styles.stateTitle}>No planners found</div>
              <div className={styles.stateDesc}>
                {search || filter !== 'all'
                  ? 'Try clearing the search or filter.'
                  : 'The cloud app has no scraped planners yet. Run the scraper on the cloud to populate this list.'}
              </div>
            </div>
          )}

          {/* Planner list */}
          {Array.from(grouped.entries()).map(([year, yearEntries]) => (
            <div key={year} className={styles.yearGroup}>
              <div className={styles.yearLabel}>{year}</div>
              {yearEntries.map((entry) => {
                const isPullable = entry.is_parsed && entry.local_status === 'available';
                const isSelected = selected.has(entry.id);
                const result = resultFor(entry.id);

                return (
                  <div
                    key={entry.id}
                    className={[
                      styles.plannerRow,
                      isSelected ? styles.plannerRowSelected : '',
                      !isPullable ? styles.plannerRowDisabled : '',
                    ].join(' ')}
                    onClick={() => isPullable && toggle(entry.id)}
                  >
                    <input
                      type="checkbox"
                      className={styles.rowCheckbox}
                      checked={isSelected}
                      disabled={!isPullable}
                      onChange={() => isPullable && toggle(entry.id)}
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className={styles.rowInfo}>
                      <div className={styles.rowTitle}>{entry.course_name}</div>
                      <div className={styles.rowMeta}>
                        <code>{entry.unit_code}</code>
                        {entry.intake_month && (
                          <>
                            <span className={styles.metaDot}>·</span>
                            {entry.intake_month}
                          </>
                        )}
                        {entry.last_updated && (
                          <>
                            <span className={styles.metaDot}>·</span>
                            Updated {entry.last_updated}
                          </>
                        )}
                        {entry.program_level && (
                          <>
                            <span className={styles.metaDot}>·</span>
                            {entry.program_level}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Parse status */}
                    {entry.is_parsed ? (
                      <span className={`${styles.pill} ${styles.pillParsed}`}>✓ Parsed</span>
                    ) : (
                      <span className={`${styles.pill} ${styles.pillUnparsed}`}>Not parsed</span>
                    )}

                    {/* Pull result (shown after a pull attempt) */}
                    {result ? (
                      result.status === 'pulled'    ? <span className={`${styles.pill} ${styles.pillPulled}`}>↓ Pulled</span>
                    : result.status === 'duplicate' ? <span className={`${styles.pill} ${styles.pillDuplicate}`}>Already local</span>
                    :                                 <span className={`${styles.pill} ${styles.pillFailed}`} title={result.error}>Failed</span>
                    ) : (
                      entry.local_status === 'already_imported'
                        ? <span className={`${styles.pill} ${styles.pillImported}`}>Already local</span>
                        : entry.is_parsed
                          ? <span className={`${styles.pill} ${styles.pillAvailable}`}>Available</span>
                          : null
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
