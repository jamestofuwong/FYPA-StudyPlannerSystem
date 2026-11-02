import type { WorkflowLink } from './types';

// ---------------------------------------------------------------------------
// Where each workflow's answer can be seen in the app.
//
// Links are decided here, in code, never by the language model, so an answer
// can only point at a page that really shows that result. A workflow with
// nothing to show maps to `none` on purpose; a test requires every workflow to
// appear in this table.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = any;
type LinkBuilder = (params: Params, data: Data) => WorkflowLink[];

/** Most planner buttons one answer will carry, so a long list stays readable. */
export const MAX_LIST_LINKS = 5;

const none: LinkBuilder = () => [];

/** Dashboard tabs and anchors a student link can jump to. */
export const DASHBOARD_SECTIONS = ['ranked-planners', 'analytics', 'graduation', 'units', 'pathway', 'enrollment'] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function studentLink(
  params: Params,
  label: string,
  section: DashboardSection,
  plannerId?: string,
): WorkflowLink[] {
  const studentId = str(params.studentId);
  if (!studentId) return [];
  const enrollMode = str(params.enrollMode) || 'latest';
  return [{
    label,
    target: 'dashboard',
    section,
    query: { studentId, enrollMode },
    student: { studentId, enrollMode, ...(plannerId ? { plannerId } : {}) },
  }];
}

function plannerLink(plannerId: unknown, label: string): WorkflowLink[] {
  const id = str(plannerId);
  return id ? [{ label, target: 'planners', query: { plannerId: id } }] : [];
}

function unitLink(code: unknown, label?: string): WorkflowLink[] {
  const unitCode = str(code);
  return unitCode ? [{ label: label ?? `View ${unitCode}`, target: 'units', query: { q: unitCode } }] : [];
}

function plannerListLinks(planners: Data): WorkflowLink[] {
  if (!Array.isArray(planners)) return [];
  return planners.slice(0, MAX_LIST_LINKS).flatMap((p) => {
    const intake = p.intakeYear ? ` ${p.intakeYear}` : '';
    return plannerLink(p?.id, `View ${p?.majorName || 'planner'}${intake}`);
  });
}

