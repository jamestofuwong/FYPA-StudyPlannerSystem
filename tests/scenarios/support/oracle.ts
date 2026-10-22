/**
 * The "what should happen" side of the scenario suite.
 *
 * Everything here is derived from the planners, the unit data and the university's rules, NOT from the code
 * under test, so a bug in the matcher, the graduation tab or the scheduler cannot also hide itself in the
 * expectation. The only helper borrowed from the application is calendarTermFor (a two-line mapping from a
 * study semester to a calendar term).
 */
import type { Row } from './transcript';
import { creditsOf } from './transcript';
import type { Cond, PlannerView, ScenarioData } from './db';
import { calendarTermFor } from '../../../core/services/scheduling/customPlannerScheduler';

// ---------------------------------------------------------------------------
// Transcript reading (deliberately independent of core/shared/constants/grades.ts)
// ---------------------------------------------------------------------------

const PASS = new Set(['HD', 'D', 'C', 'P', 'SP', 'CP']);
const FAIL = new Set(['N', 'SN']);

export type State = 'passed' | 'conceded' | 'in_progress' | 'failed' | 'not_taken';
const RANK: Record<State, number> = { passed: 5, conceded: 4, in_progress: 3, failed: 2, not_taken: 1 };

export function stateOf(row: Row): State {
  const grade = (row.grade ?? '').trim().toUpperCase();
  if (grade === 'CP') return 'conceded';
  if (PASS.has(grade)) return 'passed';
  if (FAIL.has(grade)) return 'failed';
  // No grade: an exemption / credit transfer if complete, in progress if current, otherwise not yet taken.
  if (row.status === 'Complete') return 'passed';
  if (row.status === 'Current') return 'in_progress';
  return 'not_taken';
}

export function statesByCode(rows: Row[]): Map<string, State> {
  const out = new Map<string, State>();
  for (const r of rows) {
    const code = r.courseId.trim().toUpperCase();
    const s = stateOf(r);
    if (!out.has(code) || RANK[s] > RANK[out.get(code)!]) out.set(code, s);
  }
  return out;
}

export interface Facts {
  states: Map<string, State>;
  passed: Set<string>;       // full passes and exemptions (a Conceded Pass is NOT here)
  conceded: Set<string>;
  inProgress: Set<string>;
  failed: Set<string>;       // failed and never since passed
  counted: Set<string>;      // anything that earned credit: passed + conceded
}

