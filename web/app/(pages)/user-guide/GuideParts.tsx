'use client';

/**
 * Building blocks for the user guide (Easy and Classic): a screenshot with its numbered legend, and the small diagrams.
 * The diagrams are plain HTML and CSS (no images) so they follow the light and dark colours of the app.
 */
import React from 'react';
import { ArrowRight, Check, CircleHelp, X } from 'lucide-react';
import styles from './page.module.css';
import { SHOTS, shotFor, EASY_ONLY } from './shots';
import { useDesign } from '../../../styles/themeProvider';

// ---------------------------------------------------------------------------
// Screenshot with a numbered legend. The numbers in the picture come from the same spec (shots.ts).
// ---------------------------------------------------------------------------

export function Shot({ id }: { id: keyof typeof SHOTS }) {
  const classic = useDesign() !== 'meadow';
  const shot = shotFor(id, classic);
  // Classic has its own set of pictures; the ones about Easy's own features are shared
  const folder = classic && !EASY_ONLY.includes(id) ? 'guide/classic' : 'guide';
  return (
    <figure className={styles.mFigure}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.mShotImg} src={`/${folder}/${shot.file}`} alt={shot.alt} loading="lazy" />
      <figcaption className={styles.mCaption}>{shot.caption}</figcaption>
      {shot.callouts.length > 0 && (
        <ol className={styles.mLegend} aria-label="What the numbers in the picture point to">
          {shot.callouts.map((c) => (
            <li key={c.n} value={c.n}>
              <b>{c.label}.</b> {c.text}
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

/** A coloured "good to know" box. */
export function Note({ title, children, tone = 'info' }: { title?: string; children: React.ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <aside className={`${styles.mAside} ${tone === 'warn' ? styles.mAsideWarn : ''}`}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Diagrams
// ---------------------------------------------------------------------------

const FLOW = [
  { title: 'Get the student in', text: 'Log in to the portal, or use Import.' },
  { title: 'Find them', text: 'Search by student ID, or press Load after importing.' },
  { title: 'Read the match', text: 'Check the best-fitting planner and the Graduation tab.' },
  { title: 'Plan what is left', text: 'Open Student Pathway and generate the plan.' },
  { title: 'Share it', text: 'Download the plan as a PDF or Excel file.' },
];

export function StartFlow() {
  return (
    <ol className={styles.mFlow} aria-label="The usual order of work">
      {FLOW.map((step, i) => (
        <React.Fragment key={step.title}>
          <li className={styles.mFlowStep}>
            <span className={styles.mFlowNum}>{i + 1}</span>
            <strong>{step.title}</strong>
            <span>{step.text}</span>
          </li>
          {i < FLOW.length - 1 && <ArrowRight className={styles.mFlowArrow} aria-hidden="true" />}
        </React.Fragment>
      ))}
    </ol>
  );
}

const SAMPLE_HEAD: Array<{ name: string; required: boolean }> = [
  { name: 'Course', required: true },
  { name: 'Course Title', required: false },
  { name: 'Credits', required: true },
  { name: 'Earned', required: true },
  { name: 'Status', required: true },
  { name: 'Grade', required: false },
  { name: 'Term', required: false },
];
const SAMPLE_ROWS = [
  ['COS10009', 'Introduction to Programming', '12.5', '12.5', 'Complete', 'D', '2025_SEP_S2'],
  ['COS20007', 'Object-oriented Programming', '12.5', '12.5', 'Complete', 'CP', '2026_MAR_S1'],
  ['COS30019', 'Introduction to Artificial Intelligence', '12.5', '0', 'Current', '', '2026_SEP_S2'],
  ['COS30049', 'Computing Technology Innovation Project', '12.5', '0', 'Future', '', ''],
];

export function ExcelSample() {
  return (
    <figure className={styles.mFigure}>
      <div className={styles.mSheetWrap}>
        <table className={styles.mSheet}>
          <thead>
            <tr>
              {SAMPLE_HEAD.map((h) => (
                <th key={h.name} className={h.required ? styles.mSheetReq : undefined}>
                  {h.name}
                  <span>{h.required ? 'required' : 'optional'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ROWS.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => <td key={i}>{cell || ' '}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className={styles.mCaption}>An Excel transcript the dashboard can read. The order of the columns does not matter.</figcaption>
    </figure>
  );
}

/** What each part of a planner is worth in the match percentage. These are the default weights. */
const WEIGHTS = [
  { label: 'Core units', pct: 40, tone: 'a' },
  { label: 'Major core units', pct: 30, tone: 'b' },
  { label: 'Prescribed electives', pct: 20, tone: 'c' },
  { label: 'Free electives', pct: 5, tone: 'd' },
  { label: 'Work placement', pct: 5, tone: 'e' },
] as const;

export function MatchBar() {
  return (
    <figure className={styles.mFigure}>
      <div className={styles.mBar} role="img" aria-label={WEIGHTS.map((w) => `${w.label} ${w.pct} percent`).join(', ')}>
        {WEIGHTS.map((w) => (
          <span key={w.label} className={`${styles.mBarSeg} ${styles[`mTone_${w.tone}`]}`} style={{ flexGrow: w.pct }}>
            {w.pct >= 10 ? `${w.pct}%` : ''}
          </span>
        ))}
      </div>
      <ul className={styles.mBarKey}>
        {WEIGHTS.map((w) => (
          <li key={w.label}><span className={`${styles.mKeyDot} ${styles[`mTone_${w.tone}`]}`} />{w.label} · {w.pct}%</li>
        ))}
      </ul>
      <figcaption className={styles.mCaption}>
        How the match percentage is worked out. For each planner, the share of each part the student has done is
        weighted like this, then added up.
      </figcaption>
    </figure>
  );
}

const CHECKS = [
  'Every core, major core and prescribed elective unit is passed',
  'The work placement is passed (where the planner has one)',
  'Enough elective credit is earned',
  'Nothing is still in progress',
  'At most one Conceded Pass',
  'The credit total is reached (300)',
];

export function GraduationChecks() {
  return (
    <figure className={styles.mFigure}>
      <div className={styles.mChecks}>
        <ul className={styles.mCheckList}>
          {CHECKS.map((c) => (
            <li key={c}><Check aria-hidden="true" />{c}</li>
          ))}
        </ul>
        <ArrowRight className={styles.mChecksArrow} aria-hidden="true" />
        <div className={styles.mVerdictBox}>
          <span className={styles.mVerdictYes}><Check aria-hidden="true" />All six: ELIGIBLE</span>
          <span className={styles.mVerdictNo}><X aria-hidden="true" />Any one missing: INELIGIBLE</span>
        </div>
      </div>
      <figcaption className={styles.mCaption}>What a student needs to be shown as ELIGIBLE on a planner.</figcaption>
    </figure>
  );
}

const PLAN_STEPS = [
  { title: 'Fastest first', text: 'Works out the fewest semesters that can finish the course, given what each unit needs and when it runs.' },
  { title: 'Then the planner’s order', text: 'Within that, keeps each unit in the semester the planner puts it in, and only moves one earlier when it saves time.' },
  { title: 'Catch-up units first', text: 'Failed units, and Conceded Passes that a later unit needs, are placed again before anything else.' },
];

export function PlanSteps() {
  return (
    <figure className={styles.mFigure}>
      <ol className={styles.mFlow} aria-label="How the plan is built">
        {PLAN_STEPS.map((s, i) => (
          <React.Fragment key={s.title}>
            <li className={styles.mFlowStep}>
              <span className={styles.mFlowNum}>{i + 1}</span>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </li>
            {i < PLAN_STEPS.length - 1 && <ArrowRight className={styles.mFlowArrow} aria-hidden="true" />}
          </React.Fragment>
        ))}
      </ol>
      <figcaption className={styles.mCaption}>How Student Pathway builds a plan.</figcaption>
    </figure>
  );
}

export function TermsDiagram() {
  return (
    <figure className={styles.mFigure}>
      <div className={styles.mTerms}>
        <div><strong>Sem 1</strong><span>Feb / Mar intake</span></div>
        <div><strong>Sem 2</strong><span>Aug / Sept intake</span></div>
        <div className={styles.mTermsShort}><strong>Summer · Winter</strong><span>Short breaks. Only the work placement and some MPU units run here.</span></div>
      </div>
      <figcaption className={styles.mCaption}>
        Semester names in the app. A unit is placed only in a semester it runs in, so each semester in a plan is
        labelled Feb/Mar or Aug/Sep.
      </figcaption>
    </figure>
  );
}

export function CopilotAnswer() {
  return (
    <figure className={styles.mFigure}>
      <div className={styles.mChat}>
        <div className={styles.mChatUser}>Can 102780123 graduate?</div>
        <div className={styles.mChatBot}>
          This student is not eligible yet for Data Science (2026): 8 core or major units are not yet passed, and the
          work placement is outstanding.
        </div>
        <div className={styles.mChatButtons}>
          <span>View graduation check</span>
          <span>Open Student Pathway</span>
        </div>
      </div>
      <figcaption className={styles.mCaption}>
        A copilot answer with its buttons. The buttons open the page that shows the same result, with the student
        already loaded.
      </figcaption>
    </figure>
  );
}

/** One expandable question and answer for the troubleshooting list. */
export function Fix({ problem, children }: { problem: string; children: React.ReactNode }) {
  return (
    <details className={styles.mFix}>
      <summary><CircleHelp aria-hidden="true" />{problem}</summary>
      <div className={styles.mFixBody}>{children}</div>
    </details>
  );
}