export const workflowLinks: Record<string, LinkBuilder> = {
  // ── Student workflows: open the dashboard on the relevant tab ────────────
  search_student: (_p, d) =>
    (Array.isArray(d?.students) ? d.students : []).slice(0, 3).flatMap((s: Data) => {
      const studentId = str(s?.studentId);
      // No handoff: the user has not chosen a student, so the page loads the
      // one they click instead of preparing every match in advance.
      return studentId
        ? [{ label: `Open ${s?.name || studentId}`, target: 'dashboard', query: { studentId, enrollMode: 'latest' } } as WorkflowLink]
        : [];
    }),
  get_student_major: (p) => studentLink(p, 'View match results', 'ranked-planners'),
  get_planner_score_breakdown: (p) => [
    ...studentLink(p, 'View match scores', 'ranked-planners'),
    ...plannerLink(p.plannerId, 'View planner'),
  ],
  get_student_progress: (p) => studentLink(p, 'View graduation progress', 'graduation'),
  check_graduation_status: (p) => studentLink(p, 'View graduation check', 'graduation'),
  check_student_wil_status: (p) => studentLink(p, 'View graduation check', 'graduation'),
  is_student_on_track: (p) => [
    ...studentLink(p, 'View graduation check', 'graduation', str(p.plannerId)),
    ...plannerLink(p.plannerId, 'View planner'),
  ],
  get_student_units: (p) => studentLink(p, 'View unit plan', 'units'),
  get_student_failed_units: (p) => studentLink(p, 'View unit plan', 'units'),
  get_student_repeated_units: (p) => studentLink(p, 'View unit plan', 'units'),
  get_student_grade_for_unit: (p) => [
    ...studentLink(p, 'View unit plan', 'units'),
    ...unitLink(p.unitCode),
  ],
  did_student_pass_unit: (p) => [
    ...studentLink(p, 'View unit plan', 'units'),
    ...unitLink(p.unitCode),
  ],
  can_student_take_unit: (p) => [
    ...studentLink(p, 'View unit plan', 'units'),
    ...unitLink(p.unitCode),
  ],
  get_student_prerequisite_violations: (p) => studentLink(p, 'View unit plan', 'units'),
  get_student_enrollment_history: (p) => studentLink(p, 'View enrollments', 'enrollment'),
  get_available_units_for_student: (p) => studentLink(p, 'View units not yet taken', 'analytics'),
  compare_student_to_planner: (p) => [
    ...studentLink(p, 'View comparison', 'units', str(p.plannerId)),
    ...plannerLink(p.plannerId, 'View planner'),
  ],
  get_planner_missing_units: (p) => [
    ...studentLink(p, 'View missing units', 'units', str(p.plannerId)),
    ...plannerLink(p.plannerId, 'View planner'),
  ],
  get_student_available_units_from_planner: (p) => [
    ...studentLink(p, 'View unit plan', 'units', str(p.plannerId)),
    ...plannerLink(p.plannerId, 'View planner'),
  ],
  get_plan_switch_impact: (p) => [
    ...studentLink(p, 'View with the new planner', 'units', str(p.newPlannerId)),
    ...plannerLink(p.newPlannerId, 'View new planner'),
  ],
  get_student_elective_options: (p) => {
    const studentId = str(p.studentId);
    const enrollMode = str(p.enrollMode) || 'latest';
    return [
      ...studentLink(p, 'View unit plan', 'units', str(p.plannerId)),
      ...(studentId
        ? [{
            label: 'Open Student Pathway',
            target: 'pathway',
            query: { studentId, enrollMode },
            student: { studentId, enrollMode, ...(str(p.plannerId) ? { plannerId: str(p.plannerId) } : {}) },
          } as WorkflowLink]
        : []),
      ...plannerLink(p.plannerId, 'View planner'),
    ];
  },

  // ── Planner workflows: open Study Planners on the planner ────────────────
  list_planners: () => [{ label: 'Open Study Planners', target: 'planners' }],
  find_planner_by_major: (_p, d) => plannerListLinks(d?.planners),
  get_planners_by_intake_year: (_p, d) => plannerListLinks(d?.planners),
  get_planners_containing_unit: (p, d) => [
    ...plannerListLinks(d?.planners),
    ...unitLink(p.unitCode),
  ],
  get_planner_details: (p, d) => plannerLink(d?.plannerId ?? p.plannerId, 'View planner'),
  get_planner_unit_count: (p, d) => plannerLink(d?.plannerId ?? p.plannerId, 'View planner'),
  get_unit_category_in_planner: (p, d) => [
    ...plannerLink(d?.plannerId ?? p.plannerId, 'View planner'),
    ...unitLink(p.unitCode),
  ],
  compare_two_planners: (p, d) => [
    ...plannerLink(p.plannerId1, `View ${d?.planner1Name ?? 'first planner'}`),
    ...plannerLink(p.plannerId2, `View ${d?.planner2Name ?? 'second planner'}`),
  ],

  // ── Unit workflows: open Units, filtered where a filter exists ───────────
  get_unit_details: (p) => unitLink(p.unitCode),
  get_units_requiring_unit: (p) => unitLink(p.unitCode),
  is_unit_offered_this_semester: (p) => unitLink(p.unitCode),
  get_units_by_prefix: (p) => {
    const prefix = str(p.prefix);
    return prefix ? [{ label: `View ${prefix} units`, target: 'units', query: { q: prefix } }] : [];
  },
  get_units_by_semester: () => [{ label: 'Open Units', target: 'units' }],
  get_units_with_no_prerequisites: () => [{ label: 'Open Units', target: 'units' }],

  // ── System ───────────────────────────────────────────────────────────────
  get_portal_status: () => [{ label: 'Open portal login', target: 'scraping' }],
};

/** Links for one answer. Never throws: a bad result shape just yields no buttons. */
export function linksForWorkflow(workflowId: string, params: Params, data: Data): WorkflowLink[] {
  try {
    return (workflowLinks[workflowId] ?? none)(params, data);
  } catch {
    return [];
  }
}
