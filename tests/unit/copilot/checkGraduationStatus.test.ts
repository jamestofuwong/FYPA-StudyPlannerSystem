/**
 * The copilot's graduation check runs the same audit as the dashboard's Graduation tab, against the planner the
 * student matches. The portal, matching and planner database are mocked.
 */
const mockSearchStudents = jest.fn();
const mockFetchEnrollments = jest.fn();
const mockFetchDegreeAudit = jest.fn();
const mockRunDashboardMatch = jest.fn();
const mockGetPlannerById = jest.fn();

jest.mock('../../../core/services/portal/portalSessionService', () => ({
  searchStudents: (...a: unknown[]) => mockSearchStudents(...a),
  fetchEnrollments: (...a: unknown[]) => mockFetchEnrollments(...a),
  fetchDegreeAudit: (...a: unknown[]) => mockFetchDegreeAudit(...a),
}));
jest.mock('../../../core/services/matching/dashboardMatch', () => ({
  runDashboardMatch: (...a: unknown[]) => mockRunDashboardMatch(...a),
}));
jest.mock('../../../core/db/repositories/plannerRepository', () => ({
  getPlannerById: (...a: unknown[]) => mockGetPlannerById(...a),
}));

import { checkGraduationStatusWorkflow } from '../../../core/services/copilot/workflows/checkGraduationStatus';

const row = (courseId: string, grade = 'D', status = 'Complete') => ({
  courseId, courseTitle: courseId, level: '', credits: 12.5, creditsEarned: grade === 'N' ? 0 : 12.5, status, grade, term: '2025_SEP_S2',
});
const planned = (code: string, category: string) => ({ unit: { unit_code: code, unit_name: `${code} name` }, category, semester: 1 });
const PLANNER = {
  id: 'p1', course_type: 'bachelor', intake_year: 2025, major: { name: 'Cybersecurity' },
  units: [planned('CORE1', 'core'), planned('MAJ1', 'major_core')],
  elective_groups: [], core_cp: 12.5, major_cp: 12.5, elective_cp: null, wil_cp: null,
};
const audit = (courseList: ReturnType<typeof row>[], creditsCompleted = 300) => ({
  studentId: '1', course: 'BA-CS', status: 'Active', cgpa: 3, creditsRequired: 300, creditsCompleted, scheduledCredits: 0,
  gradeLevel: '', enrollmentDate: '01/09/2025', graduationDate: null, courseList,
});

const run = () => checkGraduationStatusWorkflow.execute({ studentId: '102780123' }, { ollamaStatus: { ollama: 'ready', model: 'x' } } as never);

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchStudents.mockReturnValue([{ student_id: '102780123', name: 'Ann Lee', db_id: 55 }]);
  mockFetchEnrollments.mockResolvedValue([{ EnrollId: 1, EnrollmentDesc: 'Bachelor of Computer Science' }]);
  mockRunDashboardMatch.mockResolvedValue({ data: { status: 'detected', rankedPlanners: [{ plannerID: 'p1' }] } });
  mockGetPlannerById.mockResolvedValue(PLANNER);
});

describe('check_graduation_status', () => {
  it('says eligible when the matched planner is fully met', async () => {
    mockFetchDegreeAudit.mockResolvedValue(audit([row('CORE1'), row('MAJ1')]));
    const r = await run();
    expect(r.ok && r.data.isEligible).toBe(true);
    expect(r.ok && r.data.checkedAgainst).toBe('Cybersecurity (bachelor, 2025)');
  });

  it('names the units still needed, which credits alone would never show', async () => {
    mockFetchDegreeAudit.mockResolvedValue(audit([row('CORE1')], 300));   // credits are fine, a major unit is missing
    const r = await run();
    expect(r.ok && r.data.isEligible).toBe(false);
    expect(r.ok && r.data.stillNeeded).toEqual(['MAJ1 MAJ1 name']);
    expect(r.ok && r.data.summary).toMatch(/Not yet eligible for Cybersecurity/);
  });

  it('refuses a second Conceded Pass', async () => {
    mockFetchDegreeAudit.mockResolvedValue(audit([row('CORE1', 'CP'), row('MAJ1', 'CP')]));
    const r = await run();
    expect(r.ok && r.data.isEligible).toBe(false);
    expect(r.ok && r.data.summary).toMatch(/2 Conceded Passes/);
  });

  it('treats a failed unit that was later passed as passed', async () => {
    mockFetchDegreeAudit.mockResolvedValue(audit([row('CORE1', 'N'), row('CORE1', 'SP'), row('MAJ1')]));
    const r = await run();
    expect(r.ok && r.data.hasFailedUnits).toBe(false);
    expect(r.ok && r.data.isEligible).toBe(true);
  });

  it('falls back to credits and results when no planner can be matched, and says so', async () => {
    mockRunDashboardMatch.mockResolvedValue({ data: { status: 'noMajorDetected', rankedPlanners: [{ plannerID: 'p1' }] } });
    mockFetchDegreeAudit.mockResolvedValue(audit([row('CORE1')], 250));
    const r = await run();
    expect(r.ok && r.data.checkedAgainst).toBeNull();
    expect(r.ok && r.data.isEligible).toBe(false);
    expect(r.ok && r.data.summary).toMatch(/no study planner could be matched/);
    expect(mockGetPlannerById).not.toHaveBeenCalled();
  });

  it('falls back the same way if matching fails', async () => {
    mockRunDashboardMatch.mockRejectedValue(new Error('db down'));
    mockFetchDegreeAudit.mockResolvedValue(audit([row('CORE1')], 300));
    const r = await run();
    expect(r.ok && r.data.checkedAgainst).toBeNull();
    expect(r.ok && r.data.isEligible).toBe(true);
  });
});
