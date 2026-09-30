'use client';

// ============================================================
// The Head of Department's view of an estimate.
//
// Reads saved runs only, never the in-memory cohort. A saved run carries the inputs behind
// its figures, so a number can never be read without its assumptions. In-memory records are cleared when the
// app restarts, so a page built on them would be blank most of the time. And it means this view needs no
// scraping and no imports, which is what lets it be shown without the machinery behind it.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useScrollToTopOnMount } from '../../../../lib/scrollToTop';
import styles from './page.module.css';

type SavedRun = {
  id: string;
  createdAt: string;
  label: string | null;
  targetYear: number;
  targetSemester: number;
  loadCap: number;
  retentionRate: number;
  newIntake: number;
  source: string;
  studentCount: number;
  groupCount: number;
  commonCoreCount: number;
  unitCount: number;
  totalHeadcount: number;
};

type RunUnit = {
  unitCode: string;
  fromNamedPicks: number;
  fromElectives: number;
  fromNewIntake: number;
  projected: number;
  headcount: number;
};

type SavedRunDetail = SavedRun & { units: RunUnit[] };

/** Plain descriptions. The estimator page names the source in its own vocabulary; this one does not. */
const SOURCE_LABELS: Record<string, string> = {
  portal: 'Read from the student portal',
  import: 'Imported from DPA files',
  mock: 'Generated test data, not real students',
  mixed: 'More than one source',
  none: 'No students',
};

