import { NextRequest } from 'next/server';
import { POST } from '@/app/api/plan-file/resolve/route';
import { prisma } from '@core/db/client';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/client', () => ({
  prisma: {
    course: { findUnique: jest.fn(), findFirst: jest.fn() },
    major: { findUnique: jest.fn() },
    plannerTemplate: { findUnique: jest.fn(), findFirst: jest.fn() },
    unit: { findMany: jest.fn() },
  },
}));
jest.mock('@core/db/repositories/plannerRepository', () => ({
  getPlannerById: jest.fn(),
}));

const courseFindUnique = jest.mocked(prisma.course.findUnique);
const courseFindFirst = jest.mocked(prisma.course.findFirst);
const majorFindUnique = jest.mocked(prisma.major.findUnique);
const templateFindFirst = jest.mocked(prisma.plannerTemplate.findFirst);
const unitFindMany = jest.mocked(prisma.unit.findMany);
const getPlannerById = jest.mocked(plannerRepository.getPlannerById);

const call = async (body: any) => {
  const response = await POST(new NextRequest('http://localhost/api/plan-file/resolve', {
    method: 'POST',
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
};

const basePlannerKey = {
  courseCode: 'BA-CS', courseName: 'Bachelor of Computer Science', majorName: 'Artificial Intelligence', intakeYear: 2023, intakeMonth: 9,
};

const FULL_PLANNER = { id: 'planner-uuid-1', course: { name: 'Bachelor of Computer Science' }, major: { name: 'Artificial Intelligence' }, units: [], minors: [{ id: 'minor-uuid-1', name: 'Data Science Minor' }], elective_groups: [] };

beforeEach(() => {
  jest.clearAllMocks();
  courseFindUnique.mockResolvedValue({ id: 'course-uuid-1', code: 'BA-CS', name: 'Bachelor of Computer Science' } as never);
  majorFindUnique.mockResolvedValue({ id: 'major-uuid-1', name: 'Artificial Intelligence' } as never);
  templateFindFirst.mockResolvedValue({ id: 'planner-uuid-1' } as never);
  getPlannerById.mockResolvedValue(FULL_PLANNER as never);
  unitFindMany.mockResolvedValue([] as never);
});

describe('POST /api/plan-file/resolve', () => {
  test('a known planner resolves, returning the full planner object', async () => {
    const { status, body } = await call({ planner: basePlannerKey, minorNames: [], doubleMajorMajorName: null, outsidePlannerUnitCodes: [] });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.planner).toEqual(FULL_PLANNER);
  });

  test('an unknown course returns a clear no-match result, not a 500', async () => {
    courseFindUnique.mockResolvedValue(null as never);
    const { status, body } = await call({ planner: basePlannerKey, minorNames: [], doubleMajorMajorName: null, outsidePlannerUnitCodes: [] });
    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not in this database/i);
  });

  test('a known course but no matching planner (template not found) returns a clear no-match result', async () => {
    templateFindFirst.mockResolvedValue(null as never);
    const { status, body } = await call({ planner: basePlannerKey, minorNames: [], doubleMajorMajorName: null, outsidePlannerUnitCodes: [] });
    expect(status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/not in this database/i);
  });

  test('a planner with a null major resolves (major lookup skipped)', async () => {
    const keyNoMajor = { ...basePlannerKey, majorName: null };
    const { status, body } = await call({ planner: keyNoMajor, minorNames: [], doubleMajorMajorName: null, outsidePlannerUnitCodes: [] });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(majorFindUnique).not.toHaveBeenCalled();
    expect(templateFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ major_id: null }),
    }));
  });

  test('a planner with a null intake month resolves', async () => {
    const keyNoMonth = { ...basePlannerKey, intakeMonth: null };
    const { status, body } = await call({ planner: keyNoMonth, minorNames: [], doubleMajorMajorName: null, outsidePlannerUnitCodes: [] });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(templateFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ intake_month: null }),
    }));
  });

  test('falls back to course name when courseCode is null', async () => {
    const keyNoCode = { ...basePlannerKey, courseCode: null };
    await call({ planner: keyNoCode, minorNames: [], doubleMajorMajorName: null, outsidePlannerUnitCodes: [] });
    expect(courseFindUnique).not.toHaveBeenCalled();
    expect(courseFindFirst).toHaveBeenCalledWith({ where: { name: basePlannerKey.courseName } });
  });

  test('malformed bodies are rejected with 400, not a crash', async () => {
    let r = await call(null);
    expect(r.status).toBe(400);
    r = await call({});
    expect(r.status).toBe(400);
    r = await call({ planner: { courseName: 'X' } }); // missing intakeYear
    expect(r.status).toBe(400);
    r = await call({ planner: { ...basePlannerKey, intakeYear: 'not a number' } });
    expect(r.status).toBe(400);
  });

  test('resolves minor names to ids on the matched planner, reporting unmatched names', async () => {
    const { body } = await call({
      planner: basePlannerKey,
      minorNames: ['Data Science Minor', 'A Minor That Does Not Exist'],
      doubleMajorMajorName: null,
      outsidePlannerUnitCodes: [],
    });
    expect(body.minorIds).toEqual(['minor-uuid-1']);
    expect(body.unmatchedMinorNames).toEqual(['A Minor That Does Not Exist']);
  });

  test('resolves the double major name to a sibling planner id', async () => {
    templateFindFirst.mockResolvedValue({ id: 'sibling-planner-uuid' } as never);
    const { body } = await call({
      planner: basePlannerKey,
      minorNames: [],
      doubleMajorMajorName: 'Software Development',
      outsidePlannerUnitCodes: [],
    });
    expect(body.doubleMajorPlannerId).toBe('sibling-planner-uuid');
    expect(body.doubleMajorUnmatched).toBe(false);
    expect(templateFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ major: { name: 'Software Development' } }),
    }));
  });

  test('reports an unmatched double major rather than failing the whole resolve', async () => {
    // First findFirst call resolves the main planner; the second (the sibling
    // lookup for the double major) finds nothing.
    templateFindFirst.mockResolvedValueOnce({ id: 'planner-uuid-1' } as never);
    templateFindFirst.mockResolvedValueOnce(null as never);
    const { body } = await call({
      planner: basePlannerKey, minorNames: [], doubleMajorMajorName: 'Nonexistent Major', outsidePlannerUnitCodes: [],
    });
    expect(body.success).toBe(true);
    expect(body.doubleMajorPlannerId).toBeNull();
    expect(body.doubleMajorUnmatched).toBe(true);
  });

  test('resolves outside-planner unit codes against the database, never trusting the file', async () => {
    unitFindMany.mockResolvedValue([
      { unit_code: 'OUT1', unit_name: 'Outside Unit', offerings: [{ offered_in: 1 }], requisite_groups: [] },
    ] as never);
    const { body } = await call({
      planner: basePlannerKey, minorNames: [], doubleMajorMajorName: null, outsidePlannerUnitCodes: ['OUT1', 'GHOST1'],
    });
    expect(body.outsidePlannerUnits).toEqual([
      expect.objectContaining({ code: 'OUT1', category: 'elective' }),
    ]);
    expect(body.unresolvedOutsidePlannerUnitCodes).toEqual(['GHOST1']);
  });
});
