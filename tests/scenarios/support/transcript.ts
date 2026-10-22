/**
 * Builds a test student's transcript in the shape the portal scraper and the Excel import both produce
 * (ScrapedCourseListItem: Course, Course Title, Credits, Earned, Status, Grade, Term), starting from one of
 * the real planners and then bending it: failing units, swapping electives, moving units around, exempting.
 *
 * Conventions copied from real transcripts and the existing fixture generator:
 *   - Status is 'Complete', 'Current' or 'Future'. A passed unit has a grade and earns its credit.
 *   - A failed unit (N or SN) earns 0. A supplementary pass shows as a second row (SP).
 *   - An exemption / credit transfer is 'Complete' with NO grade and NO term.
 *   - Regular terms look like 2025_SEP_S2 (the S1/S2 is the calendar semester); short terms like 2026_JUN_WT.
 *   - MPU units carry 0 credit. WIL (ICT20016) carries 25.
 */
import type { ScrapedCourseListItem } from '../../../core/shared/types/student';
import type { PlannerView, PlannerUnit, ScenarioData } from './db';

export type Row = ScrapedCourseListItem;

/** International-only MPUs, plus the optional Bahasa Kebangsaan unit. A Malaysian student does not take these. */
const NOT_FOR_MALAYSIAN_STUDENT = new Set(['MPU3142', 'MPU3143', 'MPU3212']);

const GRADES = ['HD', 'D', 'C', 'D', 'P', 'HD', 'C', 'D'];

function pickGrade(code: string): string {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADES[h % GRADES.length];
}

export function creditsOf(code: string): number {
  if (code.startsWith('MPU')) return 0;
  if (code === 'ICT20016' || code === 'ICT20026') return 25;
  return 12.5;
}

export function monthLabel(intakeMonth: number, semester: 1 | 2): string {
  if (semester === 2) return 'SEP';
  return intakeMonth === 2 ? 'FEB' : 'MAR';
}

export interface AddOptions {
  /** Regular-semester offset from intake (0 = first semester). Ignored when `term` is given. */
  offset?: number;
  term?: string;
  grade?: string;
  status?: 'Complete' | 'Current' | 'Future';
  credits?: number;
  earned?: number;
}

export interface FollowOptions {
  /** Regular semesters finished. 2 means Year 1 is done. */
  completed: number;
  /** Also put the next semester's units in as in progress ("Current"). */
  inProgress?: boolean;
  /** Also pre-enrol the semester after the current one ("Future"). */
  preEnrol?: boolean;
  /** Units to leave out entirely. */
  skip?: string[];
  /** Include the international-only MPUs and Bahasa Kebangsaan. Off by default. */
  allMpu?: boolean;
}

export class Transcript {
  rows: Row[] = [];
  private readonly note: string[] = [];

  constructor(readonly planner: PlannerView, readonly data: ScenarioData) {}

  /** The calendar term code of the nth regular semester after intake. */
  termAt(offset: number): string {
    const p = this.planner;
    const startIdx = p.intakeSemester === 1 ? 0 : 1;
    const abs = startIdx + offset;
    const year = p.intakeYear + Math.floor(abs / 2);
    const sem: 1 | 2 = abs % 2 === 0 ? 1 : 2;
    // The first semester of a Feb intake is FEB, later S1 semesters are MAR, as in real exports.
    const label = sem === 1 ? (offset === 0 ? monthLabel(p.intakeMonth, 1) : 'MAR') : 'SEP';
    return `${year}_${label}_S${sem}`;
  }

  shortTermAt(afterOffset: number, kind: 'summer' | 'winter'): string {
    const p = this.planner;
    const startIdx = p.intakeSemester === 1 ? 0 : 1;
    const year = p.intakeYear + Math.floor((startIdx + afterOffset) / 2);
    // Real portal codes: a summer term is _ST, a winter term _WT
    return kind === 'summer' ? `${year + 1}_JAN_ST` : `${year}_JUN_WT`;
  }

  private titleOf(code: string): string {
    return this.data.units.get(code)?.name ?? code;
  }

  add(code: string, o: AddOptions = {}): Row {
    const c = code.toUpperCase();
    const status = o.status ?? 'Complete';
    const credits = o.credits ?? creditsOf(c);
    const grade = o.grade ?? (status === 'Complete' ? pickGrade(c) : '');
    const failed = grade === 'N' || grade === 'SN';
    const earned = o.earned ?? (status === 'Complete' && !failed ? credits : 0);
    const row: Row = {
      courseId: c,
      courseTitle: this.titleOf(c),
      level: '',
      credits,
      creditsEarned: earned,
      status,
      grade,
      term: o.term ?? this.termAt(o.offset ?? 0),
    };
    this.rows.push(row);
    return row;
  }

