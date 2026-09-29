import { NextRequest } from 'next/server';
import { GET } from '@/app/api/custom-planner/catalogue/route';
import { prisma } from '@core/db/client';

jest.mock('@core/db/client', () => ({
  prisma: {
    unit: { findMany: jest.fn() },
    plannerTemplate: { findUnique: jest.fn() },
  },
}));

const unitFindMany = jest.mocked(prisma.unit.findMany);
const plannerFindUnique = jest.mocked(prisma.plannerTemplate.findUnique);

const row = (unit_code: string, unit_name: string, terms: number[] = [1, 2], requisite_groups: any[] = []) => ({
  unit_code,
  unit_name,
  offerings: terms.map((offered_in) => ({ offered_in })),
  requisite_groups,
});

const CATALOGUE = [
  row('COS10009', 'Introduction to Programming'),
  row('COS30015', 'IT Security', [1], [
    { conditions: [{ type: 'unit', requisite_type: 'prerequisite', credit_points: null, unit: { unit_code: 'COS10009' } }] },
  ]),
  row('SWE20004', 'Technical Software Development'),
  row('SWE30009', 'Software Testing', [2]),
  // Offered in winter alone, so it must keep allOfferingTerms to stay recognisable
  row('ICT20016', 'Professional Experience', [4]),
  // Never offered: the catalogue drops every MPU unit
  row('MPU3212', 'Bahasa Kebangsaan A', [4]),
];

const call = async (query = '') => {
  const response = await GET(new NextRequest(`http://localhost/api/custom-planner/catalogue${query}`));
  return { status: response.status, body: await response.json() };
};

beforeEach(() => {
  jest.clearAllMocks();
  unitFindMany.mockResolvedValue(CATALOGUE as never);
  plannerFindUnique.mockResolvedValue(null as never);
});

describe('GET /api/custom-planner/catalogue', () => {
  test('maps units the same way the planner pool does, keeping allOfferingTerms', async () => {
    const { status, body } = await call();

    expect(status).toBe(200);
    const winterOnly = body.units.find((u: any) => u.code === 'ICT20016');
    expect(winterOnly.allOfferingTerms).toEqual([4]);
    expect(winterOnly.offeringSemesters).toEqual([]);

    const secure = body.units.find((u: any) => u.code === 'COS30015');
    expect(secure.offeringSemesters).toEqual([1]);
    expect(secure.requisiteGroups).toEqual([
      [{ type: 'unit', requisiteType: 'prerequisite', unitCode: 'COS10009' }],
    ]);
  });

  test('records every unit as an elective, added from outside the planner', async () => {
    const { body } = await call();

    expect(body.units.every((u: any) => u.category === 'elective')).toBe(true);
    expect(body.units.every((u: any) => u.outsidePlanner === true)).toBe(true);
  });

  test('excludes units the planner already names', async () => {
    plannerFindUnique.mockResolvedValue({
      units: [
        { unit: { unit_code: 'COS10009' } },
        { unit: { unit_code: 'SWE30009' } },
        // An empty elective slot names no unit and excludes nothing
        { unit: null },
      ],
    } as never);

    const { body } = await call('?plannerId=p1');

    expect(body.units.map((u: any) => u.code)).toEqual(['COS30015', 'SWE20004', 'ICT20016']);
  });

  test('excludes completed units, matching on code case and spacing', async () => {
    const { body } = await call('?completed=' + encodeURIComponent(' cos10009 ,SWE20004'));

    expect(body.units.map((u: any) => u.code)).toEqual(['COS30015', 'SWE30009', 'ICT20016']);
  });

  test('reports the prefixes present so the page can offer them as a filter', async () => {
    const { body } = await call();

    expect(body.prefixes).toEqual(['COS', 'ICT', 'SWE']);
  });

  // MPU units belong in the Remaining MPU Units table, never in a semester
  test('offers no MPU unit, and does not list MPU as a prefix', async () => {
    const { body } = await call();

    expect(body.units.map((u: any) => u.code)).not.toContain('MPU3212');
    expect(body.units.some((u: any) => u.code.startsWith('MPU'))).toBe(false);
    expect(body.units.some((u: any) => u.prefix === 'MPU')).toBe(false);
    expect(body.prefixes).not.toContain('MPU');
  });

  test('filtering by the SWE prefix leaves only Software Engineering units', async () => {
    const { body } = await call();

    const swe = body.units.filter((u: any) => u.prefix === 'SWE');
    expect(swe.map((u: any) => u.code)).toEqual(['SWE20004', 'SWE30009']);
    expect(swe.every((u: any) => u.code.startsWith('SWE'))).toBe(true);
  });

  test('a missing planner is a 404 rather than a silently unfiltered catalogue', async () => {
    const { status, body } = await call('?plannerId=nope');

    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Planner not found' });
  });

  test('maps a database failure to a stable public response', async () => {
    unitFindMany.mockRejectedValueOnce(new Error('DB down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { status, body } = await call();

    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Failed to load the unit catalogue' });
  });
});