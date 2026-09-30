import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { searchStudents, fetchEnrollments, fetchDegreeAudit } from '../../portal/portalSessionService';
import { runMatchingPipeline } from '../../matching/matchingService';
import { selectEnrollment } from './enrollmentSelector';
import type { PlannerTemplate, UnitMasterEntry, CourseType } from '../../../shared/types/matching';

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

const CATEGORY_PRIORITY: Record<string, number> = {
  major_core: 5,
  prescribed_elective: 4,
  core: 3,
  elective: 2,
  wil: 1,
};

function toMatchingCategory(cat: string): UnitMasterEntry['category'] | null {
  switch (cat) {
    case 'core':                return 'core';
    case 'major_core':          return 'majorCore';
    case 'prescribed_elective': return 'prescribed';
    case 'elective':            return 'freeElective';
    case 'wil':                 return 'WIL';
    default:                    return null;
  }
}

export const getPlannerScoreBreakdownWorkflow: Workflow<Input, Output> = {
  id: 'get_planner_score_breakdown',
  description: 'Runs the major matching pipeline for a student against a specific planner and returns a detailed score breakdown: core match %, major core score, missing units per category. Use this when the user wants to know how well a student matches a specific major or plan.',
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

      // Build unit master table
      const masterMap = new Map<string, { category: string; priority: number }>();
      for (const p of dbPlanners) {
        for (const tu of p.units) {
          if (!tu.unit) continue;
          const code = tu.unit.unit_code;
          const priority = CATEGORY_PRIORITY[tu.category] ?? 0;
          const existing = masterMap.get(code);
          if (!existing || priority > existing.priority) {
            masterMap.set(code, { category: tu.category, priority });
          }
        }
      }

      const unitMasterTable: UnitMasterEntry[] = [];
      for (const [code, entry] of masterMap) {
        const category = toMatchingCategory(entry.category);
        if (!category) continue;
        unitMasterTable.push({ code, name: '', category, creditHours: 12.5, subjectTags: [], requisites: [] });
      }

      // Format all planners for the matching pipeline
      const formattedPlanners: PlannerTemplate[] = dbPlanners.map((p) => ({
        plannerID: p.id,
        majorName: p.major?.name ?? '',
        intakeYear: p.intake_year,
        intakeSemester: ((p.intake_month ?? 1) >= 7 ? 2 : 1) as 1 | 2,
        courseType: (p.course_type as CourseType) || 'degree',
        durationSemesters: p.duration_semesters || 8,
        requiredCore: p.units.filter((u) => u.category === 'core' && u.unit).map((u) => u.unit!.unit_code),
        requiredMajorCore: new Set(p.units.filter((u) => u.category === 'major_core' && u.unit).map((u) => u.unit!.unit_code)),
        prescribedElectiveCategories: p.elective_groups.map((eg) => ({
          categoryCode: eg.id,
          pool: new Set(eg.units.map((egu) => egu.unit.unit_code)),
          slots: 1,
        })),
        freeElectivePool: new Set(p.units.filter((u) => u.category === 'elective' && u.unit).map((u) => u.unit!.unit_code)),
        freeElectiveSlotsRequired: p.units.filter((u) => u.category === 'elective').length,
      }));

      const completedUnitCodes = scraped.courseList.map((u) => u.courseId);
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
