import { NextRequest } from 'next/server';
import { POST } from '@/app/api/custom-planner/route';
import { prisma } from '@core/db/client';

jest.mock('@core/db/client', () => ({
  prisma: {
    plannerTemplate: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

const findUnique = jest.mocked(prisma.plannerTemplate.findUnique);
const findMany = jest.mocked(prisma.plannerTemplate.findMany);

const unitRow = (unit_code: string, unit_name: string, terms: number[] = [1, 2]) => ({
  id: unit_code,
  unit_code,
  unit_name,
  offerings: terms.map((offered_in) => ({ offered_in })),
  requisite_groups: [],
});

const PLANNER = {
  id: 'p1',
  intake_month: 3,
  intake_year: 2024,
  course_id: 'c1',
  major_id: 'm1',
  core_cp: 25, core_count: 2,
  major_cp: null, major_count: null,
  elective_cp: 25, elective_count: 2,
  wil_cp: null, wil_count: null,
  units: [
    { category: 'core', year_level: 1, semester: 1, unit: unitRow('CORE1', 'Core One') },
  ],
  minors: [],
  elective_groups: [
    {
      created_at: new Date('2024-01-01'),
      units: [
        { unit: unitRow('EL1', 'Elective One') },
        { unit: unitRow('WIN1', 'Winter Elective', [4]) },
      ],
    },
    {
      created_at: new Date('2024-01-02'),
      // Listed by two groups, and offered once
      units: [{ unit: unitRow('EL1', 'Elective One') }, { unit: unitRow('EL2', 'Elective Two') }],
    },
  ],
};

const call = async (body: object = {}) => {
  const response = await POST(new NextRequest('http://localhost/api/custom-planner', {
    method: 'POST',
    body: JSON.stringify({
      plannerId: 'p1',
      completedUnitCodes: [],
      startYear: 1,
      startSemester: 1,
      ...body,
    }),
  }));
  return { status: response.status, body: await response.json() };
};

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(PLANNER as never);
  findMany.mockResolvedValue([] as never);
});

describe('POST /api/custom-planner: elective candidates', () => {
  test('returns the planner\'s elective-group units, each once', async () => {
    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.electiveCandidates.map((u: any) => u.code).sort()).toEqual(['EL1', 'EL2', 'WIN1']);
  });

  test('maps them like every other unit, keeping allOfferingTerms so a winter-only unit is recognisable', async () => {
    const { body } = await call();

    const winter = body.electiveCandidates.find((u: any) => u.code === 'WIN1');
    expect(winter.offeringSemesters).toEqual([]);
    expect(winter.allOfferingTerms).toEqual([4]);
    expect(winter.category).toBe('elective');
    expect(winter.requisiteGroups).toEqual([]);
  });

  test('a planner with no elective groups returns an empty list', async () => {
    findUnique.mockResolvedValue({ ...PLANNER, elective_groups: [] } as never);

    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.electiveCandidates).toEqual([]);
  });

  test('the candidates are separate from the plan pool', async () => {
    const { body } = await call();

    // Recommendations fill slots from these, but the list itself is not the pool
    const pooled = body.units.filter((u: any) => !u.recommended).map((u: any) => u.code);
    expect(pooled).toEqual(['CORE1']);
    expect(body.electiveCandidates.length).toBeGreaterThan(0);
  });
});
