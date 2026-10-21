/**
 * The test students. Every one starts from a real planner in the database (cross-checked against the PDFs in
 * study-planner-pdfs/) and is then bent into the situation named in its title.
 *
 * A scenario only describes the student. What should happen to them is worked out independently in
 * support/oracle.ts, so the expectations are not written into the scenarios by hand.
 */
import { calendarTermFor } from '../../core/services/scheduling/customPlannerScheduler';
import type { PlannerView, ScenarioData } from './support/db';
import { Transcript } from './support/transcript';

export type Group =
  | 'A. Follows the planner exactly'
  | 'B. Mixes electives'
  | 'C. Mixes core and major core'
  | 'D. Fails and exemptions'
  | 'E. Study length and timing'
  | 'F. Severe and unusual';

export interface Scenario {
  id: string;
  group: Group;
  title: string;
  /** What is special about this student, in plain words. */
  story: string;
  planner: [major: string, intakeYear: number, intakeMonth: number];
  /** The intake the portal reports, when it differs from the planner's (e.g. a March start on a Feb/Mar planner). */
  studentIntake?: { year: number; semester: 1 | 2 };
  build: (t: Transcript, data: ScenarioData) => void;
  /** Set for students who are exactly on schedule: the pathway must then match the planner semester for semester. */
  onTrack?: boolean;
  /** Planner semester the student resumes at, for onTrack students. */
  resumeOffset?: number;
  /** Overrides the evidence-based major expectation. */
  expectMajors?: string[];
  expectSecondMajor?: string;
  /** Matching is not expected to work for this student (no usable evidence at all). */
  expectNoMajor?: boolean;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Units already on the transcript that require `code` (directly or through others). */
function dependentsOf(t: Transcript, data: ScenarioData, code: string): string[] {
  const found = new Set<string>();
  const queue = [code.toUpperCase()];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const row of t.rows) {
      const c = row.courseId;
      if (found.has(c) || c === code.toUpperCase()) continue;
      const groups = data.units.get(c)?.groups ?? [];
      if (groups.some((g) => g.some((x) => x.type === 'unit' && x.requisiteType !== 'antirequisite' && x.unitCode === cur))) {
        found.add(c);
        queue.push(c);
      }
    }
  }
  return [...found];
}

/** Codes the student has finished strictly before regular semester `offset` (exemptions and short terms count as done). */
function doneBefore(t: Transcript, offset: number): Set<string> {
  const done = new Set<string>();
  for (const r of t.rows) {
    if (r.status !== 'Complete' || r.grade === 'N' || r.grade === 'SN') continue;
    let idx = -1;
    for (let k = 0; k < 14; k++) if (t.termAt(k) === r.term) { idx = k; break; }
    if (idx < offset) done.add(r.courseId);
  }
  return done;
}

/** True when the unit runs in that semester's calendar term and its prerequisites are already finished. */
function takeableAt(t: Transcript, data: ScenarioData, code: string, offset: number): boolean {
  const info = data.units.get(code);
  if (!info || !info.isActive) return false;
  const term = calendarTermFor((offset % 2 === 0 ? 1 : 2) as 1 | 2, t.planner.intakeSemester);
  if (info.offered.length === 0 || !info.offered.includes(term)) return false;
  if (info.groups.length === 0) return true;
  const done = doneBefore(t, offset);
  const credits = [...done].reduce((n, c) => n + (c.startsWith('MPU') ? 0 : 12.5), 0);
  return info.groups.some((g) => g.every((c) => {
    if (c.type === 'credit_points') return credits >= c.creditPoints;
    if (c.requisiteType === 'antirequisite') return !done.has(c.unitCode);
    if (c.requisiteType === 'corequisite') return done.has(c.unitCode) || t.has(c.unitCode);
    return done.has(c.unitCode);
  }));
}

