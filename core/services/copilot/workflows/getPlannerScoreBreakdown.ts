import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { runMatchingPipeline } from '../../matching/matchingService';
import { selectEnrollment } from './enrollmentSelector';
import type { CourseType } from '../../../shared/types/matching';
import { buildPlannerTemplatesForMatching } from '../../matching/plannerTemplateBuilder';
import { getCompletedUnitCodes } from '../../../shared/constants/grades';

interface Input {
  studentId: string;
  plannerId: string;
  enrollMode?: string;
}

interface ScoreBreakdown {
  matchPercent: number;
  majorCoreScore: number;
  core: { matched: number; required: number };
  majorCore: { matched: number; required: number };
  prescribed: { matched: number; possible: number };
  freeElective: { matched: number; possible: number };
  missingCore: string[];
  missingMajorCore: string[];
  missingPrescribed: string[];
}

interface Output {
  studentId: string;
  studentName: string | null;
  plannerName: string;
  found: boolean;
  score: ScoreBreakdown | null;
}

export const getPlannerScoreBreakdownWorkflow: Workflow<Input, Output> = {
  id: 'get_planner_score_breakdown',
  description: 'Shows how well a student matches ONE planner: core match percentage, major core score and missing units per category. Use this when the user asks how well or how closely a student matches a major, why they got a major score, or for the match percentage.',
  keywords: ['match', 'match percentage', 'score', 'how well', 'why this major', 'fit', 'similarity'],
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
      description: 'The UUID of the planner template to score against. Use list_planners or find_planner_by_major to get the ID.',
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
    const { buildUnitMasterTable } = await import('../../matching/unitMasterTableBuilder');
    const [dbPlanners, targetPlanner] = await Promise.all([
      plannerRepository.getAllPlannersWithUnits(),
      plannerRepository.getPlannerById(params.plannerId),
    ]);

    if (!targetPlanner) {
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

      // The same builders as the dashboard and class estimation.
      const formattedPlanners = buildPlannerTemplatesForMatching(dbPlanners);
      const unitMasterTable = await buildUnitMasterTable(dbPlanners);

      // Passed units only, as everywhere else: a failed or withdrawn row does not satisfy a requirement.
      const completedUnitCodes = getCompletedUnitCodes(scraped.courseList);
      const intakeSemester = ((targetPlanner.intake_month ?? 1) >= 7 ? 2 : 1) as 1 | 2;

      const result = runMatchingPipeline({
        student: {
          studentID: params.studentId,
          courseType: (targetPlanner.course_type as CourseType) || 'degree',
          intakeYear: targetPlanner.intake_year,
          intakeSemester,
          currentSemester: 1,
          completedUnitCodes,
          hasWIL: scraped.courseList.some((u) => u.courseId.toUpperCase().includes('WIL')),
        },
        planners: formattedPlanners,
        unitMasterTable,
        config: { preferIntakeYear: false },
      });

      // Find the specific planner's score record in the ranked results
      const scoreRecord = result.payload.rankedPlanners?.find(
        (r: any) => r.plannerID === params.plannerId,
      ) as any | undefined;

      const plannerName = `${targetPlanner.major?.name ?? 'Unknown'} (${targetPlanner.course_type}, ${targetPlanner.intake_year})`;

      if (!scoreRecord) {
        return {
          ok: true,
          data: {
            studentId: params.studentId,
            studentName: scraped.studentName ?? student.name,
            plannerName,
            found: false,
            score: null,
          },
        };
      }

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          plannerName,
          found: true,
          score: {
            matchPercent: Math.round(scoreRecord.matchPct ?? 0),
            majorCoreScore: Math.round((scoreRecord.majorCoreScore ?? 0) * 100),
            core: {
              matched: scoreRecord.coreMatched ?? 0,
              required: scoreRecord.coreRequired ?? 0,
            },
            majorCore: {
              matched: scoreRecord.majorCoreMatched ?? 0,
              required: scoreRecord.majorCoreRequired ?? 0,
            },
            prescribed: {
              matched: scoreRecord.prescribedMatched ?? 0,
              possible: scoreRecord.prescribedPossible ?? 0,
            },
            freeElective: {
              matched: scoreRecord.freeMatched ?? 0,
              possible: scoreRecord.freePossible ?? 0,
            },
            missingCore: scoreRecord.missingCore ?? [],
            missingMajorCore: scoreRecord.missingMajorCore ?? [],
            missingPrescribed: scoreRecord.missingPrescribed ?? [],
          },
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to run matching pipeline.' };
    }
  },
};
