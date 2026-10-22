/**
 * Turns one test student and what the features did with them into a list of named checks, each with the
 * expected and actual value. The checks are what the report and the jest assertions are both built from.
 */
import type { PlannerView, ScenarioData } from './db';
import type { Scenario } from '../scenarios';
import type { Transcript } from './transcript';
import { creditsOf } from './transcript';
import { expectedGraduation, expectedMatch, factsOf, lowerBoundSemesters, nextCalendarTerm, pathwayNeed, validatePlanAgainstRules } from './oracle';
import { calendarTermFor } from '../../../core/services/scheduling/customPlannerScheduler';
import type { GraduationActual, MatchActual, PathwayActual } from './actual';

export type Feature = 'matching' | 'graduation' | 'pathway';

export interface Check {
  feature: Feature;
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
  /** Why it matters, shown in the report when the check fails. */
  meaning?: string;
}

const list = (a: Iterable<string>) => {
  const arr = [...a];
  return arr.length ? arr.join(', ') : '(none)';
};

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export function matchingChecks(sc: Scenario, planner: PlannerView, t: Transcript, data: ScenarioData, actual: MatchActual): Check[] {
  const exp = expectedMatch(data, { year: planner.intakeYear, month: planner.intakeMonth }, t.rows);
  const checks: Check[] = [];
  const primary = actual.primaryMajor;
  const noMajor = actual.status === 'noMajorDetected';
  const evidence = Object.entries(exp.evidence).map(([m, n]) => `${m} ${n}`).join(', ');
  const truth = planner.major;

  if (actual.error) {
    return [{ feature: 'matching', name: 'matching runs', pass: false, expected: 'a result', actual: `error: ${actual.error}` }];
  }

  if (sc.expectNoMajor) {
    checks.push({
      feature: 'matching', name: 'no major claimed without evidence',
      pass: noMajor,
      expected: 'no major detected (nothing on the transcript points to a major)',
      actual: noMajor ? 'no major detected' : `${primary} (${actual.primaryPct}% match)`,
      meaning: 'The system named a major for a student with no major-specific units.',
    });
    return checks;
  }

  const candidates = sc.expectMajors ?? exp.candidateMajors;
  const hasEvidence = sc.expectMajors ? true : exp.hasEvidence;

  if (hasEvidence && candidates.length === 1) {
    checks.push({
      feature: 'matching', name: 'identifies the right major',
      pass: primary === candidates[0] && !noMajor,
      expected: `${candidates[0]}  (units unique to each major taken: ${evidence})`,
      actual: noMajor ? 'no major detected' : `${primary} (${actual.primaryPct}% match)`,
      meaning: 'The transcript clearly points to one major and the system chose another, or none.',
    });
    // The right planner version is only meaningful when the student's own planner is the one the evidence points to.
    if (primary === candidates[0] && candidates[0] === truth) {
      checks.push({
        feature: 'matching', name: 'picks the right planner version (intake year)',
        pass: actual.primaryPlannerId === planner.id,
        expected: planner.label,
        actual: `${actual.primaryMajor} ${actual.primaryIntake}`,
        meaning: 'Right major but the wrong intake year, so the unit list would differ from the student\'s real planner.',
      });
    }
  } else if (hasEvidence) {
    checks.push({
      feature: 'matching', name: 'does not pick a major the evidence cannot support',
      pass: noMajor || (primary !== null && candidates.includes(primary)),
      expected: `"no major yet" or one of the tied majors: ${candidates.join(', ')}  (unique units taken: ${evidence})`,
      actual: noMajor ? 'no major detected' : `${primary} (${actual.primaryPct}% match)`,
      meaning: 'A major was named that the transcript does not point to.',
    });
  } else {
    checks.push({
      feature: 'matching', name: 'no major-specific units yet: says "no major" or the student\'s true major',
      pass: noMajor || primary === truth,
      expected: `"no major yet", or ${truth} (no unit taken is unique to any major)`,
      actual: noMajor ? 'no major detected' : `${primary} (${actual.primaryPct}% match)`,
      meaning: 'With nothing that separates the majors, the system named a different major from the one the student is actually following.',
    });
  }

  if (sc.expectSecondMajor) {
    checks.push({
      feature: 'matching', name: 'spots the second major',
      pass: actual.secondMajor === sc.expectSecondMajor,
      expected: sc.expectSecondMajor,
      actual: actual.secondMajor ?? 'none',
      meaning: 'A student who qualifies for a second major was not told.',
    });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Graduation
// ---------------------------------------------------------------------------

export function graduationChecks(planner: PlannerView, t: Transcript, actual: GraduationActual): Check[] {
  const exp = expectedGraduation(planner, t.rows);
  const out: Check[] = [];

  out.push({
    feature: 'graduation', name: 'verdict: can this student graduate?',
    pass: exp.eligible === actual.isEligible,
    expected: `${exp.eligible ? 'ELIGIBLE' : 'NOT eligible'}${exp.reasons.length ? ` — ${exp.reasons.join('; ')}` : ''}`,
    actual: `${actual.isEligible ? 'ELIGIBLE' : 'INELIGIBLE'}${actual.reasons.length ? ` — ${actual.reasons.join('; ')}` : ''}`,
    meaning: exp.eligible
      ? 'A student who has met every requirement was told they have not.'
      : 'A student who has NOT met every requirement was told they are eligible to graduate.',
  });

  // The units the audit names as still needed: core, major, prescribed electives and the work placement.
  const shown = new Set([...actual.coreMissing, ...actual.prescribedMissing, ...(actual.wilMissing ? [actual.wilMissing] : [])].map((c) => c.toUpperCase()));
  const want = new Set(exp.missingCompulsory);
  const missingFromList = [...want].filter((c) => !shown.has(c));
  const wronglyListed = [...shown].filter((c) => !want.has(c));
  out.push({
    feature: 'graduation', name: 'lists the units still needed',
    pass: missingFromList.length === 0 && wronglyListed.length === 0,
    expected: list(want),
    actual: list(shown) + (missingFromList.length ? `  — missing from list: ${missingFromList.join(', ')}` : '') + (wronglyListed.length ? `  — listed but not needed: ${wronglyListed.join(', ')}` : ''),
    meaning: 'The advisor is given the wrong list of what the student still has to take.',
  });

  // Requirements that are not a named unit: electives, Conceded Pass limit, units still in progress.
  const problems: string[] = [];
  if (actual.electiveShortfallUnits !== exp.electiveShortfallUnits) problems.push(`electives still needed: expected ${exp.electiveShortfallUnits}, audit says ${actual.electiveShortfallUnits}`);
  if (actual.concededOverLimit !== exp.concededCount > 1) problems.push(`Conceded Pass limit: expected ${exp.concededCount > 1 ? 'over' : 'within'} (${exp.concededCount} passes), audit says ${actual.concededOverLimit ? 'over' : 'within'}`);
  if (new Set(actual.inProgress).size !== new Set(exp.inProgress).size) problems.push(`units in progress: expected ${exp.inProgress.length}, audit says ${actual.inProgress.length}`);
  const needsExtra = exp.electiveShortfallUnits > 0 || exp.concededCount > 1 || exp.inProgress.length > 0;
  if (needsExtra || problems.length) {
    out.push({
      feature: 'graduation', name: 'flags electives still needed, Conceded Pass limit and units in progress',
      pass: problems.length === 0,
      expected: [
        exp.electiveShortfallUnits ? `${exp.electiveShortfallUnits} more elective(s)` : '',
        exp.concededCount > 1 ? 'too many Conceded Passes' : '',
        exp.inProgress.length ? `${exp.inProgress.length} unit(s) in progress` : '',
      ].filter(Boolean).join('; ') || 'nothing extra',
      actual: problems.length ? problems.join('; ') : 'flagged',
      meaning: 'A requirement other than a named core/major unit is outstanding and the audit does not report it correctly.',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pathway
// ---------------------------------------------------------------------------

export interface PathwayMetrics {
  semestersPlanned: number;
  lowerBound: number;
  gap: number;
  chain: number;
  capacity: number;
  requiredUnits: number;
  electivesNeeded: number;
  alignedPct: number | null;
}

export function pathwayChecks(sc: Scenario, planner: PlannerView, t: Transcript, data: ScenarioData, actual: PathwayActual): { checks: Check[]; metrics: PathwayMetrics | null } {
  const checks: Check[] = [];
  if (!actual.success) {
    return {
      checks: [{ feature: 'pathway', name: 'generates a pathway', pass: false, expected: 'a plan', actual: `HTTP ${actual.httpStatus}: ${actual.error ?? 'no plan returned'}`, meaning: 'No pathway could be produced for this student.' }],
      metrics: null,
    };
  }
  const facts = factsOf(t.rows);
  const need = pathwayNeed(planner, t.rows, data);
  const planCodes = new Map<string, string>();
  let electivesInPlan = 0;
  for (const s of actual.semesters) {
    for (const u of s.units) {
      const code = u.code.toUpperCase();
      if (u.category === 'elective') electivesInPlan++;
      if (code !== 'ELECTIVE') planCodes.set(code, u.category);
    }
  }
  const baseCredits = [...facts.counted, ...facts.inProgress].reduce((s, c) => s + creditsOf(c), 0);

  checks.push({ feature: 'pathway', name: 'generates a pathway', pass: true, expected: 'a plan', actual: `${actual.semesters.length} semester(s)` });

  // 0. the plan starts in the semester that actually comes next
  if (actual.semesters.length > 0) {
    const next = nextCalendarTerm(t.rows, planner.intakeSemester);
    const first = actual.semesters[0];
    const planTerm = calendarTermFor(first.semester, planner.intakeSemester);
    const label = (n: number) => (n === 1 ? 'Feb/Mar semester' : 'Aug/Sept semester');
    // Skipping the very next semester is fine when nothing left to take is offered then.
    const nothingRunsNext = first.units.every((u) => {
      const offered = data.units.get(u.code.toUpperCase())?.offered ?? [];
      return offered.length > 0 && !offered.includes(next.term);
    });
    checks.push({
      feature: 'pathway', name: 'starts in the semester that really comes next',
      pass: planTerm === next.term || nothingRunsNext,
      expected: `${label(next.term)}  (${next.basis})`,
      actual: `first planned semester is Y${first.year} S${first.semester}, which runs in the ${label(planTerm)}`,
      meaning: 'Every unit is then placed in the wrong semester, so units get scheduled when they are not offered, or are held back needlessly.',
    });
  }

  // 1. everything still owed is in the plan
  const missing = need.required.filter((c) => !planCodes.has(c));
  const unplaced = actual.unschedulable.map((u) => u.code.toUpperCase()).filter((c) => need.required.includes(c));
  checks.push({
    feature: 'pathway', name: 'includes every unit still needed to graduate',
    pass: missing.length === 0,
    expected: need.required.length ? `${list(need.required)}${need.forcedRetakes.length ? `  (forced retake: ${need.forcedRetakes.join(', ')})` : ''}` : '(nothing left to take)',
    actual: missing.length ? `missing from plan: ${missing.join(', ')}${unplaced.length ? `; reported unplaceable: ${unplaced.join(', ')}` : ''}` : 'all present',
    meaning: 'The student would follow this pathway and still not be able to graduate.',
  });

  // 2. no units the student does not need
  const extra = [...planCodes].filter(([code, cat]) => !need.required.includes(code) && cat !== 'elective').map(([c]) => c);
  checks.push({
    feature: 'pathway', name: 'adds no unit the student does not need',
    pass: extra.length === 0,
    expected: '(none)',
    actual: list(extra),
    meaning: 'The plan schedules units the student already passed, or that are not required.',
  });

  // 3. elective count
  checks.push({
    feature: 'pathway', name: 'schedules exactly the electives still owed',
    pass: electivesInPlan === need.electiveUnits,
    expected: `${need.electiveUnits} elective(s)`,
    actual: `${electivesInPlan} elective(s) in plan`,
    meaning: 'The number of electives in the plan differs from the number still owed: too many lengthens the course, too few leaves the student short of credit.',
  });

  // 4. valid placements
  const violations = validatePlanAgainstRules(actual.semesters as never, planner, data, { ...need, doneCodes: new Set(need.doneCodes), conceded: new Set(need.conceded) }, baseCredits);
  checks.push({
    feature: 'pathway', name: 'every placement obeys offering terms, requisites and the 4-unit load',
    pass: violations.length === 0,
    expected: '(no violations)',
    actual: violations.length ? violations.slice(0, 6).map((v) => `${v.semester} ${v.unit}: ${v.problem}`).join(' | ') : 'none',
    meaning: 'The pathway tells the student to take a unit they cannot enrol in.',
  });

  // 5. unresolved warnings from the scheduler itself
  const bad = actual.warnings.filter((w) => ['requisite_violation', 'budget_exhausted', 'not_offered'].includes(w.kind) || (w.kind === 'short_term_only' && String(w.unitCode).toUpperCase() !== 'ICT20016'));
  checks.push({
    feature: 'pathway', name: 'finishes without leaving units stranded',
    pass: bad.length === 0,
    expected: '(no unplaceable units)',
    actual: bad.length ? bad.map((w) => `${w.kind}${w.unitCode ? ' ' + w.unitCode : ''}${w.unitCodes ? ' ' + (w.unitCodes as string[]).join(',') : ''}`).join('; ') : 'none',
    meaning: 'Some required units could not be fitted into the pathway at all.',
  });

  // 6. work placement
  if (need.wilNeeded) {
    const wil = planner.units.find((u) => u.category === 'wil')!.code;
    checks.push({
      feature: 'pathway', name: 'provides for the work placement',
      pass: actual.breakMilestones.some((m) => m.unitCode.toUpperCase() === wil),
      expected: `${wil} placed in a break term`,
      actual: actual.breakMilestones.length ? actual.breakMilestones.map((m) => m.unitCode).join(', ') : 'no placement shown',
      meaning: 'The student still owes the work placement and the pathway never mentions it.',
    });
  }

  // 7. speed
  const startSem = (actual.startSemester === 2 ? 2 : 1) as 1 | 2;
  const lb = lowerBoundSemesters(planner, data, need, baseCredits, startSem);
  const total = need.required.length + need.electiveUnits;
  const planned = actual.semesters.length;
  const bound = total === 0 ? 0 : lb.bound;
  const gap = planned - bound;
  checks.push({
    feature: 'pathway', name: 'finishes as fast as possible',
    pass: gap <= 1 && (total > 0 || planned === 0),
    expected: total === 0 ? 'no semesters needed' : `about ${bound} semester(s) (chains force ${lb.chain}, 4 units a semester needs ${lb.capacity})`,
    actual: `${planned} semester(s)${gap > 0 ? `  (${gap} longer than the minimum)` : ''}`,
    meaning: 'The pathway is longer than it needs to be.',
  });

  // Self-check on the expectation itself: a valid plan can never be shorter than the lower bound. If one is,
  // the bound (this test suite) is wrong, not the feature, so it is reported loudly.
  if (planned < bound && violations.length === 0) {
    checks.push({
      feature: 'pathway', name: 'TEST SUITE SELF-CHECK: lower bound is consistent with a valid plan',
      pass: false, expected: `a plan of at least ${bound} semester(s)`, actual: `a valid plan of ${planned} exists; the suite's minimum is wrong`,
      meaning: 'This is a fault in the test, not in the application.',
    });
  }

  // 8. alignment with the planner, for students who are exactly on schedule
  let alignedPct: number | null = null;
  if (sc.onTrack && sc.resumeOffset !== undefined) {
    const startIdx = ((actual.startYear ?? 1) - 1) * 2 + ((actual.startSemester ?? 1) - 1);
    const expectedBySem = new Map<number, Set<string>>();
    for (const u of planner.units) {
      if (u.semester !== 1 && u.semester !== 2) continue;
      if (u.category === 'mpu' || u.category === 'wil' || u.category === 'elective') continue;
      if (need.doneCodes.has(u.code)) continue;
      const j = (u.year - 1) * 2 + (u.semester - 1) - sc.resumeOffset;
      if (!expectedBySem.has(j)) expectedBySem.set(j, new Set());
      expectedBySem.get(j)!.add(u.code);
    }
    let want = 0, hit = 0;
    const off: string[] = [];
    for (const [j, codes] of expectedBySem) {
      const placed = new Set(
        actual.semesters.filter((s) => ((s.year - 1) * 2 + (s.semester - 1)) - startIdx === j).flatMap((s) => s.units.map((u) => u.code.toUpperCase())),
      );
      for (const c of codes) { want++; if (placed.has(c)) hit++; else off.push(`${c} (planner sem ${j + 1})`); }
    }
    alignedPct = want === 0 ? 100 : Math.round((hit / want) * 100);
    checks.push({
      feature: 'pathway', name: 'matches the planner semester by semester (student is on schedule)',
      pass: alignedPct === 100,
      expected: '100% of remaining units in their planner semester',
      actual: `${alignedPct}% aligned${off.length ? `; elsewhere: ${off.slice(0, 6).join(', ')}` : ''}`,
      meaning: 'An on-schedule student is given a pathway that departs from the study planner.',
    });
  }

  return {
    checks,
    metrics: { semestersPlanned: planned, lowerBound: bound, gap, chain: lb.chain, capacity: lb.capacity, requiredUnits: need.required.length, electivesNeeded: need.electiveUnits, alignedPct },
  };
}

// ---------------------------------------------------------------------------
// What should happen to this student, in a few plain lines (for the report)
// ---------------------------------------------------------------------------

export function describeExpectation(sc: Scenario, planner: PlannerView, t: Transcript, data: ScenarioData): string[] {
  const m = expectedMatch(data, { year: planner.intakeYear, month: planner.intakeMonth }, t.rows);
  const g = expectedGraduation(planner, t.rows);
  const need = pathwayNeed(planner, t.rows, data);
  const facts = factsOf(t.rows);
  const lines: string[] = [];
  lines.push(`Transcript: ${facts.passed.size} passed or exempt, ${facts.conceded.size} conceded, ${facts.inProgress.size} in progress, ${facts.failed.size} failed and not retaken.`);
  if (sc.expectNoMajor) lines.push('Matching should: say no major can be detected.');
  else if (sc.expectMajors) lines.push(`Matching should: pick ${sc.expectMajors.join(' or ')}.`);
  else if (m.hasEvidence && m.unambiguous) lines.push(`Matching should: pick ${m.candidateMajors[0]}${m.candidateMajors[0] === planner.major ? ` on the ${planner.intakeYear} ${planner.intakeMonth === 9 ? 'Aug/Sept' : 'Feb/Mar'} planner` : ''}.`);
  else if (m.hasEvidence) lines.push(`Matching should: say no major yet, or one of ${m.candidateMajors.join(', ')}.`);
  else lines.push(`Matching should: say no major yet, or ${planner.major} (nothing taken is unique to any major).`);
  if (sc.expectSecondMajor) lines.push(`Matching should also: report ${sc.expectSecondMajor} as a second major.`);
  lines.push(g.eligible
    ? 'Graduation audit should: say ELIGIBLE.'
    : `Graduation audit should: say NOT eligible (${g.reasons.join('; ')})${g.missingCompulsory.length ? `, listing ${g.missingCompulsory.join(', ')}` : ''}.`);
  const total = need.required.length + need.electiveUnits;
  lines.push(total === 0
    ? `Pathway should: need no further semesters${need.wilNeeded ? ' apart from the work placement' : ''}.`
    : `Pathway should: place ${need.required.length} unit(s)${need.forcedRetakes.length ? ` (retaking ${need.forcedRetakes.join(', ')})` : ''} and ${need.electiveUnits} elective(s)${need.wilNeeded ? ', plus the work placement' : ''}, as fast as the rules allow${sc.onTrack ? ', in the same semesters as the planner' : ''}.`);
  return lines;
}
