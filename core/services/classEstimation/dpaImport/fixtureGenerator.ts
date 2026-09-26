// ============================================================
// Generates randomised student transcripts in the DPA export format, for testing class estimation without
// portal access.
//
// Every student is randomised on four axes:
//   - major, drawn from the planners loaded in the system
//   - intake year and semester
//   - how far through their planner they have got
//   - which units they have actually taken, since students do not move through a planner in lockstep:
//     some defer a unit, and grades, retakes, conceded passes and already-booked units all vary
//
// The last one matters most. Without it, every student in a major at the same stage would carry an
// identical unit set, and anything that looks across a cohort (elective popularity, historical pick rates)
// would return the same answer for everyone. assertDistinctHistories() guards against a future change
// quietly reintroducing that.
//
// Output is DPA rows, so fixtures travel through the same dpaFileParser as a real upload rather than
// taking a private shortcut into the pipeline.
//
// Deterministic: the same seed always produces the same cohort, so a failing test can be re-run.
// ============================================================

import type { ScrapedCourseListItem } from '../../../shared/types/student';

export interface FixtureUnit {
  code: string;
  title: string;
  /** Defaults to 12.5. Set it for the exceptions, e.g. a 0-credit module or a 25-credit placement. */
  credits?: number;
  /** Where the planner puts this unit, used to decide the order a student works through it. */
  yearLevel: number;
  semester: 1 | 2;
}

export interface FixturePlanner {
  majorName: string;
  units: FixtureUnit[];
}

export interface GenerateOptions {
  planners: FixturePlanner[];
  /** How many students to produce. */
  count: number;
  /** Same seed, same cohort. */
  seed?: number;
  /** Intakes to spread students across, as [year, semester] pairs. */
  intakes?: Array<[number, 1 | 2]>;
  /** Roughly what share of completed units get a failing grade, 0 to 1. */
  failRate?: number;
  /** Roughly what share of completed units get a Conceded Pass, 0 to 1. */
  concededPassRate?: number;
  /** Roughly what share of students have next semester's units already booked. */
  scheduledRate?: number;
  /**
   * Roughly what share of units a student has reached but not actually taken, 0 to 1. This is what stops
   * students in the same major at the same stage carrying identical unit sets. Units in the student's
   * first semester are never deferred, so the earliest term on the transcript still reflects their intake.
   */
  deferRate?: number;
}

export interface GeneratedStudent {
  studentId: string;
  majorName: string;
  intake: { year: number; semester: 1 | 2 };
  /** Semesters of study completed or in progress, so a cohort spans year 1 through final year. */
  semestersElapsed: number;
  /** DPA rows in export column order: Course, Course Title, Credits, Earned, Status, Grade, Term. */
  rows: Array<[string, string, number, number, string, string, string]>;
}

export const DPA_HEADER = ['Course', 'Course Title', 'Credits', 'Earned', 'Status', 'Grade', 'Term'] as const;
export const STUDENT_ID_HEADER = 'Student ID';

/** Matches the student number range the portal uses, and the Min/Max filter on the Class Estimation page. */
export const FIRST_STUDENT_ID = 102780000;

const DEFAULT_CREDITS = 12.5;
const PASS_GRADES = ['HD', 'D', 'C', 'P'];

// S1 teaching starts in March and S2 in September. Real exports also show FEB for some S1 intakes, which
// parseTermCode handles either way; MAR is used here as the common case.
const MONTH_FOR_SEMESTER: Record<1 | 2, string> = { 1: 'MAR', 2: 'SEP' };

/** Deterministic PRNG (mulberry32), so a seed reproduces a cohort exactly without pulling in a dependency. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The term code for the nth semester of study after an intake, e.g. (2024, 1, 0) gives "2024_MAR_S1". */
export function termCodeFor(intakeYear: number, intakeSemester: 1 | 2, offset: number): string {
  // Semesters alternate 1, 2, 1, 2 ..., rolling the year over after semester 2.
  const startIndex = intakeSemester === 1 ? 0 : 1;
  const absolute = startIndex + offset;
  const year = intakeYear + Math.floor(absolute / 2);
  const semester: 1 | 2 = absolute % 2 === 0 ? 1 : 2;
  return `${year}_${MONTH_FOR_SEMESTER[semester]}_S${semester}`;
}

function unitsInPlannerOrder(planner: FixturePlanner): FixtureUnit[] {
  return [...planner.units].sort((a, b) => a.yearLevel - b.yearLevel || a.semester - b.semester);
}