/** Elective-type units anyone can take: no requisites, offered in the term, outside the planner's compulsory set. */
function freeElectives(t: Transcript, data: ScenarioData, offset: number, avoid: string[] = []): string[] {
  const term = calendarTermFor((offset % 2 === 0 ? 1 : 2) as 1 | 2, t.planner.intakeSemester);
  const used = new Set([...t.rows.map((r) => r.courseId), ...t.planner.units.map((u) => u.code), ...avoid]);
  return [...data.units.values()]
    .filter((u) => u.isActive && !u.code.startsWith('MPU') && !u.code.startsWith('ICT') && u.groups.length === 0)
    .filter((u) => u.offered.length === 0 ? false : u.offered.includes(term))
    .map((u) => u.code)
    .filter((c) => !used.has(c));
}

function plannerUnitsAt(p: PlannerView, offset: number) {
  return p.units.filter((u) => (u.semester === 1 || u.semester === 2) && (u.year - 1) * 2 + (u.semester - 1) === offset);
}

/** Named electives on the planner (not slots), in planner order. */
function namedElectives(p: PlannerView) {
  return p.units.filter((u) => u.category === 'elective' && (u.semester === 1 || u.semester === 2));
}

function offsetOf(u: { year: number; semester: number }) {
  return (u.year - 1) * 2 + (u.semester - 1);
}

/**
 * Fills the planner's open elective slots (older planners) with units of the student's choice, in the
 * semester the slot sits in. Each slot gets a different unit.
 */
function fillOpenSlots(t: Transcript, data: ScenarioData, pick: 'group' | 'free', upTo = 99, grade?: string) {
  const used = new Set<string>();
  for (const slot of t.planner.openSlots) {
    const offset = (slot.year - 1) * 2 + (slot.semester - 1);
    if (offset >= upTo) continue;
    const pool = pick === 'group'
      ? t.planner.electiveGroupCodes.filter((c) => !t.has(c) && !used.has(c) && takeableAt(t, data, c, offset))
      : freeElectives(t, data, offset, [...used]);
    const choice = pool[0];
    if (!choice) throw new Error(`no ${pick} elective available for slot at offset ${offset}`);
    used.add(choice);
    t.add(choice, { offset, grade });
  }
}

/** Every unit the student would normally need, completed over the full planner length. */
function completeEverything(t: Transcript, data: ScenarioData, opts: { wil?: boolean } = {}) {
  t.followAll();
  fillOpenSlots(t, data, 'group');
  if (opts.wil !== false) {
    const wil = t.planner.units.find((u) => u.category === 'wil');
    if (wil && !t.has(wil.code)) t.add(wil.code, { term: t.shortTermAt(offsetOf(wil) > 0 ? offsetOf(wil) : 3, 'winter') });
  }
}

/**
 * Follows the planner AND fills its open elective slots as the student goes, so a student described as "on
 * schedule" really is. (Older planners leave slots for the student to choose; skipping them would make the
 * student quietly behind.)
 */
function follow(t: Transcript, d: ScenarioData, opts: { completed: number; inProgress?: boolean; preEnrol?: boolean; skip?: string[] }) {
  t.follow(opts);
  for (const slot of t.planner.openSlots) {
    const offset = (slot.year - 1) * 2 + (slot.semester - 1);
    const status = offset < opts.completed ? 'Complete' : offset === opts.completed && opts.inProgress ? 'Current'
      : offset === opts.completed + (opts.inProgress ? 1 : 0) && opts.preEnrol ? 'Future' : null;
    if (!status) continue;
    const used = new Set(t.rows.map((r) => r.courseId));
    const choice = t.planner.electiveGroupCodes.find((c) => !used.has(c) && takeableAt(t, d, c, offset));
    if (!choice) throw new Error(`no elective for slot at offset ${offset}`);
    t.add(choice, { offset, status: status as 'Complete' | 'Current' | 'Future' });
  }
}

const NEW_CS: Scenario['planner'] = ['Cybersecurity', 2025, 9];

