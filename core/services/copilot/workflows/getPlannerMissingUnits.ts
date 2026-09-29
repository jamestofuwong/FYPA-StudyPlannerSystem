import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  plannerId: string;
  enrollMode?: string;
}

interface MissingUnit {
  code: string;
  name: string;
  yearLevel: number | null;
  semester: number | null;
  category: string;
  offeredIn: number[];
}

interface Output {
  studentId: string;
  studentName: string | null;
  plannerName: string;
  missingCount: number;
  missingUnits: MissingUnit[];
}

const PASSING_GRADES = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S']);
const IN_PROGRESS_STATUSES = new Set(['enrolled', 'in progress', 'current', 'registered']);

export const getPlannerMissingUnitsWorkflow: Workflow<Input, Output> = {
  id: 'get_planner_missing_units',
  description: 'Returns only the list of units a student still needs to complete from a specific planner. Use this when the user asks what units a student is missing, what they still need to take, or how many units are left.',
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
      description: 'The UUID of the planner template. Use list_planners or find_planner_by_major to get the ID.',
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
      return { ok: false, error: `Student "${params.studentId}" not found. Make sure the portal is logged in and the student list is loaded.` };
    }

    const plannerRepository = await import('../../../db/repositories/plannerRepository');
    const planner = await plannerRepository.getPlannerById(params.plannerId);
    if (!planner) {
      return { ok: false, error: `Planner "${params.plannerId}" not found. Use list_planners to see available planners.` };
    }

    try {
      const enrollments = await fetchEnrollments(student.db_id);
      if (!enrollments.length) {
        return { ok: false, error: `No enrollments found for student ${params.studentId}.` };
      }
      const enrollment = selectEnrollment(enrollments, mode);
      if (!enrollment) {
        return { ok: false, error: `No enrollment matched mode "${mode}" for student ${params.studentId}.` };
      }

      const scraped = await fetchDegreeAudit(student.db_id, enrollment.EnrollId, params.studentId);

      // Build set of codes the student has passed or is currently taking
      const doneOrInProgress = new Set<string>();
      for (const item of scraped.courseList) {
        const code = (item.courseId ?? '').trim().toUpperCase();
        if (!code) continue;
        const grade = (item.grade ?? '').trim().toUpperCase();
        const status = (item.status ?? '').trim().toLowerCase();
        if (PASSING_GRADES.has(grade) || IN_PROGRESS_STATUSES.has(status)) {
          doneOrInProgress.add(code);
        }
      }

      // Find units in the planner not yet done
      const missingUnits: MissingUnit[] = planner.units
        .filter((tu) => {
          const code = (tu.unit?.unit_code ?? '').trim().toUpperCase();
          return code && !doneOrInProgress.has(code);
        })
        .map((tu) => ({
          code: tu.unit!.unit_code,
          name: tu.unit!.unit_name,
          yearLevel: tu.year_level ?? null,
          semester: tu.semester ?? null,
          category: tu.category ?? 'core',
          offeredIn: (tu.unit?.offerings ?? []).map((o) => o.offered_in).sort((a, b) => a - b),
        }));

      // Sort by year then semester
      missingUnits.sort(
        (a, b) => (a.yearLevel ?? 99) - (b.yearLevel ?? 99) || (a.semester ?? 99) - (b.semester ?? 99),
      );

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          plannerName: `${planner.major?.name ?? 'Unknown'} (${planner.course_type}, ${planner.intake_year})`,
          missingCount: missingUnits.length,
          missingUnits,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch missing units.' };
    }
  },
};
