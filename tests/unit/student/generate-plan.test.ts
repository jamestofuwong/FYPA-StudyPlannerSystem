// @ts-nocheck
// The student app has its own Prisma client, which the root tsconfig cannot
// resolve, so the root typecheck skips this file. Jest does not typecheck, and
// the student app's own build checks the code under test.

// The student Plan Builder builds its plan with the same code as the advisor's
// Student Pathway. These tests run its server entry point against a mocked
// database, to check what the shared code now does for a student.

import { generatePlanOnServer } from '@student/lib/generate-plan';
import { prisma } from '@student/lib/prisma';
import { getPlannerById } from '@student/lib/planners';

jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@student/lib/prisma', () => ({
  prisma: {
    plannerTemplate: { findUnique: jest.fn(), findFirst: jest.fn() },
    unit: { findMany: jest.fn() },
  },
}));
jest.mock('@student/lib/planners', () => ({ getPlannerById: jest.fn() }));

const findUnique = jest.mocked(prisma.plannerTemplate.findUnique);
const findFirst = jest.mocked(prisma.plannerTemplate.findFirst);
const findUnits = jest.mocked(prisma.unit.findMany);
const planner = jest.mocked(getPlannerById);

type Group = { conditions: { type: string; requisite_type: string; unit: { unit_code: string } }[] };
const needs = (...alternatives: string[]): Group[] =>
  alternatives.map((code) => ({
    conditions: [{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: code } }],
  }));

const unitRow = (unit_code: string, terms: number[] = [1, 2], requisite_groups: Group[] = []) => ({
  id: `id-${unit_code}`,
  unit_code,
  unit_name: `${unit_code} name`,
  credit_points: '12.5',
  year_level: 1,
  offerings: terms.map((offered_in) => ({ offered_in })),
  requisite_groups,
});
const slot = (category: string, unit: ReturnType<typeof unitRow> | null) => ({
  id: `slot-${unit?.unit_code ?? Math.random()}`,
  category,
  year_level: 1,
  semester: 1,
  unit,
});

const TEMPLATE = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  course_id: 'c1',
  intake_month: 3,
  elective_count: null,
  units: [
    slot('core', unitRow('CORE1')),
    slot('core', unitRow('CORE2')),
    slot('elective', null),
    slot('elective', null),
  ],
  elective_groups: [{ units: [1, 2, 3].map((n) => ({ unit_id: `e${n}`, unit: unitRow(`EL${n}`) })) }],
  ...over,
});

const generate = (config: Record<string, unknown> = {}, completed: string[][] = []) =>
  generatePlanOnServer({
    config: { plannerId: 'p1', intakeYear: 2026, intakeMonth: 3, ...config },
    completedSemesters: completed.map((unitCodes) => ({ unitCodes })),
  });

const codes = (result: Awaited<ReturnType<typeof generate>>) =>
  (result?.semesters ?? []).flatMap((s) => s.units.map((u) => u.code)).sort();

beforeEach(() => {
  jest.resetAllMocks();
  planner.mockResolvedValue({ majorName: 'Software', semesters: [], electivePool: [] } as never);
  findUnits.mockResolvedValue([] as never);
  findUnique.mockResolvedValue(TEMPLATE() as never);
  findFirst.mockResolvedValue(null as never);
});

describe('generatePlanOnServer', () => {
  test('returns null for an unknown planner', async () => {
    planner.mockResolvedValue(null);
    expect(await generate()).toBeNull();
  });

  test('fills the planner\'s empty elective slots with recommended electives', async () => {
    const result = await generate();
    expect(codes(result)).toEqual(['CORE1', 'CORE2', 'EL1', 'EL2']);
    const electives = result!.semesters.flatMap((s) => s.units).filter((u) => u.category === 'elective');
    expect(electives.map((u) => u.name)).toEqual(expect.arrayContaining(['EL1 name', 'EL2 name']));
  });

  test('a unit with alternative prerequisites is placed when one alternative is done', async () => {
    findUnique.mockResolvedValue(TEMPLATE({
      units: [slot('core', unitRow('NEEDS', [1, 2], needs('A', 'B')))],
      elective_groups: [],
    }) as never);

    const result = await generate({}, [['B']]);
    expect(codes(result)).toContain('NEEDS');
    expect(result!.warnings).toEqual([]);
  });

  test('says why a unit was left out, in the advisor\'s words', async () => {
    findUnique.mockResolvedValue(TEMPLATE({
      units: [slot('core', unitRow('CORE1')), slot('core', unitRow('WIN1', [4]))],
      elective_groups: [],
    }) as never);

    const result = await generate();
    expect(codes(result)).toEqual(['CORE1']);
    expect(result!.warnings).toContain('WIN1 is only offered in summer/winter, which this plan does not schedule');
  });

  test('MPU units are still in the plan, since this app has no separate MPU section', async () => {
    findUnique.mockResolvedValue(TEMPLATE({
      units: [slot('core', unitRow('CORE1')), slot('mpu', unitRow('MPU1'))],
      elective_groups: [],
    }) as never);

    expect(codes(await generate())).toEqual(['CORE1', 'MPU1']);
  });

  test('completed semesters are shown ahead of the generated ones', async () => {
    const result = await generate({}, [['CORE1']]);
    expect(result!.semesters[0].units.map((u) => u.code)).toEqual(['CORE1']);
    expect(result!.completedCodes.has('CORE1')).toBe(true);
    expect(codes(result)).toContain('CORE2');
  });

  describe('second major', () => {
    const secondMajor = (codesNeeded: string[]) => ({
      course_id: 'c1',
      major: { name: 'Cyber Security' },
      units: codesNeeded.map((code) => slot('major_core', unitRow(code))),
    });

    test('takes the place of elective slots instead of lengthening the plan', async () => {
      findFirst.mockResolvedValue(secondMajor(['DM1']) as never);

      const result = await generate({ secondMajorId: 'm2' });
      expect(codes(result)).toEqual(['CORE1', 'CORE2', 'DM1', 'EL1']);
      const dm = result!.semesters.flatMap((s) => s.units).find((u) => u.code === 'DM1')!;
      expect(dm.category).toBe('double_major');
      expect(dm.sourceMajorName).toBe('Cyber Security');
      expect(result!.warnings).toEqual([]);
    });

    test('is left out, with a warning, when it needs more units than there are free slots', async () => {
      findFirst.mockResolvedValue(secondMajor(['DM1', 'DM2', 'DM3']) as never);

      const result = await generate({ secondMajorId: 'm2' });
      expect(codes(result)).toEqual(['CORE1', 'CORE2', 'EL1', 'EL2']);
      expect(result!.warnings?.[0]).toMatch(/Cyber Security needs 3 more units, but only 2 elective slots are free/);
    });

    test('adds nothing when the primary major already covers it', async () => {
      findFirst.mockResolvedValue(secondMajor(['CORE1']) as never);

      const result = await generate({ secondMajorId: 'm2' });
      expect(codes(result)).toEqual(['CORE1', 'CORE2', 'EL1', 'EL2']);
      expect(result!.warnings?.[0]).toMatch(/needs no units beyond your primary major/);
    });

    test('keeps the existing warning when no planner exists for it', async () => {
      const result = await generate({ secondMajorId: 'm2' });
      expect(result!.warnings?.[0]).toMatch(/No Program Study Planner is available/);
    });
  });
});
