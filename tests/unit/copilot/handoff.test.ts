/**
 * Dashboard handoff: the data a copilot button opens the dashboard with.
 * The portal, matching and planner database are mocked.
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

import {
  requestDashboardHandoff,
  getDashboardHandoff,
  clearDashboardHandoffs,
  HANDOFF_TTL_MS,
} from '../../../core/services/copilot/handoff';

const course = (id: string, grade = 'D', status = 'Complete') => ({
  courseId: id, courseTitle: id, level: '', credits: 12.5, creditsEarned: 12.5, status, grade, term: '2024',
});

const audit = (courses = [course('COS10009')]) => ({
  studentId: '102780123',
  course: 'BA-CS',
  status: 'Active',
  cgpa: 3,
  creditsRequired: 300,
  creditsCompleted: 100,
  scheduledCredits: 0,
  gradeLevel: 'Year 2',
  enrollmentDate: '01/03/2024',
  graduationDate: null,
  courseList: courses,
});

const ENROLLMENTS = [
  { EnrollId: 1, EnrollmentDesc: 'Bachelor of Computer Science' },
  { EnrollId: 2, EnrollmentDesc: 'Mata Pelajaran Umum' },
];

beforeEach(() => {
  clearDashboardHandoffs();
  jest.clearAllMocks();
  mockSearchStudents.mockReturnValue([{ student_id: '102780123', name: 'Ann Lee', db_id: 55 }]);
  mockFetchEnrollments.mockResolvedValue(ENROLLMENTS);
  mockFetchDegreeAudit.mockImplementation(async (_db: number, enrollId: number) =>
    enrollId === 2 ? audit([course('MPU1001')]) : audit(),
  );
  mockRunDashboardMatch.mockResolvedValue({
    data: { rankedPlanners: [{ plannerID: 'p1' }, { plannerID: 'p2' }, { plannerID: 'p3' }, { plannerID: 'p4' }] },
  });
  mockGetPlannerById.mockImplementation(async (id: string) => ({ id, units: [] }));
});

describe('building the dashboard data', () => {
  it('produces what the dashboard would build for the same student', async () => {
    const id = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' });
    const h = await getDashboardHandoff(id);

    expect(h).not.toBeNull();
    expect(h!.dbId).toBe(55);
    expect(h!.studentName).toBe('Ann Lee');
    expect(h!.student.selectedEnrollment).toBe('Bachelor of Computer Science');
    expect(h!.student.enrollmentOptions).toEqual([
      { text: 'Bachelor of Computer Science' },
      { text: 'Mata Pelajaran Umum' },
    ]);
    // top three planners only, in ranked order
    expect(h!.dashboardData.planners.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(h!.dashboardData.enrollmentMode).toBe('latest');
    expect(h!.dashboardData.studentId).toBe('102780123');
    expect(h!.selectedPlannerIdx).toBe(0);
    expect(h!.manualPlanner).toBeNull();
  });

  it('merges the MPU enrollment courses for latest, as the dashboard does', async () => {
    const h = await getDashboardHandoff(requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' }));
    expect(h!.dashboardData.mpuCourseList.map((c: { courseId: string }) => c.courseId)).toEqual(['MPU1001']);
    // both the degree and the MPU units count as completed in the match
    const sent = mockRunDashboardMatch.mock.calls[0][0];
    expect(sent.completedUnitCodes).toEqual(expect.arrayContaining(['COS10009', 'MPU1001']));
    expect(sent).toMatchObject({ studentID: '102780123', courseCode: 'BA-CS', intakeYear: 2024, intakeSemester: 1 });
  });

  it('does not merge MPU courses when the MPU enrollment itself is shown', async () => {
    const h = await getDashboardHandoff(requestDashboardHandoff({ studentId: '102780123', enrollMode: 'mpu' }));
    expect(h!.dashboardData.mpuCourseList).toEqual([]);
    expect(h!.student.selectedEnrollment).toBe('Mata Pelajaran Umum');
  });

  it('selects the requested planner when it is among the top three', async () => {
    const h = await getDashboardHandoff(requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest', plannerId: 'p2' }));
    expect(h!.selectedPlannerIdx).toBe(1);
    expect(h!.manualPlanner).toBeNull();
  });

  it('shows a planner outside the top three as the manually chosen one', async () => {
    const h = await getDashboardHandoff(requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest', plannerId: 'p4' }));
    expect(h!.selectedPlannerIdx).toBe(-1);
    expect(h!.manualPlanner).toMatchObject({ id: 'p4' });
  });

  it('reports why it failed so the page can fall back', async () => {
    mockSearchStudents.mockReturnValue([]);
    const id = requestDashboardHandoff({ studentId: '999', enrollMode: 'latest' });
    await expect(getDashboardHandoff(id)).rejects.toThrow(/not found/i);
  });
});

describe('sharing and expiry', () => {
  it('reuses one entry for the same student, mode and planner', async () => {
    const a = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' });
    const b = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' });
    expect(b).toBe(a);
    await getDashboardHandoff(a);
    expect(mockFetchDegreeAudit).toHaveBeenCalledTimes(2); // degree + MPU, once
  });

  it('keeps separate entries for a different mode or planner', () => {
    const a = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' });
    const b = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'earliest' });
    const c = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest', plannerId: 'p2' });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('returns null for an unknown id', async () => {
    expect(await getDashboardHandoff('nope')).toBeNull();
  });

  it('forgets an entry after the time limit', async () => {
    const realNow = Date.now;
    const id = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' });
    await getDashboardHandoff(id);
    Date.now = () => realNow() + HANDOFF_TTL_MS + 1000;
    try {
      expect(await getDashboardHandoff(id)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it('does not keep a failed build, so asking again can succeed', async () => {
    mockSearchStudents.mockReturnValueOnce([]);
    const first = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' });
    await expect(getDashboardHandoff(first)).rejects.toThrow();
    const second = requestDashboardHandoff({ studentId: '102780123', enrollMode: 'latest' });
    expect(second).not.toBe(first);
    expect(await getDashboardHandoff(second)).not.toBeNull();
  });
});