export default function ClassEstimationReportPage() {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [run, setRun] = useState<SavedRunDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // The app scrolls an inner panel, not the window, so without this the page opens wherever the estimator
  // was left scrolled to. See scrollToTop.ts.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(rootRef);

  const loadRun = useCallback(async (id: string) => {
    const res = await fetch(`/api/class-estimation/runs/${id}`).catch(() => null);
    if (!res?.ok) {
      setError('That estimate could not be opened.');
      setStatus('error');
      return;
    }
    setRun(await res.json());
    setStatus('ready');
  }, []);

  // The most recent estimate is what someone almost always wants, so it opens without being asked for.
  useEffect(() => {
    fetch('/api/class-estimation/runs')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list: SavedRun[] = Array.isArray(data?.runs) ? data.runs : [];
        setRuns(list);
        if (list.length === 0) {
          setStatus('empty');
          return;
        }
        void loadRun(list[0].id);
      })
      .catch(() => {
        setError('Saved estimates could not be loaded.');
        setStatus('error');
      });
  }, [loadRun]);

  const visibleUnits = run
    ? run.units.filter((unit) => unit.unitCode.toLowerCase().includes(search.trim().toLowerCase()))
    : [];

  // What the figure is mostly made of, which is the difference between a class that will run and one that
  // might. Compulsory units are certain; elective-heavy ones are a spread across options.
  const describeBasis = (unit: RunUnit): string => {
    if (unit.fromNewIntake > 0 && unit.fromNamedPicks === 0 && unit.fromElectives === 0) return 'New students';
    if (unit.fromElectives > unit.fromNamedPicks + unit.fromNewIntake) return 'Mostly elective choice';
    if (unit.fromElectives > 0) return 'Required, some elective';
    return 'Required';
  };

  return (
    <div className={styles.panel} ref={rootRef}>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Class Size Estimate</h1>
          <p className={styles.subtitle}>
            {run
              ? `How many students to expect in each unit in semester ${run.targetSemester} of ${run.targetYear}`
              : 'How many students to expect in each unit next semester'}
          </p>
        </div>
        <Link href="/class-estimation" className={styles.backLink}>← Estimator</Link>
      </div>

      {status === 'loading' && <div className={styles.card}>Loading…</div>}

      {status === 'error' && (
        <div className={styles.card}>
          <div className={styles.errorBox}>{error}</div>
        </div>
      )}

      {status === 'empty' && (
        <div className={styles.card}>
          <div className={styles.sectionTitle}>No estimates saved yet</div>
          <p className={styles.hintText}>
            An estimate has to be produced and saved before it can be read here.{' '}
            <Link href="/class-estimation" className={styles.inlineLink}>Open the estimator</Link>, load the
            current students, then save the run.
          </p>
        </div>
      )}

      {status === 'ready' && run && (
        <>
          {/* Which estimate, and what it assumed. Kept above the figures so a number is never read alone. */}
          <div className={styles.card}>
            <div className={styles.metaTop}>
              <div>
                <div className={styles.sectionTitle}>
                  Semester {run.targetSemester}, {run.targetYear}
                </div>
                <div className={styles.metaWhen}>
                  {run.label ? `${run.label} · ` : ''}
                  produced {new Date(run.createdAt).toLocaleString()}
                </div>
              </div>

              <div className={styles.metaActions}>
                {runs.length > 1 && (
                  <select
                    className={styles.runSelect}
                    value={run.id}
                    onChange={(e) => { setStatus('loading'); void loadRun(e.target.value); }}
                  >
                    {runs.map((option) => (
                      <option key={option.id} value={option.id}>
                        {new Date(option.createdAt).toLocaleDateString()}
                        {option.label ? ` · ${option.label}` : ''}
                        {` · S${option.targetSemester} ${option.targetYear}`}
                      </option>
                    ))}
                  </select>
                )}
                <a className={styles.btnPrimary} href={`/api/class-estimation/runs/${run.id}/export`}>
                  Download Excel
                </a>
              </div>
            </div>

            <div className={styles.figures}>
              <div className={styles.figure}>
                <span className={styles.figureValue}>{run.totalHeadcount.toLocaleString()}</span>
                <span className={styles.figureLabel}>Enrolments expected</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureValue}>{run.unitCount}</span>
                <span className={styles.figureLabel}>Units running</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureValue}>{run.studentCount.toLocaleString()}</span>
                <span className={styles.figureLabel}>Current students</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureValue}>{run.newIntake.toLocaleString()}</span>
                <span className={styles.figureLabel}>New students assumed</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureValue}>{(run.retentionRate * 100).toFixed(0)}%</span>
                <span className={styles.figureLabel}>Assumed to return</span>
              </div>
            </div>

            <div className={styles.assumptions}>
              <div>
                Based on {run.studentCount.toLocaleString()} current students, of whom{' '}
                {(100 - run.retentionRate * 100).toFixed(0)}% are assumed not to return, plus{' '}
                {run.newIntake.toLocaleString()} new students. Each student is expected to take up to{' '}
                {run.loadCap} units.
              </div>
              <div>{SOURCE_LABELS[run.source] ?? run.source}</div>
              {run.commonCoreCount > 0 && (
                <div>
                  {run.commonCoreCount.toLocaleString()} students are early enough in the course that their
                  major cannot be told apart yet, so only the units every major shares are counted for them.
                </div>
              )}
            </div>
          </div>

          {/* The figures. One row per unit, largest first, no internal vocabulary. */}
          <div className={styles.card}>
            <div className={styles.tableTop}>
              <div className={styles.sectionTitle}>Expected enrolment by unit</div>
              <input
                className={styles.search}
                type="text"
                placeholder="Find a unit"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className={styles.table}>
              <div className={`${styles.row} ${styles.head}`}>
                <span>Unit</span>
                <span>Students</span>
                <span>Made up of</span>
              </div>

              {visibleUnits.map((unit) => (
                <div key={unit.unitCode} className={styles.row}>
                  <span className={styles.code}>{unit.unitCode}</span>
                  <span className={styles.count}>
                    {unit.headcount}
                    {unit.headcount === 0 && <span className={styles.notRunning}> not expected to run</span>}
                  </span>
                  <span className={styles.basis}>{describeBasis(unit)}</span>
                </div>
              ))}

              {visibleUnits.length === 0 && (
                <div className={styles.row}>
                  <span className={styles.basis}>No unit matches “{search}”.</span>
                </div>
              )}
            </div>

            <p className={styles.hintText} style={{ marginTop: 10 }}>
              Each unit is worked out on its own and rounded at the end, so the column may not add up to the
              total exactly. The Excel download carries the full breakdown and the assumptions behind it.
            </p>
          </div>

          <div className={styles.card}>
            <div className={styles.sectionTitle}>How to read this</div>
            <div className={styles.assumptions}>
              <div>
                <strong>Required</strong> means the student&apos;s planner says they still owe the unit, so
                they are expected to take it when it next runs. These figures are the firmest.
              </div>
              <div>
                <strong>Mostly elective choice</strong> means the figure comes from students spread across
                the electives they could pick. Nobody can say which one a given student will choose, so each
                student contributes a share to every option open to them. Individual units are rough; the
                total across a pool is the reliable part.
              </div>
              <div>
                <strong>New students</strong> are the intake figure entered by hand, placed on the units every
                first-semester student takes.
              </div>
              <div>
                This is an estimate, not a roll. It is built to be close enough to plan staffing and rooms
                against, and it is worth checking against the first week&apos;s real enrolments.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