  /** The planner units that sit in a regular semester, with the offset they belong to. */
  private regularUnits(): Array<PlannerUnit & { offset: number }> {
    return this.planner.units
      .filter((u) => u.semester === 1 || u.semester === 2)
      .map((u) => ({ ...u, offset: (u.year - 1) * 2 + (u.semester - 1) }));
  }

  /** Fills the transcript as a student who follows the planner exactly up to a point. */
  follow(opts: FollowOptions): this {
    const skip = new Set((opts.skip ?? []).map((c) => c.toUpperCase()));
    const taken = (u: PlannerUnit) =>
      !skip.has(u.code) && (opts.allMpu || !NOT_FOR_MALAYSIAN_STUDENT.has(u.code));

    for (const u of this.regularUnits()) {
      if (!taken(u)) continue;
      if (u.offset < opts.completed) this.add(u.code, { offset: u.offset });
      else if (opts.inProgress && u.offset === opts.completed) this.add(u.code, { offset: u.offset, status: 'Current' });
      else if (opts.preEnrol && u.offset === opts.completed + 1) this.add(u.code, { offset: u.offset, status: 'Future' });
    }
    // Summer / winter units are taken once the year they belong to is finished.
    for (const u of this.planner.units.filter((x) => x.semester === 3 || x.semester === 4)) {
      if (!taken(u)) continue;
      if ((u.year - 1) * 2 + 2 <= opts.completed) {
        this.add(u.code, {
          term: this.shortTermAt((u.year - 1) * 2 + 1, u.semester === 3 ? 'summer' : 'winter'),
        });
      }
    }
    return this;
  }

  /** Follows the whole planner start to finish. */
  followAll(opts: Partial<FollowOptions> = {}): this {
    return this.follow({ completed: this.plannerLength(), ...opts });
  }

  plannerLength(): number {
    return Math.max(...this.regularUnits().map((u) => u.offset)) + 1;
  }

  rowsFor(code: string): Row[] {
    const c = code.toUpperCase();
    return this.rows.filter((r) => r.courseId === c);
  }

  has(code: string): boolean {
    return this.rowsFor(code).length > 0;
  }

  remove(...codes: string[]): this {
    const set = new Set(codes.map((c) => c.toUpperCase()));
    this.rows = this.rows.filter((r) => !set.has(r.courseId));
    return this;
  }

  /** Turns the existing attempt at a unit into a fail; optionally adds a later retake. */
  fail(code: string, retake?: { offset: number; grade?: string }): this {
    const rows = this.rowsFor(code);
    if (rows.length === 0) throw new Error(`fail(): ${code} is not on the transcript`);
    const first = rows[0];
    first.grade = 'N';
    first.creditsEarned = 0;
    first.status = 'Complete';
    if (retake) this.add(code, { offset: retake.offset, grade: retake.grade ?? 'P' });
    return this;
  }

  /** Marks the existing attempt a Conceded Pass. */
  conceded(code: string): this {
    const rows = this.rowsFor(code);
    if (rows.length === 0) throw new Error(`conceded(): ${code} is not on the transcript`);
    rows[0].grade = 'CP';
    rows[0].creditsEarned = rows[0].credits;
    return this;
  }

  /** Exemption / credit transfer: complete, credit earned, no grade and no term. */
  exempt(...codes: string[]): this {
    for (const code of codes) {
      this.remove(code);
      const c = code.toUpperCase();
      const credits = creditsOf(c);
      this.rows.push({
        courseId: c,
        courseTitle: this.titleOf(c),
        level: '',
        credits,
        creditsEarned: credits,
        status: 'Complete',
        grade: '',
        term: '',
      });
    }
    return this;
  }

  /** Replaces one unit on the transcript with another, in the same term and with the same result. */
  swap(oldCode: string, newCode: string): this {
    const rows = this.rowsFor(oldCode);
    if (rows.length === 0) throw new Error(`swap(): ${oldCode} is not on the transcript`);
    for (const r of rows) {
      r.courseId = newCode.toUpperCase();
      r.courseTitle = this.titleOf(newCode.toUpperCase());
    }
    return this;
  }

  /** Moves a unit's attempt to another regular semester. */
  move(code: string, toOffset: number): this {
    for (const r of this.rowsFor(code)) r.term = this.termAt(toOffset);
    return this;
  }

  describe(): string[] {
    return this.note;
  }

  /** Distinct credits earned: each unit counts once, using its best attempt. */
  creditsCompleted(): number {
    const best = new Map<string, number>();
    for (const r of this.rows) best.set(r.courseId, Math.max(best.get(r.courseId) ?? 0, r.creditsEarned));
    let sum = 0;
    for (const v of best.values()) sum += v;
    return sum;
  }
}
