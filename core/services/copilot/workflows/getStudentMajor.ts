import type { Workflow, WorkflowContext, WorkflowResult } from '../types';
import { runMatchingPipeline } from '../../matching/matchingService';
import type { PlannerTemplate, UnitMasterEntry, CourseType } from '../../../shared/types/matching';

const CATEGORY_PRIORITY: Record<string, number> = {
  major_core: 5,
  prescribed_elective: 4,
  core: 3,
  elective: 2,
  wil: 1,
};

function toMatchingCategory(prismaCategory: string): UnitMasterEntry['category'] | null {
  switch (prismaCategory) {
    case 'core':                return 'core';
    case 'major_core':          return 'majorCore';
    case 'prescribed_elective': return 'prescribed';
    case 'elective':            return 'freeElective';
    case 'wil':                 return 'WIL';
    default:                    return null;
  }
}

interface Output {
  studentName: string | null;
  detectedMajor: string | null;
  confidence: number;
  status: string;
  secondMajor: string | null;
  completedCredits: number;
  requiredCredits: number;
}

export const getStudentMajorWorkflow: Workflow<Record<string, never>, Output> = {
  id: 'get_student_major',
  description: 'Detects the major (program of study) for the currently loaded student by running the matching algorithm against all planner templates. Use this when the user asks what major a student is in, what program they are enrolled in, or what their detected major is.',
  params: [],
  async execute(_params: Record<string, never>, ctx: WorkflowContext): Promise<WorkflowResult<Output>> {
    if (!ctx.currentStudent) {
      return { ok: false, error: 'No student data is currently loaded. Please scrape a student first.' };
    }

    try {
      const plannerRepository = await import('../../../db/repositories/plannerRepository');
      const { prisma } = await import('../../../db/client');

      const thresholdRow = await prisma.systemConfig.findUnique({ where: { key: 'second_major_threshold' } }).catch(() => null);
      const secondMajorThreshold = thresholdRow
        ? Math.min(1, Math.max(0, parseFloat(thresholdRow.value)))
        : 0.70;

      const dbPlanners = await plannerRepository.getAllPlannersWithUnits();

      // Build unit master table
      const masterMap = new Map<string, { category: string; priority: number }>();
      for (const planner of dbPlanners) {
        for (const tu of planner.units) {
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

      const formattedPlanners: PlannerTemplate[] = dbPlanners.map((p) => ({
        plannerID: p.id,
        majorName: p.major?.name ?? '',
        intakeYear: p.intake_year,
        intakeSemester: ((p.intake_month ?? 1) >= 7 ? 2 : 1) as 1 | 2,
        courseType: (p.course_type as CourseType) || 'degree',
        durationSemesters: p.duration_semesters || 8,
        requiredCore: p.units
          .filter((u) => u.category === 'core' && u.unit)
          .map((u) => u.unit!.unit_code),
        requiredMajorCore: new Set(
          p.units.filter((u) => u.category === 'major_core' && u.unit).map((u) => u.unit!.unit_code)
        ),
        prescribedElectiveCategories: p.elective_groups.map((eg) => ({
          categoryCode: eg.id,
          pool: new Set(eg.units.map((egu) => egu.unit.unit_code)),
          slots: 1,
        })),
        freeElectivePool: new Set(
          p.units.filter((u) => u.category === 'elective' && u.unit).map((u) => u.unit!.unit_code)
        ),
        freeElectiveSlotsRequired: p.units.filter((u) => u.category === 'elective').length,
      }));

      const student = ctx.currentStudent;
      const completedUnitCodes = student.courseList.map((u) => u.courseId);

      // Derive intake year/semester from enrollmentDate (e.g. "2022-03-01")
      const enrollDate = new Date(student.enrollmentDate);
      const intakeYear = Number.isNaN(enrollDate.getFullYear()) ? new Date().getFullYear() : enrollDate.getFullYear();
      const intakeSemester: 1 | 2 = (enrollDate.getMonth() + 1) >= 7 ? 2 : 1;

      const result = runMatchingPipeline({
        student: {
          studentID: student.studentId ?? 'unknown',
          courseType: 'degree',
          intakeYear,
          intakeSemester,
          currentSemester: 1,
          completedUnitCodes,
          hasWIL: completedUnitCodes.some((c) => c.toUpperCase().includes('WIL')),
        },
        planners: formattedPlanners,
        unitMasterTable,
        config: { preferIntakeYear: false, secondMajorThreshold },
      });

      const payload = result.payload;

      return {
        ok: true,
        data: {
          studentName: student.studentName ?? null,
          detectedMajor: payload.primaryMajor?.majorName ?? null,
          confidence: payload.primaryMajor?.matchPct ?? 0,
          status: payload.status,
          secondMajor: payload.secondMajor?.majorName ?? null,
          completedCredits: student.creditsCompleted,
          requiredCredits: student.creditsRequired,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to run major detection.' };
    }
  },
};