/** Fisher-Yates, driven by the seeded PRNG so a shuffle is reproducible. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Assignments that are random per student but still cover every option. A plain random draw can miss a
 * major entirely in a small cohort, which would leave a whole planner untested; straight round-robin makes
 * a student's major predictable from their position. Building a round-robin list and shuffling it gives
 * both: even coverage, unpredictable order.
 */
function shuffledAssignments(count: number, optionCount: number, random: () => number): number[] {
  return shuffle(Array.from({ length: count }, (_, i) => i % optionCount), random);
}

/**
 * Builds a cohort. Each student gets an intake, a major and a number of semesters elapsed, then works
 * through their planner in order: earlier semesters completed, the current semester in progress, and
 * sometimes the next semester already booked.
 */
export function generateStudents(options: GenerateOptions): GeneratedStudent[] {
  const {
    planners,
    count,
    seed = 1,
    intakes = [[2024, 1], [2024, 2], [2025, 1], [2025, 2], [2026, 1]],
    failRate = 0.08,
    concededPassRate = 0.04,
    scheduledRate = 0.3,
    deferRate = 0.12,
  } = options;

  if (planners.length === 0) throw new Error('generateStudents needs at least one planner');
  if (count <= 0) throw new Error('generateStudents needs a count above zero');

  const random = rng(seed);
  const students: GeneratedStudent[] = [];

  const plannerPicks = shuffledAssignments(count, planners.length, random);
  const intakePicks = shuffledAssignments(count, intakes.length, random);

  for (let i = 0; i < count; i++) {
    const planner = planners[plannerPicks[i]];
    const [intakeYear, intakeSemester] = intakes[intakePicks[i]];
    const ordered = unitsInPlannerOrder(planner);

    // Spread progress across the cohort so year 1 and final-year students both appear. At least one
    // semester elapsed, never more than the planner covers.
    const maxSemesters = Math.max(...ordered.map((u) => (u.yearLevel - 1) * 2 + u.semester));
    const semestersElapsed = 1 + Math.floor(random() * maxSemesters);

    const rows: GeneratedStudent['rows'] = [];
    const bookNextSemester = random() < scheduledRate;

    for (const unit of ordered) {
      const unitSemesterIndex = (unit.yearLevel - 1) * 2 + unit.semester; // 1-based
      const credits = unit.credits ?? DEFAULT_CREDITS;
      const termOffset = unitSemesterIndex - 1;
      const term = termCodeFor(intakeYear, intakeSemester, termOffset);

      // Students do not move through a planner in lockstep. Deferring some of what they have reached is
      // what makes two students in the same major at the same stage carry different unit sets, which every
      // cohort-level signal depends on. The first semester is never deferred, so the earliest term on the
      // transcript still reflects the intake it was generated with.
      if (unitSemesterIndex <= semestersElapsed && unitSemesterIndex > 1 && random() < deferRate) continue;

      if (unitSemesterIndex < semestersElapsed) {
        const roll = random();
        if (roll < failRate) {
          // A failed unit earns no credit and stays owed, so it should reappear as a retake candidate.
          rows.push([unit.code, unit.title, credits, 0, 'Complete', 'N', term]);
        } else if (roll < failRate + concededPassRate) {
          // A Conceded Pass earns credit but cannot satisfy a requisite, which eligibility must respect.
          rows.push([unit.code, unit.title, credits, credits, 'Complete', 'CP', term]);
        } else {
          const grade = PASS_GRADES[Math.floor(random() * PASS_GRADES.length)];
          rows.push([unit.code, unit.title, credits, credits, 'Complete', grade, term]);
        }
      } else if (unitSemesterIndex === semestersElapsed) {
        rows.push([unit.code, unit.title, credits, 0, 'Current', '', term]);
      } else if (unitSemesterIndex === semestersElapsed + 1 && bookNextSemester) {
        rows.push([unit.code, unit.title, credits, 0, 'Scheduled', '', term]);
      }
      // Anything further out has not been touched yet and does not appear on a transcript.
    }

    students.push({
      studentId: String(FIRST_STUDENT_ID + i),
      majorName: planner.majorName,
      intake: { year: intakeYear, semester: intakeSemester },
      semestersElapsed,
      rows,
    });
  }

  return students;
}

