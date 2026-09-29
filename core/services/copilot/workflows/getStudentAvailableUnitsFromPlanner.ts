import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  plannerId: string;
  enrollMode?: string;
}

interface RemainingUnit {
  code: string;
  name: string;
  category: string;
  yearLevel: number | null;
  semester: number | null;
}

interface Output {
  studentId: string;
  plannerId: string;
  plannerName: string;
  completedCount: number;
  remainingCount: number;
  remaining: RemainingUnit[];
}

const PASSING_GRADES = new Set([
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S',
]);

export const getStudentAvailableUnitsFromPlannerWorkflow: Workflow<Input, Output> = {
  id: 'get_student_available_units_from_planner',
  description: 'Shows which units in a study planner a student has not yet completed. Use this when the user wants to see what a student still needs to finish, or how many units remain in their plan.',
  params: [
    {
      name: 'studentId',
      type: 'string',
      description: 'The student ID number (e.g. 102780123)',
      required: true,
    },
    {
      name: 'plannerId',
      type: 'string',
      description: 'The UUID of the study planner. Use list_planners or find_planner_by_major to get IDs.',
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
      const planner = await plannerRepository.getPlannerById(params.plannerId);
      if (!planner) {
        return { ok: false, error: `Planner "${params.plannerId}" not found. Use list_planners to see available planners.` };
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

      const plannerName = `${planner.major?.name ?? 'Unknown'} — ${planner.course?.name ?? 'Unknown'} (${planner.course_type}, ${planner.intake_year})`;

      const remaining: RemainingUnit[] = [];
      let completedCount = 0;

      for (const tu of planner.units) {
        if (!tu.unit) continue;
        const code = tu.unit.unit_code.toUpperCase();
        if (passedCodes.has(code)) {
          completedCount++;
        } else {
          remaining.push({
            code: tu.unit.unit_code,
            name: tu.unit.unit_name,
            category: tu.category ?? 'core',
            yearLevel: tu.year_level ?? null,
            semester: tu.semester ?? null,
          });
        }
      }

      remaining.sort(
        (a, b) => (a.yearLevel ?? 0) - (b.yearLevel ?? 0) || (a.semester ?? 0) - (b.semester ?? 0),
      );

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          plannerId: params.plannerId,
          plannerName,
          completedCount,
          remainingCount: remaining.length,
          remaining,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch remaining planner units.' };
    }
  },
};
