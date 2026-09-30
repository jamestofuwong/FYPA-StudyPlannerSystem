// ============================================================
// Tests for the mock transcript source and the switch that picks between sources.
//
// The point of the mock is that it satisfies the same contract as the live portal, so the real scrape loop
// runs against it unchanged. The most valuable test here is therefore the last one: the orchestrator,
// given the mock, produces stored records without any portal involvement at all.
// ============================================================

import { createMockPortalSource, resetMockCohort } from '@core/services/classEstimation/sources/mockPortalSource';
import { realPortalSource } from '@core/services/classEstimation/sources/realPortalSource';
import {
  resolvePortalSource,
  defaultPortalSourceId,
  isPortalSourceId,
  availablePortalSources,
} from '@core/services/classEstimation/sources/resolvePortalSource';
import { runScrapeForStudents } from '@core/services/classEstimation/scrapeOrchestrator';
import { getEstimationRecords, resetEstimationRecords } from '@core/services/classEstimation/estimationStore';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository');

// realPortalSource reaches portalSessionService, which reaches captureLoginSession and then puppeteer, an
// ESM-only package Jest's transform cannot parse. An explicit factory keeps the real module from ever
// loading. Only the two functions the source wraps are needed here.
jest.mock('@core/services/classEstimation/../portal/portalSessionService', () => ({
  getStatus: jest.fn(() => ({ sessionStatus: 'idle', studentCount: 0 })),
  getStudents: jest.fn(() => []),
  fetchEnrollments: jest.fn(),
  fetchDegreeAudit: jest.fn(),
}));

const getAllPlannersWithUnits = jest.mocked(plannerRepository.getAllPlannersWithUnits);

function dbPlanner(majorName: string) {
  const unit = (code: string, yearLevel: number, semester: number) => ({
    category: 'core',
    year_level: yearLevel,
    semester,
    unit: { unit_code: code, unit_name: `Unit ${code}` },
  });
  return {
    major: { name: majorName },
    course: { name: 'Bachelor of Computer Science' },
    intake_year: 2024,
    units: [
      unit('COS10009', 1, 1),
      unit('COS10003', 1, 1),
      unit('COS20007', 1, 2),
      unit('COS20031', 2, 1),
      unit('COS30049', 2, 2),
      unit('COS40005', 3, 1),
    ],
  };
}

function callbacks() {
  return { onProgress: jest.fn(), onStudentDone: jest.fn(), onStudentSkip: jest.fn(), onStudentError: jest.fn() };
}

