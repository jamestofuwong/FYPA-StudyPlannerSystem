// ============================================================
// Works out which course an imported batch of students belongs to, from the units on their transcripts.
//
// Each Head of Department imports their own course's students, so a batch is one course, but nothing in a DPA
// export names it: the "Course" column is the unit code. What does give it away is the units. A student
// holding BUS10001 is a Business student, because only Business planners list it.
//
// Every student votes for the course whose planners contain the most of their units, and the batch's course
// is the one with the most votes. Every row counts, passed, failed, in progress and booked, because a student
// who has only just enrolled has passed nothing yet, and their booked first-semester units are the only clue
// to where they belong. MPU units are left out: every Malaysian course shares them, so they say nothing.
//
// The course decided here does two jobs. Matching is limited to that course's planners, so a student is never
// compared with another faculty's majors; and the new first-year students typed in by the Head of Department
// go onto that course's Year 1, Semester 1 units.
// ============================================================

import type { EstimationRecord } from '../../shared/types/classEstimation';
import { courseOf } from './newIntakeResolver';

interface PlannerUnitsWithCourse {
  course?: { name?: string | null } | null;
  units: Array<{ unit: { unit_code: string } | null }>;
  elective_groups: Array<{ units: Array<{ unit: { unit_code: string } }> }>;
}

export interface CourseDetection {
  /** The batch's course, or null when no student's units point at any course. */
  course: string | null;
  /** Students whose units point at the detected course. */
  agreeing: number;
  /** Students whose units point at a different course, by that course, for a batch that is not one course. */
  elsewhere: Record<string, number>;
  /** Students with no unit that any planner lists, who simply follow the batch. */
  undetermined: number;
  students: number;
  /** Every course the loaded planners belong to. */
  courses: string[];
}

const isMpu = (code: string) => /^MPU/i.test(code);

/** Unit code to the courses whose planners list it, slotted or in an elective group. */
function unitCourses(planners: PlannerUnitsWithCourse[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (code: string | undefined, course: string) => {
    const key = code?.trim().toUpperCase();
    if (!key || isMpu(key)) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(course);
  };
  for (const planner of planners) {
    const course = courseOf(planner);
    for (const templateUnit of planner.units) add(templateUnit.unit?.unit_code, course);
    for (const group of planner.elective_groups) for (const member of group.units) add(member.unit.unit_code, course);
  }
  return map;
}

/** The course a single student's units point at, or null for none, or a tie between courses. */
export function studentCourse(record: EstimationRecord, byUnit: Map<string, Set<string>>): string | null {
  const votes = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of record.transcript) {
    const code = String(row.courseId ?? '').trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    for (const course of byUnit.get(code) ?? []) votes.set(course, (votes.get(course) ?? 0) + 1);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;   // equally Business and Computer Science
  return ranked[0][0];
}

export function detectBatchCourse(records: EstimationRecord[], planners: PlannerUnitsWithCourse[]): CourseDetection {
  const courses = [...new Set(planners.map(courseOf))].sort();
  const byUnit = unitCourses(planners);

  const tally = new Map<string, number>();
  let undetermined = 0;
  for (const record of records) {
    const course = studentCourse(record, byUnit);
    if (course) tally.set(course, (tally.get(course) ?? 0) + 1);
    else undetermined++;
  }

  // Most votes wins. With no votes at all there is nothing to go on, except that a single loaded course is
  // necessarily the answer.
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const course = ranked[0]?.[0] ?? (courses.length === 1 ? courses[0] : null);

  const elsewhere: Record<string, number> = {};
  for (const [name, n] of ranked) if (name !== course) elsewhere[name] = n;

  return {
    course,
    agreeing: course ? tally.get(course) ?? 0 : 0,
    elsewhere,
    undetermined,
    students: records.length,
    courses,
  };
}