export function buildScenarios(): Scenario[] {
  const S: Scenario[] = [];

  // =========================================================================
  // A. Follows the planner exactly, at every stage of the course
  // =========================================================================
  S.push({
    id: 'A01', group: 'A. Follows the planner exactly', title: 'Cybersecurity, first semester finished',
    story: 'Brand-new student. Only Year 1 Semester 1 done. Every major shares those units, so the major cannot be known yet.',
    planner: NEW_CS, onTrack: true, resumeOffset: 1,
    build: (t, d) => follow(t, d, { completed: 1 }),
  });
  S.push({
    id: 'A02', group: 'A. Follows the planner exactly', title: 'Artificial Intelligence, Year 1 finished',
    story: 'Two semesters done on the Sep 2025 planner.',
    planner: ['Artificial Intelligence', 2025, 9], onTrack: true, resumeOffset: 2,
    build: (t, d) => follow(t, d, { completed: 2 }),
  });
  S.push({
    id: 'A03', group: 'A. Follows the planner exactly', title: 'Data Science, three semesters finished',
    story: 'Mar 2026 intake, 1.5 years in. First semester with major units from Year 2.',
    planner: ['Data Science', 2026, 3], onTrack: true, resumeOffset: 3,
    build: (t, d) => follow(t, d, { completed: 3 }),
  });
  S.push({
    id: 'A04', group: 'A. Follows the planner exactly', title: 'Internet of Things (Feb 2024), four semesters finished',
    story: 'Older planner that leaves four elective slots open. Student has used none of them yet.',
    planner: ['Internet of Things', 2024, 2], onTrack: true, resumeOffset: 4,
    build: (t, d) => follow(t, d, { completed: 4 }),
  });
  S.push({
    id: 'A05', group: 'A. Follows the planner exactly', title: 'Software Development (Mar 2025), five semesters finished',
    story: 'One semester left: the final-year project B and remaining units.',
    planner: ['Software Development', 2025, 3], onTrack: true, resumeOffset: 5,
    build: (t, d) => follow(t, d, { completed: 5 }),
  });
  S.push({
    id: 'A06', group: 'A. Follows the planner exactly', title: 'Cybersecurity (Sep 2024), completed the whole course',
    story: 'All six semesters passed, open elective slots filled from the planner\'s own elective list. Should graduate.',
    planner: ['Cybersecurity', 2024, 9], onTrack: true, resumeOffset: 6,
    build: (t, d) => completeEverything(t, d),
  });
  S.push({
    id: 'A07', group: 'A. Follows the planner exactly', title: 'Artificial Intelligence (Sep 2025), completed everything including WIL',
    story: 'All units plus the work placement passed. Should graduate.',
    planner: ['Artificial Intelligence', 2025, 9], onTrack: true, resumeOffset: 6,
    build: (t, d) => completeEverything(t, d),
  });
  S.push({
    id: 'A08', group: 'A. Follows the planner exactly', title: 'Data Science (Mar 2026), first semester in progress',
    story: 'Nothing passed yet; first semester units are all "Current".',
    planner: ['Data Science', 2026, 3], onTrack: true, resumeOffset: 1,
    build: (t, d) => follow(t, d, { completed: 0, inProgress: true }),
  });
  S.push({
    id: 'A09', group: 'A. Follows the planner exactly', title: 'Software Development (Sep 2024), fifth semester in progress',
    story: 'Four semesters passed, the fifth is under way. Cannot graduate until results are in.',
    planner: ['Software Development', 2024, 9], onTrack: true, resumeOffset: 5,
    build: (t, d) => follow(t, d, { completed: 4, inProgress: true }),
  });
  S.push({
    id: 'A10', group: 'A. Follows the planner exactly', title: 'Cybersecurity (Sep 2025), already pre-enrolled for next semester',
    story: 'Two semesters passed and the next semester booked ("Future") but not started.',
    planner: NEW_CS, onTrack: true, resumeOffset: 2,
    build: (t, d) => follow(t, d, { completed: 2, preEnrol: true }),
  });
  S.push({
    id: 'A11', group: 'A. Follows the planner exactly', title: 'Artificial Intelligence (Feb 2024), last semester in progress',
    story: 'Everything passed except the final semester, which is under way. Open slots already filled.',
    planner: ['Artificial Intelligence', 2024, 2], onTrack: true, resumeOffset: 6,
    build: (t, d) => { follow(t, d, { completed: 5, inProgress: true }); },
  });
  S.push({
    id: 'A12', group: 'A. Follows the planner exactly', title: 'Cybersecurity, started March 2024 on the Feb/Mar 2024 planner',
    story: 'The portal says March 2024 but the planner is labelled Feb/Mar 2024. They are the same intake.',
    planner: ['Cybersecurity', 2024, 2], studentIntake: { year: 2024, semester: 1 }, onTrack: true, resumeOffset: 3,
    build: (t, d) => follow(t, d, { completed: 3 }),
  });

  // =========================================================================
  // B. Mixes electives
  // =========================================================================
  S.push({
    id: 'B01', group: 'B. Mixes electives', title: 'Data Science, picked different electives from the planner',
    story: 'Four semesters done. Two of the planner\'s named electives were swapped for other units with no prerequisites.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 4 });
      const named = namedElectives(t.planner).filter((u) => t.has(u.code)).slice(0, 2);
      for (const u of named) {
        const alt = freeElectives(t, d, offsetOf(u)).find(Boolean);
        if (alt) t.swap(u.code, alt);
      }
    },
  });
  S.push({
    id: 'B02', group: 'B. Mixes electives', title: 'Artificial Intelligence (Feb 2024), open slots filled from the elective list',
    story: 'Full course finished; the four open slots were chosen from the planner\'s elective group. Should graduate.',
    planner: ['Artificial Intelligence', 2024, 2], onTrack: true, resumeOffset: 6,
    build: (t, d) => completeEverything(t, d),
  });
  S.push({
    id: 'B03', group: 'B. Mixes electives', title: 'Artificial Intelligence (Feb 2024), open slots filled with any unit',
    story: 'Full course finished; open slots filled with units that are not on the planner\'s elective list. Free electives are allowed, so should graduate.',
    planner: ['Artificial Intelligence', 2024, 2],
    build: (t, d) => { t.followAll(); fillOpenSlots(t, d, 'free'); },
  });
  S.push({
    id: 'B04', group: 'B. Mixes electives', title: 'Cybersecurity, took Artificial Intelligence major units as electives',
    story: 'Full Cybersecurity course, but three AI major-core units were used as electives. Still a Cybersecurity student.',
    planner: NEW_CS,
    build: (t, d) => {
      completeEverything(t, d);
      const ai = d.plannerBy('Artificial Intelligence', 2025, 9).units.filter((u) => u.category === 'major_core' && !t.has(u.code));
      const electives = namedElectives(t.planner).filter((u) => t.has(u.code)).slice(0, 3);
      electives.forEach((e, i) => { if (ai[i]) t.swap(e.code, ai[i].code); });
    },
    expectSecondMajor: undefined,
  });
  S.push({
    id: 'B05', group: 'B. Mixes electives', title: 'Software Development, finished with one elective missing',
    story: 'Everything passed except one of the six electives. Cannot graduate: one elective short.',
    planner: ['Software Development', 2025, 9],
    build: (t, d) => { completeEverything(t, d); t.remove(namedElectives(t.planner).slice(-1)[0].code); },
  });
  S.push({
    id: 'B06', group: 'B. Mixes electives', title: 'Internet of Things, took two extra electives',
    story: 'Full course plus two more electives than needed. Should still graduate.',
    planner: ['Internet of Things', 2025, 9],
    build: (t, d) => {
      completeEverything(t, d);
      freeElectives(t, d, 4).slice(0, 2).forEach((c) => t.add(c, { offset: 4 }));
    },
  });

  // =========================================================================
  // C. Mixes core and major core
  // =========================================================================
  S.push({
    id: 'C01', group: 'C. Mixes core and major core', title: 'Cybersecurity, put off Object-oriented Programming by a year',
    story: 'COS20007 (a core unit that many others depend on) was taken in Year 2 instead of Year 1. Units that need it moved later.',
    planner: NEW_CS,
    build: (t, d) => {
      follow(t, d, { completed: 4 });
      const dependents = dependentsOf(t, d, 'COS20007');
      t.remove('COS20007', ...dependents);
      t.add('COS20007', { offset: 2 });
      dependents.forEach((c) => {
        const u = t.planner.units.find((x) => x.code === c);
        if (u && offsetOf(u) + 1 < 4) t.add(c, { offset: offsetOf(u) + 1 });
      });
    },
  });
  S.push({
    id: 'C02', group: 'C. Mixes core and major core', title: 'Data Science, took Year 2 major units early',
    story: 'Two major-core units meant for Year 2 were taken in the second semester. Accelerated, but valid.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 3 });
      for (const code of ['COS30049', 'COS20031']) if (t.has(code)) t.move(code, 1);
    },
  });
  S.push({
    id: 'C03', group: 'C. Mixes core and major core', title: 'Software Development, core and major units in a scrambled order',
    story: 'All units passed but the order differs from the planner wherever the prerequisites allowed. Should graduate.',
    planner: ['Software Development', 2025, 9],
    build: (t, d) => {
      completeEverything(t, d);
      // swap the two non-dependent Year 2 and Year 3 core units around
      for (const [a, b] of [['COS10004', 'COS40005']] as const) {
        const ra = t.rowsFor(a)[0]; const rb = t.rowsFor(b)[0];
        if (ra && rb && !dependentsOf(t, d, a).includes(b)) { const x = ra.term; ra.term = rb.term; rb.term = x; }
      }
    },
  });
  S.push({
    id: 'C04', group: 'C. Mixes core and major core', title: 'Artificial Intelligence, major units done before core units',
    story: 'Student has done the major-heavy semesters first and still owes two core units. Strong major signal, weak core.',
    planner: ['Artificial Intelligence', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 6, skip: ['COS10004', 'COS20007'] });
    },
  });

  // =========================================================================
  // D. Fails and exemptions
  // =========================================================================
  S.push({
    id: 'D01', group: 'D. Fails and exemptions', title: 'Cybersecurity, failed Introduction to Programming and has not retaken it',
    story: 'COS10009 failed in semester 1, the root of most of the course. Only units that do not need it were taken afterwards.',
    planner: NEW_CS,
    build: (t, d) => {
      follow(t, d, { completed: 3 });
      const dep = dependentsOf(t, d, 'COS10009');
      t.fail('COS10009');
      t.remove(...dep);
    },
  });
  S.push({
    id: 'D02', group: 'D. Fails and exemptions', title: 'Data Science, failed Object-oriented Programming in Year 1',
    story: 'COS20007 failed. Units that need it were not taken. Needs to retake it and then the units after it.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 3 });
      const dep = dependentsOf(t, d, 'COS20007');
      t.fail('COS20007');
      t.remove(...dep);
    },
  });
  S.push({
    id: 'D03', group: 'D. Fails and exemptions', title: 'Software Development, failed a unit twice then passed on supplementary',
    story: 'COS20007 shows N, then SN, then SP. A later pass should clear the fails. Everything else passed.',
    planner: ['Software Development', 2025, 9],
    build: (t, d) => {
      completeEverything(t, d);
      t.rowsFor('COS20007')[0].grade = 'N'; t.rowsFor('COS20007')[0].creditsEarned = 0;
      t.add('COS20007', { offset: 2, grade: 'SN', earned: 0 });
      t.add('COS20007', { offset: 3, grade: 'SP' });
    },
  });
  S.push({
    id: 'D04', group: 'D. Fails and exemptions', title: 'Artificial Intelligence, failed Project B in the final semester',
    story: 'Everything passed except the final project, which is failed. One more semester needed.',
    planner: ['Artificial Intelligence', 2025, 9],
    build: (t, d) => { completeEverything(t, d); t.fail('COS40006'); },
  });
  S.push({
    id: 'D05', group: 'D. Fails and exemptions', title: 'Internet of Things, failed Project A and needs two more semesters',
    story: 'Project A failed in Year 3 Semester 1, so Project B could not be taken. Two extra semesters needed.',
    planner: ['Internet of Things', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 6, skip: ['COS40006'] });
      fillOpenSlots(t, d, 'group');
      t.fail('COS40005');
    },
  });
  S.push({
    id: 'D06', group: 'D. Fails and exemptions', title: 'Cybersecurity, Conceded Pass in Object-oriented Programming',
    story: 'COS20007 passed on a Conceded Pass (CP). A CP cannot satisfy a prerequisite, so units that need it were not taken.',
    planner: NEW_CS,
    build: (t, d) => {
      follow(t, d, { completed: 3 });
      const dep = dependentsOf(t, d, 'COS20007');
      t.conceded('COS20007');
      t.remove(...dep);
    },
  });
  S.push({
    id: 'D07', group: 'D. Fails and exemptions', title: 'Data Science, two Conceded Passes on an otherwise complete course',
    story: 'Everything passed, but two units were Conceded Passes. The regulation allows only one for graduation.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => {
      completeEverything(t, d);
      const [a, b] = namedElectives(t.planner).map((u) => u.code).filter((c) => t.has(c));
      t.conceded(a); t.conceded(b);
    },
  });
  S.push({
    id: 'D08', group: 'D. Fails and exemptions', title: 'Software Development, one Conceded Pass on an otherwise complete course',
    story: 'One CP on an elective that nothing depends on. Allowed, so should graduate.',
    planner: ['Software Development', 2025, 9],
    build: (t, d) => { completeEverything(t, d); t.conceded(namedElectives(t.planner).filter((u) => t.has(u.code))[0].code); },
  });
  S.push({
    id: 'D09', group: 'D. Fails and exemptions', title: 'Cybersecurity, exempted from all Semester 1 units',
    story: 'Credit transfer for the first-semester units (no grade, no term). Starts at the second-semester units.',
    planner: NEW_CS,
    build: (t) => {
      const first = plannerUnitsAt(t.planner, 0).map((u) => u.code).filter((c) => !c.startsWith('MPU'));
      t.exempt(...first);
      for (const u of t.planner.units.filter((x) => (x.semester === 1 || x.semester === 2) && offsetOf(x) >= 1 && offsetOf(x) <= 2 && !['MPU3142', 'MPU3143'].includes(x.code))) {
        t.add(u.code, { offset: offsetOf(u) - 1 });
      }
    },
  });
  S.push({
    id: 'D10', group: 'D. Fails and exemptions', title: 'Artificial Intelligence, advanced standing: all of Year 1 exempt',
    story: 'Every Year 1 unit given as credit transfer. Student then completed Year 2 in two semesters.',
    planner: ['Artificial Intelligence', 2025, 9],
    build: (t) => {
      const year1 = t.planner.units.filter((u) => u.year === 1 && u.category !== 'mpu').map((u) => u.code);
      t.exempt(...year1);
      for (const u of t.planner.units.filter((x) => x.year === 2 && (x.semester === 1 || x.semester === 2) && !['MPU3142', 'MPU3143'].includes(x.code))) {
        t.add(u.code, { offset: u.semester - 1 });
      }
    },
  });
  S.push({
    id: 'D11', group: 'D. Fails and exemptions', title: 'Data Science, work placement exempted through work experience',
    story: 'Everything passed and the WIL unit given as an exemption instead of a placement. Should graduate.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => { completeEverything(t, d, { wil: false }); t.exempt('ICT20016'); },
  });
  S.push({
    id: 'D12', group: 'D. Fails and exemptions', title: 'Software Development, failed half of the units they attempted',
    story: 'Academic-risk student: four semesters attempted, roughly every second unit failed and not retaken.',
    planner: ['Software Development', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 4 });
      t.rows.filter((r) => !r.courseId.startsWith('MPU')).forEach((r, i) => {
        if (i % 2 === 0) { r.grade = 'N'; r.creditsEarned = 0; }
      });
    },
  });

  S.push({
    id: 'D13', group: 'D. Fails and exemptions', title: 'Data Science, failed a unit once and retook it successfully',
    story: 'The ordinary case: COS20007 failed in semester 2, retaken and passed in semester 3, with dependent units moved a semester later.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 4 });
      const dependents = dependentsOf(t, d, 'COS20007');
      t.remove(...dependents);
      t.fail('COS20007', { offset: 2 });
      dependents.forEach((c) => {
        const u = t.planner.units.find((x) => x.code === c);
        if (u && offsetOf(u) + 1 < 4) t.add(c, { offset: offsetOf(u) + 1 });
      });
    },
  });

  // =========================================================================
  // E. Study length and timing
  // =========================================================================
  S.push({
    id: 'E01', group: 'E. Study length and timing', title: 'Cybersecurity, one extra semester needed after the planned six',
    story: 'Six semesters completed but one unit (a Year 3 elective) was dropped and still owed.',
    planner: NEW_CS,
    build: (t, d) => { completeEverything(t, d); t.remove(namedElectives(t.planner).slice(-1)[0].code); },
  });
  S.push({
    id: 'E02', group: 'E. Study length and timing', title: 'Data Science, two extra semesters needed',
    story: 'Six semesters completed, with Project A and a Year 3 major unit both missing.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => { completeEverything(t, d); t.remove('COS40005', 'COS40006'); },
  });
  S.push({
    id: 'E03', group: 'E. Study length and timing', title: 'Software Development, part-time: two units a semester',
    story: 'Five semesters elapsed but only two units each. Far behind the planner, but never failed anything.',
    planner: ['Software Development', 2025, 9],
    build: (t) => {
      const plan = t.planner.units.filter((u) => (u.semester === 1 || u.semester === 2) && u.category !== 'mpu').sort((a, b) => offsetOf(a) - offsetOf(b));
      plan.slice(0, 8).forEach((u, i) => t.add(u.code, { offset: Math.floor(i / 2) }));
    },
  });
  S.push({
    id: 'E04', group: 'E. Study length and timing', title: 'Cybersecurity, deferred a semester and came back later',
    story: 'Sep 2025 intake: one semester, then a gap, then continued from the Sep 2026 semester. The next real calendar term differs from the next "count" term.',
    planner: NEW_CS,
    build: (t) => {
      plannerUnitsAt(t.planner, 0).filter((u) => !u.code.startsWith('MPU3142')).forEach((u) => t.add(u.code, { offset: 0 }));
      // return after a one-year gap: the study term two semesters later than the planner would have it
      plannerUnitsAt(t.planner, 1).forEach((u) => t.add(u.code, { offset: 2 }));
    },
  });
  S.push({
    id: 'E05', group: 'E. Study length and timing', title: 'Internet of Things, only short-term units on the transcript',
    story: 'Student has taken nothing in a regular semester yet; only a summer-term MPU unit is on record.',
    planner: ['Internet of Things', 2025, 9],
    build: (t) => { t.add('MPU3212', { term: t.shortTermAt(1, 'summer') }); },
  });

  // =========================================================================
  // F. Severe and unusual cases
  // =========================================================================
  S.push({
    id: 'F01', group: 'F. Severe and unusual', title: 'Changed major from Cybersecurity to Software Development halfway',
    story: 'Years 1 to 2 look like Cybersecurity, then major units switch to Software Development. The advisor is reviewing against Software Development.',
    planner: ['Software Development', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 2 });
      const cs = d.plannerBy('Cybersecurity', 2025, 9);
      const sd = t.planner;
      for (const u of cs.units.filter((x) => x.category === 'major_core' && offsetOf(x) <= 2)) if (!t.has(u.code)) t.add(u.code, { offset: offsetOf(u) });
      for (const u of sd.units.filter((x) => x.category === 'major_core' && offsetOf(x) >= 2 && offsetOf(x) <= 4)) if (!t.has(u.code)) t.add(u.code, { offset: offsetOf(u) });
    },
  });
  S.push({
    id: 'F02', group: 'F. Severe and unusual', title: 'Artificial Intelligence student who also completed Data Science major units',
    story: 'Full AI course plus every Data Science major unit as electives. Qualifies for a second major.',
    planner: ['Artificial Intelligence', 2025, 9], expectSecondMajor: 'Data Science',
    build: (t, d) => {
      completeEverything(t, d);
      const ds = d.plannerBy('Data Science', 2025, 9).units.filter((u) => u.category === 'major_core' && !t.has(u.code));
      ds.forEach((u, i) => t.add(u.code, { offset: 4 + (i % 2) }));
    },
  });
  S.push({
    id: 'F03', group: 'F. Severe and unusual', title: 'Empty transcript',
    story: 'Student record exists but no units appear yet.',
    planner: NEW_CS, expectNoMajor: true,
    build: () => {},
  });
  S.push({
    id: 'F04', group: 'F. Severe and unusual', title: 'Only MPU units on the transcript',
    story: 'Only the general-studies enrolment has results so far.',
    planner: NEW_CS, expectNoMajor: true,
    build: (t) => { ['MPU3272', 'MPU3192', 'MPU3182'].forEach((c) => t.add(c, { offset: 0 })); },
  });
  S.push({
    id: 'F05', group: 'F. Severe and unusual', title: 'Messy data: odd casing, spacing and repeated rows',
    story: 'Codes in lower case with spaces, grades with spaces, and the same pass appearing twice. Should read exactly like a clean transcript.',
    planner: ['Cybersecurity', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 4 });
      t.rows.forEach((r, i) => {
        if (i % 3 === 0) r.courseId = ` ${r.courseId.toLowerCase()} `;
        if (i % 4 === 0 && r.grade) r.grade = ` ${r.grade.toLowerCase()} `;
      });
      t.rows.push({ ...t.rows[1] });
    },
  });
  S.push({
    id: 'F06', group: 'F. Severe and unusual', title: 'Units that are not in any planner',
    story: 'Transcript contains unit codes the system has never heard of, mixed in with real ones.',
    planner: ['Data Science', 2025, 9],
    build: (t, d) => {
      follow(t, d, { completed: 4 });
      t.rows.push(
        { courseId: 'ZZZ99999', courseTitle: 'Study Abroad Unit', level: '', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'D', term: t.termAt(3) },
        { courseId: 'COS99999', courseTitle: 'Unlisted Elective', level: '', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'C', term: t.termAt(3) },
      );
    },
  });
  S.push({
    id: 'F07', group: 'F. Severe and unusual', title: 'Complete course but the work placement was never done',
    story: 'Every unit passed except the WIL placement. Cannot graduate until it is done.',
    planner: ['Cybersecurity', 2025, 9],
    build: (t, d) => completeEverything(t, d, { wil: false }),
  });
  S.push({
    id: 'F08', group: 'F. Severe and unusual', title: 'Brand-new September 2026 intake, first semester in progress',
    story: 'Newest planner version, student has just started.',
    planner: ['Internet of Things', 2026, 9], onTrack: true, resumeOffset: 1,
    build: (t, d) => follow(t, d, { completed: 0, inProgress: true }),
  });
  S.push({
    id: 'F09', group: 'F. Severe and unusual', title: 'Credits do not add up: course "complete" but 12.5 credits short',
    story: 'All named units passed, but one elective is missing and no other unit replaces it, leaving 287.5 credits.',
    planner: ['Data Science', 2026, 3],
    build: (t, d) => { completeEverything(t, d); t.remove(namedElectives(t.planner).slice(-1)[0].code); },
  });
  S.push({
    id: 'F10', group: 'F. Severe and unusual', title: 'Failed the same unit in three different semesters',
    story: 'COS10009 failed in semesters 1, 2 and 3 with nothing after it. Student is stuck at the start of the course.',
    planner: ['Software Development', 2025, 9],
    build: (t) => {
      ['COS10026', 'COS10025', 'COS10003'].forEach((c) => t.add(c, { offset: 0 }));
      t.add('COS10009', { offset: 0, grade: 'N', earned: 0 });
      t.add('COS10009', { offset: 1, grade: 'N', earned: 0 });
      t.add('COS10009', { offset: 2, grade: 'SN', earned: 0 });
    },
  });

  return S;
}
