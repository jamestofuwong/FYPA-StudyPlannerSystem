import type { Workflow } from './types';
import { listPlannersWorkflow } from './workflows/listPlanners';
import { getPortalStatusWorkflow } from './workflows/getPortalStatus';
import { getStudentUnitsWorkflow } from './workflows/getStudentUnits';
import { checkGraduationStatusWorkflow } from './workflows/checkGraduationStatus';
import { getStudentMajorWorkflow } from './workflows/getStudentMajor';
import { getStudentProgressWorkflow } from './workflows/getStudentProgress';
import { getStudentFailedUnitsWorkflow } from './workflows/getStudentFailedUnits';
import { compareStudentToPlannerWorkflow } from './workflows/compareStudentToPlanner';
import { searchStudentWorkflow } from './workflows/searchStudent';
import { getPlannerDetailsWorkflow } from './workflows/getPlannerDetails';
import { findPlannerByMajorWorkflow } from './workflows/findPlannerByMajor';
import { getUnitDetailsWorkflow } from './workflows/getUnitDetails';
import { getUnitsBySemesterWorkflow } from './workflows/getUnitsBySemester';
import { getStudentPrerequisiteViolationsWorkflow } from './workflows/getStudentPrerequisiteViolations';
import { getStudentElectiveOptionsWorkflow } from './workflows/getStudentElectiveOptions';
import { getPlannerScoreBreakdownWorkflow } from './workflows/getPlannerScoreBreakdown';
import { getStudentEnrollmentHistoryWorkflow } from './workflows/getStudentEnrollmentHistory';
import { compareTwoPlannersWorkflow } from './workflows/compareTwoPlanners';
import { getPlannerMissingUnitsWorkflow } from './workflows/getPlannerMissingUnits';
// Batch 3 — student detail workflows
import { getStudentGradeForUnitWorkflow } from './workflows/getStudentGradeForUnit';
import { checkStudentWilStatusWorkflow } from './workflows/checkStudentWilStatus';
import { getStudentRepeatedUnitsWorkflow } from './workflows/getStudentRepeatedUnits';
import { didStudentPassUnitWorkflow } from './workflows/didStudentPassUnit';
// Batch 3 — unit cross-reference workflows
import { getUnitsRequiringUnitWorkflow } from './workflows/getUnitsRequiringUnit';
import { isUnitOfferedThisSemesterWorkflow } from './workflows/isUnitOfferedThisSemester';
import { getUnitsByPrefixWorkflow } from './workflows/getUnitsByPrefix';
import { getUnitsWithNoPrerequisitesWorkflow } from './workflows/getUnitsWithNoPrerequisites';
// Batch 3 — planner query workflows
import { getPlannersByIntakeYearWorkflow } from './workflows/getPlannersByIntakeYear';
import { getPlannersContainingUnitWorkflow } from './workflows/getPlannersContainingUnit';
import { getPlannerUnitCountWorkflow } from './workflows/getPlannerUnitCount';
import { getUnitCategoryInPlannerWorkflow } from './workflows/getUnitCategoryInPlanner';
// Batch 3 — cross-entity workflows
import { canStudentTakeUnitWorkflow } from './workflows/canStudentTakeUnit';
import { getAvailableUnitsForStudentWorkflow } from './workflows/getAvailableUnitsForStudent';
import { isStudentOnTrackWorkflow } from './workflows/isStudentOnTrack';
import { getStudentAvailableUnitsFromPlannerWorkflow } from './workflows/getStudentAvailableUnitsFromPlanner';
import { getPlanSwitchImpactWorkflow } from './workflows/getPlanSwitchImpact';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workflows: Workflow<any, any>[] = [
  // Student portal workflows
  searchStudentWorkflow,
  getStudentMajorWorkflow,
  getStudentProgressWorkflow,
  checkGraduationStatusWorkflow,
  getStudentUnitsWorkflow,
  getStudentFailedUnitsWorkflow,
  getStudentEnrollmentHistoryWorkflow,
  getStudentPrerequisiteViolationsWorkflow,
  getStudentGradeForUnitWorkflow,
  didStudentPassUnitWorkflow,
  checkStudentWilStatusWorkflow,
  getStudentRepeatedUnitsWorkflow,
  compareStudentToPlannerWorkflow,
  getPlannerMissingUnitsWorkflow,
  getStudentElectiveOptionsWorkflow,
  // Curriculum / planner workflows
  listPlannersWorkflow,
  findPlannerByMajorWorkflow,
  getPlannerDetailsWorkflow,
  getPlannerUnitCountWorkflow,
  getPlannerScoreBreakdownWorkflow,
  getPlannersByIntakeYearWorkflow,
  getPlannersContainingUnitWorkflow,
  compareTwoPlannersWorkflow,
  // Unit workflows
  getUnitDetailsWorkflow,
  getUnitsBySemesterWorkflow,
  getUnitsByPrefixWorkflow,
  getUnitsWithNoPrerequisitesWorkflow,
  getUnitsRequiringUnitWorkflow,
  isUnitOfferedThisSemesterWorkflow,
  getUnitCategoryInPlannerWorkflow,
  // Cross-entity workflows
  canStudentTakeUnitWorkflow,
  getAvailableUnitsForStudentWorkflow,
  isStudentOnTrackWorkflow,
  getStudentAvailableUnitsFromPlannerWorkflow,
  getPlanSwitchImpactWorkflow,
  // System status
  getPortalStatusWorkflow,
];

export const workflowRegistry = new Map(workflows.map((w) => [w.id, w]));
export const allWorkflows: Workflow[] = workflows;