describe('mock portal source', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockCohort();
    resetEstimationRecords();
    getAllPlannersWithUnits.mockResolvedValue([dbPlanner('Data Science'), dbPlanner('Software Engineering')] as never);
  });

  test('needs no login, unlike the live portal', () => {
    expect(createMockPortalSource().requiresLogin).toBe(false);
    expect(realPortalSource.requiresLogin).toBe(true);
  });

  test('is ready as soon as planners exist', async () => {
    await expect(createMockPortalSource().readiness()).resolves.toEqual({ ready: true });
  });

  // Without planners there is no curriculum to generate against, and saying so beats returning an empty
  // cohort that looks like a portal with no students in it.
  test('reports why it is not ready when no planners are loaded', async () => {
    getAllPlannersWithUnits.mockResolvedValue([] as never);
    const readiness = await createMockPortalSource().readiness();

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toMatch(/No planners are loaded/);
  });

  test('returns a student list with portal-range IDs', async () => {
    const students = await createMockPortalSource({ count: 5, seed: 1 }).getStudents();

    expect(students).toHaveLength(5);
    expect(students[0].student_id).toBe('102780000');
    for (const student of students) expect(student.db_id).toBeGreaterThan(0);
  });

  // The student list and the transcripts have to agree with each other across separate calls, so the
  // cohort is generated once and cached.
  test('the same db_id returns the same transcript on repeated calls', async () => {
    const source = createMockPortalSource({ count: 4, seed: 2 });
    const [student] = await source.getStudents();

    const first = await source.fetchDegreeAudit(student.db_id, 1);
    const second = await source.fetchDegreeAudit(student.db_id, 1);

    expect(first).toEqual(second);
    expect(first.studentId).toBe(student.student_id);
  });

  test('a cohort spans the majors that are loaded', async () => {
    const source = createMockPortalSource({ count: 12, seed: 3 });
    const students = await source.getStudents();
    const courses = new Set<string>();

    for (const student of students) {
      courses.add((await source.fetchDegreeAudit(student.db_id, 1)).course);
    }

    expect(courses.size).toBe(2);
  });

  // The scrape loop picks the highest non-MPU enrolment. Handing back both keeps that selection exercised
  // rather than bypassed, so a regression in the filter would show up against the mock too.
  test('hands back an MPU enrolment alongside the degree enrolment', async () => {
    const source = createMockPortalSource({ count: 2, seed: 4 });
    const [student] = await source.getStudents();
    const enrollments = await source.fetchEnrollments(student.db_id);

    expect(enrollments).toHaveLength(2);
    expect(enrollments.some((e) => e.EnrollmentDesc.toLowerCase().includes('mata pelajaran umum'))).toBe(true);
  });

  test('an unknown db_id is an error, not an empty transcript', async () => {
    const source = createMockPortalSource({ count: 2, seed: 5 });
    await expect(source.fetchDegreeAudit(9999, 1)).rejects.toThrow(/No mock student/);
  });

  // Intake has to come from the transcript's term codes, so the mock leaves enrollmentDate empty. Filling
  // it in would mask a regression in that derivation.
  test('leaves enrollmentDate empty so intake must come from the term codes', async () => {
    const source = createMockPortalSource({ count: 3, seed: 6 });
    const [student] = await source.getStudents();
    const audit = await source.fetchDegreeAudit(student.db_id, 1);

    expect(audit.enrollmentDate).toBe('');
    expect(audit.courseList.every((row) => row.term.length > 0)).toBe(true);
  });

  // Student IDs come from position, so they are the same whatever the seed. The transcripts are what
  // varies, which is what the comparison has to look at.
  test('a different seed gives different transcripts, the same seed repeats them', async () => {
    const auditsFor = async (seed: number) => {
      resetMockCohort();
      const source = createMockPortalSource({ count: 6, seed });
      const students = await source.getStudents();
      return Promise.all(students.map((s) => source.fetchDegreeAudit(s.db_id, 1)));
    };

    const a = await auditsFor(1);
    const b = await auditsFor(1);
    const c = await auditsFor(2);

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('resolvePortalSource', () => {
  const originalEnv = process.env.CLASS_ESTIMATION_SOURCE;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.CLASS_ESTIMATION_SOURCE = originalEnv;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  test('an explicit request wins', () => {
    expect(resolvePortalSource('mock').id).toBe('mock');
    expect(resolvePortalSource('portal').id).toBe('portal');
  });

  // Serving generated students when someone asked for the portal would be the worst failure available
  // here, so anything unrecognised falls back to the real thing.
  test.each([['nonsense'], [''], [null], [undefined]])('%p falls back to the portal', (requested) => {
    delete process.env.CLASS_ESTIMATION_SOURCE;
    expect(resolvePortalSource(requested as string | null | undefined).id).toBe('portal');
  });

  test('the environment sets the default outside production', () => {
    process.env.CLASS_ESTIMATION_SOURCE = 'mock';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    expect(defaultPortalSourceId()).toBe('mock');
    expect(resolvePortalSource().id).toBe('mock');
  });

  // Generated students must never be servable from a production build, where they could be mistaken for a
  // real cohort in front of the HoD.
  test('production ignores the environment and refuses mock entirely', () => {
    process.env.CLASS_ESTIMATION_SOURCE = 'mock';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    expect(defaultPortalSourceId()).toBe('portal');
    expect(resolvePortalSource('mock').id).toBe('portal');
    expect(availablePortalSources().map((s) => s.id)).toEqual(['portal']);
  });

  test('outside production the picker offers both', () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
    expect(availablePortalSources().map((s) => s.id)).toEqual(['portal', 'mock']);
  });

  test('isPortalSourceId only accepts the two known ids', () => {
    expect(isPortalSourceId('portal')).toBe(true);
    expect(isPortalSourceId('mock')).toBe(true);
    expect(isPortalSourceId('import')).toBe(false);
    expect(isPortalSourceId(undefined)).toBe(false);
  });
});

// This is what the whole contract exists for: the real loop, run against generated data, with no portal.
describe('the scrape loop against the mock source', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockCohort();
    resetEstimationRecords();
    getAllPlannersWithUnits.mockResolvedValue([dbPlanner('Data Science'), dbPlanner('Software Engineering')] as never);
  });

  test('stores a record per student, marked as coming from mock data', async () => {
    const source = createMockPortalSource({ count: 5, seed: 7 });
    const students = await source.getStudents();
    const cb = callbacks();

    const summary = await runScrapeForStudents(students, cb, () => false, source);

    expect(summary).toEqual({ completed: 5, failed: 0, skipped: 0 });

    const records = getEstimationRecords();
    expect(records).toHaveLength(5);
    for (const record of records) {
      expect(record.source).toBe('mock');
      expect(record.transcript.length).toBeGreaterThan(0);
      expect(record.rawInput.intakeYear).toBeGreaterThan(2000);
    }
  });

  test('progress and completion are reported exactly as they are for the portal', async () => {
    const source = createMockPortalSource({ count: 3, seed: 8 });
    const students = await source.getStudents();
    const cb = callbacks();

    await runScrapeForStudents(students, cb, () => false, source);

    expect(cb.onStudentDone).toHaveBeenCalledTimes(3);
    expect(cb.onStudentError).not.toHaveBeenCalled();
    // Two phases reported per student: enrolments then audit.
    expect(cb.onProgress).toHaveBeenCalledTimes(6);
  });

  test('cancellation stops the run, same as against the portal', async () => {
    const source = createMockPortalSource({ count: 5, seed: 9 });
    const students = await source.getStudents();

    const summary = await runScrapeForStudents(students, callbacks(), () => true, source);

    expect(summary).toEqual({ completed: 0, failed: 0, skipped: 0 });
    expect(getEstimationRecords()).toEqual([]);
  });
});
