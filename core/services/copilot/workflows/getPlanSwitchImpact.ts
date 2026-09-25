import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  newPlannerId: string;
  enrollMode?: string;
}

interface UnitSummary {
  code: string;
  name: string;
  category: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  newPlannerName: string;
  creditsCompleted: number;
  creditableUnits: UnitSummary[];
  creditableCount: number;
  stillNeededUnits: UnitSummary[];
  stillNeededCount: number;
  excessUnits: string[];
  excessCount: number;
  completionPercent: number;
}

const PASSING_GRADES = new Set([
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S',
]);

export const getPlanSwitchImpactWorkflow: Workflow<Input, Output> = {
  id: 'get_plan_switch_impact',
  description: 'Shows the impact of a student switching to a different study planner: which of their completed units would count towards the new plan, which units they would still need to take, and which completed units would become excess. Use this when the user asks what happens if a student changes major or switches program.',
  params: [
    {
      name: 'studentId',
      type: 'string',
      description: 'The student ID number (e.g. 102780123)',
      required: true,
    },
    {
      name: 'newPlannerId',
      type: 'string',
      description: 'The UUID of the new study planner to switch to. Use list_planners or find_planner_by_major to get IDs.',
      required: true,
    },
    {
      name: 'enrollMode',
      type: 'string',
      description: 'Which enrollment to use: latest, earliest, or mpu. Defaults to latest.',
      required: false,
    },
  ],
  async execute(params: Input, _ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    const mode = params.enrollMode ?? 'latest';

    const matches = searchStudents(params.studentId);
    const student = matches.find((s) => s.student_id === params.studentId) ?? matches[0] ?? null;
    if (!student) {
      return { ok: false, error: `Student "${params.studentId}" not found. Make sure the portal is logged in.` };
    }

    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const newPlanner = await plannerRepository.getPlannerById(params.newPlannerId);
      if (!newPlanner) {
        return { ok: false, error: `Planner "${params.newPlannerId}" not found. Use list_planners to see available planners.` };
      }

      const enrollments = await fetchEnrollments(student.db_id);
      if (!enrollments.length) {
        return { ok: false, error: `No enrollments found for student ${params.studentId}.` };
      }
      const enrollment = selectEnrollment(enrollments, mode);
      if (!enrollment) {
        return { ok: false, error: `No enrollment matched mode "${mode}" for student ${params.studentId}.` };
      }

      const scraped = await fetchDegreeAudit(student.db_id, enrollment.EnrollId, params.studentId);
      const passedCodes = new Set(
        scraped.courseList
          .filter((c) => PASSING_GRADES.has(c.grade ?? ''))
          .map((c) => c.courseId.toUpperCase()),
      );

      const newPlannerName = `${newPlanner.major?.name ?? 'Unknown'} — ${newPlanner.course?.name ?? 'Unknown'} (${newPlanner.course_type}, ${newPlanner.intake_year})`;

      // Build a map of new planner unit codes → category
      const newPlannerMap = new Map<string, { name: string; category: string }>();
      for (const tu of newPlanner.units) {
        if (!tu.unit) continue;
        newPlannerMap.set(tu.unit.unit_code.toUpperCase(), {
          name: tu.unit.unit_name,
          category: tu.category ?? 'core',
        });
      }

      const creditableUnits: UnitSummary[] = [];
      const stillNeededUnits: UnitSummary[] = [];
      const excessUnits: string[] = [];

      // Creditable: passed AND in the new planner
      for (const [code, info] of newPlannerMap) {
        if (passedCodes.has(code)) {
          creditableUnits.push({ code, name: info.name, category: info.category });
        } else {
          stillNeededUnits.push({ code, name: info.name, category: info.category });
        }
      }

      // Excess: passed but NOT in the new planner
      for (const code of passedCodes) {
        if (!newPlannerMap.has(code)) {
          excessUnits.push(code);
        }
      }

      const totalNew = newPlannerMap.size;
      const completionPercent = totalNew > 0
        ? Math.round((creditableUnits.length / totalNew) * 100)
        : 0;

      stillNeededUnits.sort((a, b) => a.code.localeCompare(b.code));

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          newPlannerName,
          creditsCompleted: scraped.creditsCompleted,
          creditableUnits,
          creditableCount: creditableUnits.length,
          stillNeededUnits,
          stillNeededCount: stillNeededUnits.length,
          excessUnits,
          excessCount: excessUnits.length,
          completionPercent,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to assess plan switch impact.' };
    }
  },
};
