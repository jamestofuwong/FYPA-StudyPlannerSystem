import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  plannerId: string;
  enrollMode?: string;
}

interface UnitStatus {
  code: string;
  title: string;
  semester: number;
  yearLevel: number;
  status: 'completed' | 'in_progress' | 'outstanding';
  grade?: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  plannerName: string;
  completedCount: number;
  inProgressCount: number;
  outstandingCount: number;
  units: UnitStatus[];
}

const PASSING_GRADES = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S']);
const IN_PROGRESS_STATUSES = new Set(['enrolled', 'in progress', 'current', 'registered']);

export const compareStudentToPlannerWorkflow: Workflow<Input, Output> = {
  id: 'compare_student_to_planner',
  description: 'Compares a student\'s completed units against a specific study planner to show which units are done, in progress, and still outstanding. Use this when the user asks how a student is tracking against a plan, what units they still need, or whether they are on track.',
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
      description: 'The UUID of the planner template to compare against. Use list_planners to find the ID.',
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

      // Build lookup maps from the student's course history
      const completedCodes = new Map<string, { grade: string; status: string }>();
      for (const item of scraped.courseList) {
        const code = (item.courseId ?? '').trim().toUpperCase();
        if (!code) continue;
        const grade = (item.grade ?? '').trim().toUpperCase();
        const status = (item.status ?? '').trim().toLowerCase();
        completedCodes.set(code, { grade, status });
      }

      // Build unit list from planner
      const units: UnitStatus[] = planner.units.map((tu) => {
        const code = (tu.unit?.unit_code ?? '').trim().toUpperCase();
        const record = completedCodes.get(code);

        let status: UnitStatus['status'] = 'outstanding';
        let grade: string | undefined;

        if (record) {
          const isInProgress = IN_PROGRESS_STATUSES.has(record.status);
          const isPassing = PASSING_GRADES.has(record.grade);

          if (isInProgress) {
            status = 'in_progress';
          } else if (isPassing) {
            status = 'completed';
            grade = record.grade;
          }
          // Failed grades fall through to 'outstanding' (needs to be retaken)
        }

        return {
          code: tu.unit?.unit_code ?? '',
          title: tu.unit?.unit_name ?? '',
          semester: tu.semester ?? 0,
          yearLevel: tu.year_level ?? 0,
          status,
          grade,
        };
      });

      const completedCount = units.filter((u) => u.status === 'completed').length;
      const inProgressCount = units.filter((u) => u.status === 'in_progress').length;
      const outstandingCount = units.filter((u) => u.status === 'outstanding').length;

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          plannerName: `${planner.major?.name ?? 'Unknown'} (${planner.course_type}, ${planner.intake_year})`,
          completedCount,
          inProgressCount,
          outstandingCount,
          units,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to compare student to planner.' };
    }
  },
};