export function factsOf(rows: Row[]): Facts {
  const states = statesByCode(rows);
  const pick = (s: State) => new Set([...states].filter(([, v]) => v === s).map(([k]) => k));
  const passed = pick('passed');
  const conceded = pick('conceded');
  return { states, passed, conceded, inProgress: pick('in_progress'), failed: pick('failed'), counted: new Set([...passed, ...conceded]) };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface MatchingExpectation {
  /** Majors the evidence supports equally well (only meaningful when `hasEvidence`). */
  candidateMajors: string[];
  /** True when at least one major has units that point to it and to no other major. */
  hasEvidence: boolean;
  unambiguous: boolean;
  /** Per major: units the student has taken that appear on that major's planner and on no other major's. */
  evidence: Record<string, number>;
}

/**
 * Evidence for a major is the number of units the student has taken (passed, conceded, or in progress) that
 * sit on that major's planner and on NO other major's planner for the same intake. Core units and shared
 * electives appear on every planner, so they say nothing about which major the student is in. A unit that is
 * major-core for one major but merely an elective on another is also not exclusive, because a student of the
 * other major would take it too.
 */
export function expectedMatch(data: ScenarioData, intake: { year: number; month: number }, rows: Row[]): MatchingExpectation {
  const facts = factsOf(rows);
  const taken = new Set([...facts.counted, ...facts.inProgress]);
  const planners = data.planners.filter((p) => p.intakeYear === intake.year && p.intakeMonth === intake.month);
  const codesOf = (p: PlannerView) => new Set(p.units.map((u) => u.code));
  const evidence: Record<string, number> = {};
  for (const p of planners) {
    const others = planners.filter((o) => o !== p).map(codesOf);
    evidence[p.major] = [...codesOf(p)].filter((c) => taken.has(c) && !c.startsWith('MPU') && !others.some((set) => set.has(c))).length;
  }
  const best = Math.max(...Object.values(evidence));
  const candidateMajors = best > 0 ? Object.entries(evidence).filter(([, n]) => n === best).map(([m]) => m) : [];
  return { candidateMajors, hasEvidence: best > 0, unambiguous: candidateMajors.length === 1, evidence };
}

// ---------------------------------------------------------------------------
// Graduation
// ---------------------------------------------------------------------------

export interface GraduationExpectation {
  eligible: boolean;
  /** Compulsory units (core, major core, prescribed elective, WIL) not yet passed, in progress ones included. */
  missingCompulsory: string[];
  inProgress: string[];
  /** How many more elective units are needed to reach the planner's elective credits. */
  electiveShortfallUnits: number;
  wilMissing: boolean;
  concededCount: number;
  creditsEarned: number;
  reasons: string[];
}

export const COMPULSORY = new Set(['core', 'major_core', 'prescribed_elective', 'wil']);

/**
 * Older planners record no separate WIL credit (wil_cp is empty) and fold the 25-credit placement into the
 * elective requirement, where it is worth two elective units (100 elective credits = 2 prescribed + 4 open
 * slots + the placement). Newer planners list WIL as its own 25 credits next to a 75-credit elective block.
 */
export function wilCountsAsElectives(planner: PlannerView): boolean {
  return planner.wilCp == null && planner.units.some((u) => u.category === 'wil');
}

/**
 * Can this student graduate on this planner, and if not what do they still owe?
 *
 * A student graduates when ALL of:
 *   1. every compulsory unit on the planner (core, major core, prescribed elective, WIL placement) is passed
 *   2. enough elective credit is earned: the planner's elective credits, counting prescribed electives and any
 *      other unit the student passed that is not compulsory
 *   3. nothing is still in progress (results are not in yet)
 *   4. at most one Conceded Pass (Swinburne regulation)
 *   5. total credit reaches 300
 * MPU units are outside this check, as they are in the application: which of a pair applies depends on the
 * student's nationality, which the data does not record.
 */
export function expectedGraduation(planner: PlannerView, rows: Row[]): GraduationExpectation {
  const facts = factsOf(rows);
  const compulsory = planner.units.filter((u) => COMPULSORY.has(u.category));
  const compulsoryCodes = new Set(compulsory.map((u) => u.code));

  const missingCompulsory = [...new Set(compulsory.filter((u) => !facts.counted.has(u.code)).map((u) => u.code))];
  const inProgress = [...facts.inProgress];

  // Elective credit: prescribed electives plus anything passed that is not compulsory and not an MPU.
  const prescribed = new Set(planner.units.filter((u) => u.category === 'prescribed_elective').map((u) => u.code));
  const wilCode = planner.units.find((u) => u.category === 'wil')?.code;
  const wilInElectives = wilCountsAsElectives(planner);
  const electiveEarned = [...facts.counted]
    .filter((c) => !c.startsWith('MPU'))
    .filter((c) => prescribed.has(c) || !compulsoryCodes.has(c) || (wilInElectives && c === wilCode))
    .reduce((sum, c) => sum + creditsOf(c), 0);
  const electiveNeeded = planner.electiveCp ?? 0;
  // Prescribed electives still unpassed are already listed as missing compulsory units, so they are not
  // counted a second time as an elective shortfall.
  const prescribedOwed = [...prescribed].filter((c) => !facts.counted.has(c)).length * 12.5;
  const wilOwed = wilInElectives && wilCode && !facts.counted.has(wilCode) ? creditsOf(wilCode) : 0;
  const electiveShortfallUnits = Math.max(0, Math.ceil((electiveNeeded - electiveEarned - prescribedOwed - wilOwed) / 12.5));

  const creditsEarned = [...facts.counted].reduce((s, c) => s + creditsOf(c), 0);
  const wil = compulsory.find((u) => u.category === 'wil');
  const wilMissing = !!wil && !facts.counted.has(wil.code);

  const reasons: string[] = [];
  if (missingCompulsory.length) reasons.push(`${missingCompulsory.length} compulsory unit(s) not passed`);
  if (electiveShortfallUnits) reasons.push(`${electiveShortfallUnits} elective unit(s) short`);
  if (inProgress.length) reasons.push(`${inProgress.length} unit(s) still in progress`);
  if (facts.conceded.size > 1) reasons.push(`${facts.conceded.size} Conceded Passes (maximum 1)`);
  if (creditsEarned < 300) reasons.push(`${creditsEarned} of 300 credits`);

  return {
    eligible: reasons.length === 0,
    missingCompulsory,
    inProgress,
    electiveShortfallUnits,
    wilMissing,
    concededCount: facts.conceded.size,
    creditsEarned,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Pathway
// ---------------------------------------------------------------------------

export interface PathwayNeed {
  /** Named compulsory units that must appear in the plan. */
  required: string[];
  /** Conceded-pass units that must be retaken because a still-needed unit requires them as a prerequisite. */
  forcedRetakes: string[];
  /** Number of elective units the plan has to supply. */
  electiveUnits: number;
  wilNeeded: boolean;
  /** Completed (passed or in progress) codes the scheduler may treat as done. */
  doneCodes: Set<string>;
  conceded: Set<string>;
}

function groupSatisfiable(groups: Cond[][], done: Set<string>, conceded: Set<string>, pending: Set<string>): boolean {
  if (groups.length === 0) return true;
  return groups.some((g) =>
    g.every((c) => {
      if (c.type === 'credit_points') return true;
      if (c.requisiteType === 'antirequisite') return !done.has(c.unitCode) && !conceded.has(c.unitCode);
      // prerequisite / corequisite: done in full, or still to be taken in this plan
      return (done.has(c.unitCode) && !conceded.has(c.unitCode)) || pending.has(c.unitCode);
    }),
  );
}

export function pathwayNeed(planner: PlannerView, rows: Row[], data: ScenarioData): PathwayNeed {
  const facts = factsOf(rows);
  // The dashboard hands the scheduler everything passed or in progress as "done".
  const doneCodes = new Set<string>([...facts.passed, ...facts.conceded, ...facts.inProgress]);
  const named = planner.units.filter((u) => u.category !== 'mpu' && u.category !== 'wil');
  const requiredCompulsory = named
    .filter((u) => u.category === 'core' || u.category === 'major_core' || u.category === 'prescribed_elective')
    .map((u) => u.code)
    .filter((c) => !doneCodes.has(c));

  // A Conceded Pass earns credit but cannot satisfy a prerequisite. If a unit still to be taken needs one and
  // has no other route, the Conceded Pass has to be retaken.
  const pending = new Set(requiredCompulsory);
  const forced = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const code of [...pending]) {
      const groups = data.units.get(code)?.groups ?? [];
      if (groupSatisfiable(groups, doneCodes, facts.conceded, pending)) continue;
      for (const g of groups) {
        for (const c of g) {
          if (c.type === 'unit' && c.requisiteType !== 'antirequisite' && facts.conceded.has(c.unitCode) && !pending.has(c.unitCode)) {
            pending.add(c.unitCode);
            forced.add(c.unitCode);
            grew = true;
          }
        }
      }
    }
  }

  // Electives still owed: planner elective credit less what is earned or in progress, outside the compulsory set.
  const compulsoryCodes = new Set(planner.units.filter((u) => COMPULSORY.has(u.category)).map((u) => u.code));
  const prescribed = new Set(planner.units.filter((u) => u.category === 'prescribed_elective').map((u) => u.code));
  const wilUnit = planner.units.find((u) => u.category === 'wil');
  const wilInElectives = wilCountsAsElectives(planner);
  const electiveHave = [...doneCodes]
    .filter((c) => !c.startsWith('MPU'))
    .filter((c) => prescribed.has(c) || !compulsoryCodes.has(c) || (wilInElectives && c === wilUnit?.code))
    .reduce((s, c) => s + creditsOf(c), 0);
  // Prescribed electives still to take are in `required`, so they are not also counted as free electives.
  const prescribedOwed = [...prescribed].filter((c) => !doneCodes.has(c)).length * 12.5;
  const wilOwed = wilInElectives && wilUnit && !doneCodes.has(wilUnit.code) ? creditsOf(wilUnit.code) : 0;
  const electiveUnits = Math.max(0, Math.ceil(((planner.electiveCp ?? 0) - electiveHave - prescribedOwed - wilOwed) / 12.5));

  const wil = wilUnit;
  return {
    required: [...requiredCompulsory, ...forced],
    forcedRetakes: [...forced],
    electiveUnits,
    wilNeeded: !!wil && !doneCodes.has(wil.code) && !facts.conceded.has(wil.code),
    doneCodes,
    conceded: facts.conceded,
  };
}

export interface PlanSemester { year: number; semester: 1 | 2; units: { code: string; category: string }[] }

export interface Violation { semester: string; unit: string; problem: string }

/** Checks a finished plan against the unit rules: offering terms, requisites, credit points, load. */
export function validatePlanAgainstRules(
  semesters: PlanSemester[],
  planner: PlannerView,
  data: ScenarioData,
  need: PathwayNeed,
  baseCredits: number,
): Violation[] {
  const out: Violation[] = [];
  const done = new Set(need.doneCodes);
  let credits = baseCredits;

  for (const sem of semesters) {
    const label = `Y${sem.year}S${sem.semester}`;
    const term = calendarTermFor(sem.semester, planner.intakeSemester);
    const inSemester = new Set(sem.units.map((u) => u.code.toUpperCase()));
    const standard = sem.units.filter((u) => u.category !== 'mpu' && u.code !== 'ELECTIVE').length;
    if (standard > 4) out.push({ semester: label, unit: '-', problem: `${standard} standard units (maximum 4)` });

    for (const u of sem.units) {
      const code = u.code.toUpperCase();
      if (code === 'ELECTIVE') continue;
      const info = data.units.get(code);
      if (!info) { out.push({ semester: label, unit: code, problem: 'unit not in the database' }); continue; }
      if (info.offered.length > 0 && !info.offered.includes(term)) {
        out.push({ semester: label, unit: code, problem: `not offered in term ${term} (offered ${info.offered.join(',')})` });
      }
      if (info.groups.length > 0) {
        const ok = info.groups.some((g) =>
          g.every((c) => {
            if (c.type === 'credit_points') return credits >= c.creditPoints;
            const full = done.has(c.unitCode) && !need.conceded.has(c.unitCode);
            if (c.requisiteType === 'antirequisite') return !done.has(c.unitCode) && !inSemester.has(c.unitCode);
            if (c.requisiteType === 'corequisite') return full || inSemester.has(c.unitCode);
            return full;
          }),
        );
        if (!ok) out.push({ semester: label, unit: code, problem: 'requisites not met when placed' });
      }
    }
    for (const u of sem.units) {
      if (u.code === 'ELECTIVE') { credits += 12.5; continue; }
      done.add(u.code.toUpperCase());
      need.conceded.delete(u.code.toUpperCase());
      credits += creditsOf(u.code.toUpperCase());
    }
  }
  return out;
}

/**
 * The fewest study semesters that could possibly finish the remaining units: the larger of
 *   - how many semesters the prerequisite chains and offering terms force even with unlimited capacity, and
 *   - how many are needed at 4 units a semester.
 * Both are necessary conditions, so no valid plan can be shorter.
 */
export function lowerBoundSemesters(
  planner: PlannerView,
  data: ScenarioData,
  need: PathwayNeed,
  baseCredits: number,
  startSemester: 1 | 2,
  trace?: string[],
): { bound: number; chain: number; capacity: number } {
  const pool = new Set(need.required);
  const done = new Set(need.doneCodes);
  const conceded = new Set(need.conceded);   // a retaken Conceded Pass stops being one
  for (const c of need.forcedRetakes) done.delete(c);
  // Electives and the work placement have no requisites, so they can be taken straight away and earn credit that
  // unlocks credit-gated units (e.g. Project A needs 175). Counting that credit from the start keeps this a true minimum.
  let credits = baseCredits + need.electiveUnits * 12.5 + (need.wilNeeded ? 25 : 0);
  let sem: 1 | 2 = startSemester;
  let chain = 0;

  while (pool.size > 0 && chain < 24) {
    chain++;
    const term = calendarTermFor(sem, planner.intakeSemester);
    const now = [...pool].filter((code) => {
      const info = data.units.get(code);
      if (!info) return true;
      if (info.offered.length > 0 && !info.offered.some((t) => t === term)) return false;
      if (info.offered.length > 0 && !info.offered.some((t) => t === 1 || t === 2)) return false;
      return info.groups.length === 0 || info.groups.some((g) =>
        g.every((c) => {
          if (c.type === 'credit_points') return credits >= c.creditPoints;
          const full = done.has(c.unitCode) && !conceded.has(c.unitCode);
          if (c.requisiteType === 'antirequisite') return !done.has(c.unitCode);
          if (c.requisiteType === 'corequisite') return full || pool.has(c.unitCode);
          return full;
        }),
      );
    });
    trace?.push(`sem ${chain} (term ${term}) credits ${credits}: ${now.join(' ') || '-'}`);
    for (const code of now) { pool.delete(code); done.add(code); credits += creditsOf(code); conceded.delete(code); }
    sem = sem === 1 ? 2 : 1;
    if (now.length === 0 && chain > 4) break; // stuck: nothing can ever place
  }
  const total = need.required.length + need.electiveUnits;
  const capacity = Math.ceil(total / 4);
  return { bound: Math.max(chain, capacity), chain, capacity };
}


// ---------------------------------------------------------------------------
// Where the next study semester really is
// ---------------------------------------------------------------------------

/**
 * The calendar semester (1 = Feb/Mar, 2 = Aug/Sept) a student should resume in: the one after the latest
 * regular term they have completed or are in. Pre-enrolled ("Future") rows are not counted, because the
 * student has not started them. Terms look like 2026_SEP_S2, where S1/S2 is the calendar semester.
 * With nothing on record the student starts at their intake semester.
 */
export function nextCalendarTerm(rows: Row[], intakeSemester: 1 | 2): { term: 1 | 2; basis: string } {
  let latest: { year: number; sem: 1 | 2; label: string } | null = null;
  for (const r of rows) {
    if (r.status === 'Future') continue;
    const m = /^(\d{4})_[A-Z]+_S([12])$/.exec((r.term ?? '').trim().toUpperCase());
    if (!m) continue;
    const year = Number(m[1]); const sem = Number(m[2]) as 1 | 2;
    if (!latest || year > latest.year || (year === latest.year && sem > latest.sem)) latest = { year, sem, label: r.term };
  }
  if (!latest) return { term: intakeSemester, basis: `no regular term yet, so the intake semester (${intakeSemester})` };
  return { term: latest.sem === 1 ? 2 : 1, basis: `latest term on record is ${latest.label}` };
}
