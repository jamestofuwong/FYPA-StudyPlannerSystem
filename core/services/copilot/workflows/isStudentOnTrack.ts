import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';

interface Input {
  studentId: string;
  plannerId: string;
  enrollMode?: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  plannerName: string;
  totalPlannerUnits: number;
  completedUnits: number;
  remainingUnits: number;
  completionPercent: number;
  creditsCompleted: number;
  creditsRequired: number;
  progressPercent: number;
  assessment: string;
}

const PASSING_GRADES = new Set([
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'P', 'CR', 'S',
]);

export const isStudentOnTrackWorkflow: Workflow<Input, Output> = {
  id: 'is_student_on_track',
  description: 'Determines whether a student is on track to graduate by comparing how many planner units they have completed against the total required, and cross-referencing with their official credit progress. Use this when the user asks if a student is on track, behind, or ahead in their studies.',
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
      description: 'The UUID of the study planner the student is following. Use list_planners or find_planner_by_major to get IDs.',
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
      const totalPlannerUnits = planner.units.filter((tu) => tu.unit).length;
      const completedUnits = planner.units.filter(
        (tu) => tu.unit && passedCodes.has(tu.unit.unit_code.toUpperCase()),
      ).length;
      const remainingUnits = totalPlannerUnits - completedUnits;
      const completionPercent = totalPlannerUnits > 0
        ? Math.round((completedUnits / totalPlannerUnits) * 100)
        : 0;

      const progressPercent = scraped.creditsRequired > 0
        ? Math.round((scraped.creditsCompleted / scraped.creditsRequired) * 100)
        : 0;

      // Derive an assessment based on alignment between unit completion % and credit %
      const diff = completionPercent - progressPercent;
      let assessment: string;
      if (completionPercent >= 100) {
        assessment = 'All planner units completed — ready to graduate pending official clearance.';
      } else if (diff >= 10) {
        assessment = 'Ahead of pace — student has completed more planner units than expected for their credit count.';
      } else if (diff <= -10) {
        assessment = 'Behind pace — student\'s unit completion is lower than their credit progress suggests.';
      } else {
        assessment = 'On track — unit completion aligns with credit progress.';
      }

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          plannerName,
          totalPlannerUnits,
          completedUnits,
          remainingUnits,
          completionPercent,
          creditsCompleted: scraped.creditsCompleted,
          creditsRequired: scraped.creditsRequired,
          progressPercent,
          assessment,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to assess student progress.' };
    }
  },
};