/** What a student has taken and how it went, used to tell genuinely different students apart. */
export function historySignature(student: GeneratedStudent): string {
  const parts = student.rows
    .map(([code, , , , status, grade]) => `${code}:${status}:${grade}`)
    .sort();
  return `${student.majorName}|${student.intake.year}-${student.intake.semester}|${parts.join(',')}`;
}

/**
 * Refuses a cohort whose students are interchangeable. Without this, a change that weakened the
 * randomisation could quietly hand back students with identical histories, and every cohort-level feature
 * built on top would look like it was working while returning the same answer for everyone.
 */
export function assertDistinctHistories(students: GeneratedStudent[], minimumDistinct = 2): void {
  const distinct = new Set(students.map(historySignature));
  if (distinct.size < Math.min(minimumDistinct, students.length)) {
    throw new Error(
      `Generated cohort has ${distinct.size} distinct histories across ${students.length} students. ` +
      'Cohort-level signals need genuinely different transcripts, not the same one under different IDs.',
    );
  }
}

/** One sheet holding the whole cohort, with a student ID column. */
export function toMultiStudentRows(students: GeneratedStudent[]): unknown[][] {
  return [
    [STUDENT_ID_HEADER, ...DPA_HEADER],
    ...students.flatMap((student) => student.rows.map((row) => [student.studentId, ...row])),
  ];
}

/** One sheet for a single student, matching what the portal exports. */
export function toSingleStudentRows(student: GeneratedStudent): unknown[][] {
  return [[...DPA_HEADER], ...student.rows.map((row) => [...row])];
}

/**
 * The same rows as transcript items, for a caller that wants them directly rather than through a
 * spreadsheet. Used by the mock portal source, so the column order lives in one place.
 */
export function toCourseList(student: GeneratedStudent): ScrapedCourseListItem[] {
  return student.rows.map(([courseId, courseTitle, credits, creditsEarned, status, grade, term]) => ({
    courseId,
    courseTitle,
    level: '',
    credits,
    creditsEarned,
    status,
    grade,
    term,
  }));
}

// ------------------------------------------------------------------
// Turning real planners into fixture planners
// ------------------------------------------------------------------

/** The subset of a planner row this needs, so the mapping stays testable without a database. */
export interface DbPlannerLike {
  major?: { name: string } | null;
  course?: { name: string } | null;
  intake_year?: number;
  units: Array<{
    category: string;
    year_level: number;
    semester: number;
    unit: { unit_code: string; unit_name: string } | null;
  }>;
}

export interface PlannerToFixtureOptions {
  /**
   * Credits for codes that are not the standard rate. core/db has no per-unit credit field, so the known
   * exceptions have to be supplied: a 0-credit integrity module, a 25-credit WIL placement.
   */
  creditsByCode?: Record<string, number>;
}

/**
 * Converts a planner from the database into the shape the generator works from, so mock students follow
 * the majors actually loaded in the system rather than one hand-written stand-in.
 *
 * Units in a summer or winter slot are left out. The generator walks a student semester by semester, and a
 * short-term unit has no place in that sequence. That mostly means WIL placements, which are excluded from
 * estimates by decision anyway.
 */
export function plannerToFixture(
  planner: DbPlannerLike,
  options: PlannerToFixtureOptions = {},
): FixturePlanner | null {
  const creditsByCode = options.creditsByCode ?? {};
  const seen = new Set<string>();
  const units: FixtureUnit[] = [];

  for (const templateUnit of planner.units ?? []) {
    if (!templateUnit.unit) continue;                                   // an unfilled elective slot
    if (templateUnit.semester !== 1 && templateUnit.semester !== 2) continue;  // summer or winter slot
    const code = templateUnit.unit.unit_code.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);

    units.push({
      code,
      title: templateUnit.unit.unit_name,
      credits: creditsByCode[code],
      yearLevel: templateUnit.year_level,
      semester: templateUnit.semester,
    });
  }

  if (units.length === 0) return null;

  const majorName = planner.major?.name ?? planner.course?.name ?? 'Unknown major';
  const label = planner.intake_year ? `${majorName} (${planner.intake_year})` : majorName;
  return { majorName: label, units };
}

/** Maps a set of planners, dropping any with no usable units. */
export function plannersToFixtures(
  planners: DbPlannerLike[],
  options: PlannerToFixtureOptions = {},
): FixturePlanner[] {
  return planners
    .map((planner) => plannerToFixture(planner, options))
    .filter((planner): planner is FixturePlanner => planner !== null);
}
