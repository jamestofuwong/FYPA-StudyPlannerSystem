import type { Workflow } from './types';
import { listPlannersWorkflow } from './workflows/listPlanners';
import { getPortalStatusWorkflow } from './workflows/getPortalStatus';
import { getStudentUnitsWorkflow } from './workflows/getStudentUnits';
import { checkGraduationStatusWorkflow } from './workflows/checkGraduationStatus';
import { getStudentMajorWorkflow } from './workflows/getStudentMajor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workflows: Workflow<any, any>[] = [
  getStudentMajorWorkflow,
  checkGraduationStatusWorkflow,
  getStudentUnitsWorkflow,
  getPortalStatusWorkflow,
  listPlannersWorkflow,
];

export const workflowRegistry = new Map(workflows.map((w) => [w.id, w]));
export const allWorkflows: Workflow[] = workflows;
