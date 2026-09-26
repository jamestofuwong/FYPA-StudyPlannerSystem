import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  plannerId: string;
  enrollMode?: string;
}

interface ElectiveOption {
  code: string;
  name: string;
  group: string;
  offeredIn: number[];
}

interface Output {
  studentId: string;
  studentName: string | null;
  plannerName: string;
  availableCount: number;
  electiveOptions: ElectiveOption[];
}

export const getStudentElectiveOptionsWorkflow: Workflow<Input, Output> = {
  id: 'get_student_elective_options',
  description: 'Shows which elective units from a planner\'s elective pool a student has not yet taken and is eligible to take. Use this when the user asks what electives a student can choose, what elective options are left, or what free electives are available.',
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

      const completedCodes = new Set(
        scraped.courseList.map((u) => u.courseId.trim().toUpperCase()),
      );

      // Collect untaken units from each elective group
      const options: ElectiveOption[] = [];

      for (const group of planner.elective_groups) {
        for (const egu of group.units) {
          const code = (egu.unit?.unit_code ?? '').trim().toUpperCase();
          if (!code || completedCodes.has(code)) continue;
          options.push({
            code: egu.unit!.unit_code,
            name: egu.unit!.unit_name,
            group: group.id,
            offeredIn: (egu.unit?.offerings ?? []).map((o) => o.offered_in).sort((a, b) => a - b),
          });
        }
      }

      // Also include free elective units from template units marked as 'elective'
      for (const tu of planner.units) {
        if (tu.category !== 'elective') continue;
        const code = (tu.unit?.unit_code ?? '').trim().toUpperCase();
        if (!code || completedCodes.has(code)) continue;
        options.push({
          code: tu.unit!.unit_code,
          name: tu.unit!.unit_name,
          group: 'Free Elective',
          offeredIn: (tu.unit?.offerings ?? []).map((o) => o.offered_in).sort((a, b) => a - b),
        });
      }

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          plannerName: `${planner.major?.name ?? 'Unknown'} (${planner.course_type}, ${planner.intake_year})`,
          availableCount: options.length,
          electiveOptions: options,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch elective options.' };
    }
  },
};
