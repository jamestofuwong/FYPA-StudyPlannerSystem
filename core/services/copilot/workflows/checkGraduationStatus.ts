import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { selectEnrollment } from './enrollmentSelector';
import { auditGraduation } from '../../graduation/graduationAudit';
import { getCompletedUnitCodes, getConcededPassUnitCodes, getFailedUnitCodes, MAX_CONCEDED_PASSES } from '../../../shared/constants/grades';

interface Input {
  studentId: string;
  enrollMode?: string;
}

interface Output {
  studentId: string;
  studentName: string | null;
  isEligible: boolean;
  completedCredits: number;
  requiredCredits: number;
  cgpa: number;
  hasFailedUnits: boolean;
  failedUnits: string[];
  /** The planner the check was run against, or null when none could be matched (credits-only check). */
  checkedAgainst: string | null;
  /** Units still to pass, electives still needed, and other blockers. Empty when eligible. */
  stillNeeded: string[];
  summary: string;
}

/** The planner this student best matches, or null if matching finds none. */
async function matchedPlanner(studentId: string, scraped: { course: string; enrollmentDate: string; courseList: Parameters<typeof getCompletedUnitCodes>[0] }) {
  const { runDashboardMatch } = await import('../../matching/dashboardMatch');
  const plannerRepository = await import('../../../db/repositories/plannerRepository');

  // enrollmentDate is DD/MM/YYYY, so the second segment is the month
  const enrolled = scraped.enrollmentDate ?? '';
  const year = enrolled.match(/\b(20\d{2})\b/);
  const month = enrolled.match(/^\d{1,2}\/(\d{1,2})\//);
  const intakeYear = year ? parseInt(year[1], 10) : new Date().getFullYear();
  const intakeSemester: 1 | 2 = (month ? parseInt(month[1], 10) : 1) >= 7 ? 2 : 1;

  const match = await runDashboardMatch({
    studentID: studentId,
    courseCode: scraped.course,
    intakeYear,
    intakeSemester,
    completedUnitCodes: getCompletedUnitCodes(scraped.courseList),
    hasWIL: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = match.data as any;
  if (data.status === 'noMajorDetected' || !data.rankedPlanners?.length) return null;
  return plannerRepository.getPlannerById(data.rankedPlanners[0].plannerID);
}

export const checkGraduationStatusWorkflow: Workflow<Input, Output> = {
  id: 'check_graduation_status',
  description: 'Checks whether a student can graduate: compares their passed units with their matched study planner (core, major, prescribed electives, work placement, electives), their credits, Conceded Passes and failed units. Says what is still needed. Fetches live data from the student portal.',
  params: [
    {
      name: 'studentId',
      type: 'string',
      description: 'The student ID number (e.g. 102780123)',
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

      const failedUnits = getFailedUnitCodes(scraped.courseList);
      const hasFailedUnits = failedUnits.length > 0;

      // Run the same audit as the dashboard's Graduation tab against the planner this student matches.
      let checkedAgainst: string | null = null;
      let stillNeeded: string[] = [];
      let isEligible: boolean;
      let summary: string;
      const planner = await matchedPlanner(params.studentId, scraped).catch(() => null);

      if (planner) {
        const audit = auditGraduation(planner, scraped.courseList, {
          creditsCompleted: scraped.creditsCompleted,
          creditsRequired: scraped.creditsRequired,
        });
        isEligible = audit.eligible;
        checkedAgainst = `${planner.major?.name ?? 'Unknown major'} (${planner.course_type}, ${planner.intake_year})`;
        stillNeeded = [
          ...audit.coreMissing.map((u) => `${u.code} ${u.name ?? ''}`.trim()),
          ...audit.prescribedMissing.map((u) => `${u.code} ${u.name ?? ''}`.trim()),
          ...(audit.wilMissing ? [`${audit.wilMissing.code} (work placement)`] : []),
          ...(audit.electiveShortfallUnits > 0 ? [`${audit.electiveShortfallUnits} more elective unit(s)`] : []),
        ];
        summary = isEligible
          ? `The student meets graduation requirements for ${checkedAgainst}.`
          : `Not yet eligible for ${checkedAgainst}: ${audit.reasons.join('; ')}.`;
      } else {
        // No planner could be matched, so only credits, failed units and the Conceded Pass limit can be checked.
        const conceded = getConcededPassUnitCodes(scraped.courseList);
        const creditsOk = scraped.creditsCompleted >= scraped.creditsRequired;
        const reasons: string[] = [];
        if (!creditsOk) reasons.push(`${scraped.creditsRequired - scraped.creditsCompleted} credits still needed`);
        if (hasFailedUnits) reasons.push(`${failedUnits.length} failed unit(s) not yet retaken`);
        if (conceded.length > MAX_CONCEDED_PASSES) reasons.push(`${conceded.length} Conceded Passes (maximum ${MAX_CONCEDED_PASSES})`);
        isEligible = reasons.length === 0;
        summary = isEligible
          ? 'No study planner could be matched, so only credits and results were checked: the student meets those.'
          : `Not yet eligible (no study planner could be matched, so only credits and results were checked): ${reasons.join('; ')}.`;
      }

      return {
        ok: true,
        data: {
          studentId: params.studentId,
          studentName: scraped.studentName ?? student.name,
          isEligible,
          completedCredits: scraped.creditsCompleted,
          requiredCredits: scraped.creditsRequired,
          cgpa: scraped.cgpa,
          hasFailedUnits,
          failedUnits,
          checkedAgainst,
          stillNeeded,
          summary,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch graduation status.' };
    }
  },
};
