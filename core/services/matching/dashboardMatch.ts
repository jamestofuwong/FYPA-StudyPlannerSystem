import { runMatchingPipeline } from './matchingService';
import * as plannerRepository from '../../db/repositories/plannerRepository';
import { prisma } from '../../db/client';
import { parseSecondMajorThreshold } from './secondMajorThreshold';
import { buildPlannerTemplatesForMatching } from './plannerTemplateBuilder';
import { buildUnitMasterTable } from './unitMasterTableBuilder';

/**
 * Runs the major-detection match for a student against every planner in the
 * database. Shared by /api/match (the dashboard) and the copilot's dashboard
 * handoff, so both always produce the same result.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runDashboardMatch(rawStudent: any) {
  const student = {
    ...rawStudent,
    courseType: rawStudent.courseType || 'degree',
    currentSemester: rawStudent.currentSemester || 1,
  };

  // REQ-FUN-610: read user-configured second major threshold from SystemConfig (default 0.70)
  const thresholdRow = await prisma.systemConfig.findUnique({ where: { key: 'second_major_threshold' } }).catch(() => null);
  const secondMajorThreshold = parseSecondMajorThreshold(thresholdRow?.value);

  const dbPlanners = await plannerRepository.getAllPlannersWithUnits();

  // The same builders class estimation uses, so the dashboard and the forecast read planners and units alike.
  const formattedPlanners = buildPlannerTemplatesForMatching(dbPlanners);
  const unitMasterTable = await buildUnitMasterTable(dbPlanners);

  const result = runMatchingPipeline({
    student,
    planners: formattedPlanners,
    unitMasterTable,
    config: { preferIntakeYear: false, secondMajorThreshold },
  });

  return {
    data: result.payload,
    processingTime: result.durationMs,
  };
}
