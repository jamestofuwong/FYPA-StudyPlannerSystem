// Which majors does a student's transcript actually point to?
//
// Every major shares the core units and many electives, so a first-year student of any major has the same
// transcript as a first-year student of any other. A unit is evidence for a major only when it sits on that
// major's planner and on no other major's planner in the candidate set. This is what separates "this student
// is clearly in Cybersecurity" from "this student has not taken anything that tells the majors apart yet".

import type { PlannerTemplate } from "../../shared/types/matching";

/**
 * The units a planner names outright: core, major core and its named electives. The prescribed-elective pools are
 * left out on purpose. They list units a student MAY choose, so a unit being a candidate in another major's pool
 * says nothing about which major a student who took it belongs to (a Software Development student's compulsory
 * units routinely appear as elective candidates for other majors).
 */
export function unitsOnPlanner(planner: PlannerTemplate): Set<string> {
  return new Set<string>([...planner.requiredCore, ...planner.requiredMajorCore, ...planner.freeElectivePool]);
}

/**
 * For each major name, how many of the student's completed units are exclusive to that major among the
 * candidate planners. A majors with several planner versions counts as one major.
 */
export function majorEvidence(planners: PlannerTemplate[], completedUnits: ReadonlySet<string>): Map<string, number> {
  const majorsByUnit = new Map<string, Set<string>>();
  for (const planner of planners) {
    for (const code of unitsOnPlanner(planner)) {
      if (!majorsByUnit.has(code)) majorsByUnit.set(code, new Set());
      majorsByUnit.get(code)!.add(planner.majorName);
    }
  }
  const evidence = new Map<string, number>();
  for (const planner of planners) if (!evidence.has(planner.majorName)) evidence.set(planner.majorName, 0);
  for (const code of completedUnits) {
    const majors = majorsByUnit.get(code);
    if (majors && majors.size === 1) {
      const [only] = majors;
      evidence.set(only, (evidence.get(only) ?? 0) + 1);
    }
  }
  return evidence;
}
