/**
 * The repositories against a real PostgreSQL. The mocked API tests cannot tell whether a query is right, whether a
 * transaction rolls back, or whether a constraint holds. These tests can.
 */
import { prisma } from '@core/db/client';
import * as courseRepo from '@core/db/repositories/courseRepository';
import * as majorRepo from '@core/db/repositories/majorRepository';
import * as unitRepo from '@core/db/repositories/unitRepository';
import * as plannerRepo from '@core/db/repositories/plannerRepository';
import type { PlannerImportPlanner, PlannerImportUnit } from '@core/shared/types/plannerImport';
import { resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const unit = (code: string, name: string, year: number | null, sem: number | null, extra: Partial<PlannerImportUnit> = {}): PlannerImportUnit =>
  ({ unit_code: code, unit_name: name, year_level: year, semester: sem, category: null, prerequisite: null, ...extra });

function importOf(over: { major?: string; year?: number; intake?: string; course?: string; names?: Record<string, string> } = {}): PlannerImportPlanner {
  const n = (code: string, fallback: string) => over.names?.[code] ?? fallback;
  return {
    file_name: 'planner.pdf',
    course_information: {
      course: over.course ?? 'Bachelor of Computer Science', major: over.major ?? 'Data Science',
      intake: over.intake ?? 'March', intake_year: over.year ?? 2026,
      requirements: { core: { count: 2, cp: 25 }, major: { count: 1, cp: 12.5 } as never, elective: { count: 2, cp: 25 }, wil: { count: 1, cp: 25 } },
    },
    categories: {
      core_units: [unit('COS10009', n('COS10009', 'Introduction to Programming'), 1, 1), unit('COS10026', 'Computing Technology Inquiry Project', 1, 2)],
      major_units: [unit('COS20031', 'Database Design Project', 2, 1, { prerequisite: 'COS10009' })],
      mpu_group: [unit('MPU3142', 'Malay Language Communication 2', 1, 2)],
      wil_group: [unit('ICT20016', 'Work-Integrated Learning', 2, 3)],
      elective_groups: {
        prescribed_elective: [unit('COS30045', 'Data Visualisation', 3, 2)],
        elective: [unit('COS30043', 'Interface Design', null, null), unit('-', 'Elective', 3, 1)],
      },
      minor_groups: [{ minor_name: 'Artificial Intelligence', units: [unit('COS10009', 'Introduction to Programming', null, null)] }],
    },
  };
}
const count = async (table: string) => Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) n from ${table}`))[0].n);

describe('course and major repositories', () => {
  test('a major belongs to its course and is listed under it', async () => {
    const course = await courseRepo.createCourse({ name: 'Bachelor of Computer Science', code: 'BCS' });
    const ds = await majorRepo.createMajor({ name: 'Data Science', course_id: course.id });
    await majorRepo.createMajor({ name: 'Cybersecurity', course_id: course.id });
    expect((await majorRepo.getMajorsByCourseId(course.id)).map((m) => m.name).sort()).toEqual(['Cybersecurity', 'Data Science']);
    expect((await majorRepo.getMajorById(ds.id))?.course_id).toBe(course.id);
  });

  test('a course code is unique', async () => {
    await courseRepo.createCourse({ name: 'A', code: 'BCS' });
    await expect(courseRepo.createCourse({ name: 'B', code: 'BCS' })).rejects.toThrow(/Unique constraint/);
  });

  test('the same major name is allowed in two different courses, and refused twice in one course', async () => {
    const a = await courseRepo.createCourse({ name: 'A' });
    const b = await courseRepo.createCourse({ name: 'B' });
    await majorRepo.createMajor({ name: 'Software', course_id: a.id });
    await expect(majorRepo.createMajor({ name: 'Software', course_id: b.id })).resolves.toBeDefined();
    await expect(majorRepo.createMajor({ name: 'Software', course_id: a.id })).rejects.toThrow(/Unique constraint/);
  });
});

describe('unit repository', () => {
  test('upsertUnits creates units once and renames them on a second call', async () => {
    await unitRepo.upsertUnits([{ unit_code: 'COS10009', unit_name: 'Programming' }, { unit_code: 'COS10026', unit_name: 'Inquiry' }]);
    await unitRepo.upsertUnits([{ unit_code: 'COS10009', unit_name: 'Introduction to Programming' }]);
    expect(await count('units')).toBe(2);
    expect((await prisma.unit.findUnique({ where: { unit_code: 'COS10009' } }))?.unit_name).toBe('Introduction to Programming');
  });

  test('checkUnitsExist returns only the codes that exist', async () => {
    await unitRepo.upsertUnits([{ unit_code: 'COS10009', unit_name: 'P' }]);
    expect(await unitRepo.checkUnitsExist(['COS10009', 'ZZZ99999'])).toEqual(['COS10009']);
    expect(await unitRepo.checkUnitsExist([])).toEqual([]);
  });

  test('an offering can be added twice without a duplicate, and removed', async () => {
    const [u] = await unitRepo.upsertUnits([{ unit_code: 'COS10009', unit_name: 'P' }]);
    await unitRepo.addUnitOffering(u.id, 1);
    await unitRepo.addUnitOffering(u.id, 1);
    await unitRepo.addUnitOffering(u.id, 2);
    expect((await unitRepo.getUnitById(u.id))?.offerings.map((o) => o.offered_in).sort()).toEqual([1, 2]);
    await unitRepo.removeUnitOffering(u.id, 1);
    expect((await unitRepo.getUnitById(u.id))?.offerings.map((o) => o.offered_in)).toEqual([2]);
  });

  test('deleting a unit removes its offerings', async () => {
    const [u] = await unitRepo.upsertUnits([{ unit_code: 'COS10009', unit_name: 'P' }]);
    await unitRepo.addUnitOffering(u.id, 1);
    await unitRepo.deleteUnit(u.id);
    expect(await count('unit_offerings')).toBe(0);
  });
});

describe('savePlannerFromImport', () => {
  test('saves the course, major, planner, units and placements of an import', async () => {
    const saved = await plannerRepo.savePlannerFromImport(importOf());
    expect(await count('courses')).toBe(1);
    expect(await count('majors')).toBe(1);
    expect(await count('planner_templates')).toBe(1);

    const planner = await plannerRepo.getPlannerById(saved.id);
    expect(planner?.course.name).toBe('Bachelor of Computer Science');
    expect(planner?.major?.name).toBe('Data Science');
    expect(planner?.intake_year).toBe(2026);
    expect(planner?.intake_month).toBe(3);                 // "March" is read as month 3
    expect(planner?.core_cp).toBe(25);

    const byCode = Object.fromEntries((planner?.units ?? []).filter((t) => t.unit).map((t) => [t.unit!.unit_code, t]));
    expect(Object.keys(byCode).sort()).toEqual(['COS10009', 'COS10026', 'COS20031', 'COS30045', 'ICT20016', 'MPU3142']);
    expect(byCode.COS10009).toMatchObject({ category: 'core', year_level: 1, semester: 1 });
    expect(byCode.COS20031).toMatchObject({ category: 'major_core', year_level: 2, semester: 1 });
    expect(byCode.COS30045).toMatchObject({ category: 'prescribed_elective', year_level: 3, semester: 2 });
    expect(byCode.MPU3142.category).toBe('mpu');
    expect(byCode.ICT20016.category).toBe('wil');
  });

  test('an empty elective slot is kept as a row with no unit, and a pool unit goes to an elective group', async () => {
    const saved = await plannerRepo.savePlannerFromImport(importOf());
    const rows = await prisma.templateUnit.findMany({ where: { planner_template_id: saved.id, unit_id: null } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: 'elective', year_level: 3, semester: 1 });

    const groups = await prisma.electiveGroup.findMany({ where: { planner_template_id: saved.id }, include: { units: { include: { unit: true } } } });
    expect(groups.flatMap((g) => g.units.map((u) => u.unit.unit_code))).toEqual(['COS30043']);
  });

  test('a prerequisite in the import becomes a requisite condition that points at the real unit', async () => {
    await plannerRepo.savePlannerFromImport(importOf());
    const db = await prisma.unit.findUnique({ where: { unit_code: 'COS20031' }, include: { requisite_groups: { include: { conditions: { include: { unit: true } } } } } });
    expect(db?.requisite_groups).toHaveLength(1);
    expect(db?.requisite_groups[0].conditions).toHaveLength(1);
    expect(db?.requisite_groups[0].conditions[0]).toMatchObject({ type: 'unit', requisite_type: 'prerequisite' });
    expect(db?.requisite_groups[0].conditions[0].unit?.unit_code).toBe('COS10009');
  });

  test('a minor is saved with the units that exist in the planner', async () => {
    const saved = await plannerRepo.savePlannerFromImport(importOf());
    const minors = await prisma.minor.findMany({ where: { planner_template_id: saved.id }, include: { units: { include: { unit: true } } } });
    expect(minors.map((m) => m.name)).toEqual(['Artificial Intelligence']);
    expect(minors[0].units.map((u) => u.unit.unit_code)).toEqual(['COS10009']);
  });

  test('importing the same planner again is refused and changes nothing', async () => {
    await plannerRepo.savePlannerFromImport(importOf());
    const before = { planners: await count('planner_templates'), units: await count('units'), template: await count('template_units') };
    await expect(plannerRepo.savePlannerFromImport(importOf())).rejects.toThrow('DUPLICATE_PLANNER');
    expect({ planners: await count('planner_templates'), units: await count('units'), template: await count('template_units') }).toEqual(before);
  });

  // The unique index cannot catch this one, because PostgreSQL treats NULL major_id values as different (see migrations.test.ts)
  test('a planner with no major is also refused the second time', async () => {
    await plannerRepo.savePlannerFromImport(importOf({ major: '' }));
    await expect(plannerRepo.savePlannerFromImport(importOf({ major: '' }))).rejects.toThrow('DUPLICATE_PLANNER');
    expect(await count('planner_templates')).toBe(1);
  });

  test('a second intake reuses the course, the major and the units', async () => {
    await plannerRepo.savePlannerFromImport(importOf({ year: 2025 }));
    await plannerRepo.savePlannerFromImport(importOf({ year: 2026 }));
    expect(await count('courses')).toBe(1);
    expect(await count('majors')).toBe(1);
    expect(await count('planner_templates')).toBe(2);
    expect(await count('units')).toBe(7);                   // 6 placed + 1 pool unit, shared by both planners
  });

  test('the course name is matched after trimming, and a second major joins the same course', async () => {
    await plannerRepo.savePlannerFromImport(importOf({ course: '  Bachelor of Computer Science  ' }));
    await plannerRepo.savePlannerFromImport(importOf({ major: 'Cybersecurity' }));
    expect(await count('courses')).toBe(1);
    expect(await count('majors')).toBe(2);
  });

  test('a unit name is updated by a newer planner and kept by an older one', async () => {
    await plannerRepo.savePlannerFromImport(importOf({ year: 2026, names: { COS10009: 'Programming 2026' } }));
    await plannerRepo.savePlannerFromImport(importOf({ year: 2027, names: { COS10009: 'Programming 2027' } }));
    await plannerRepo.savePlannerFromImport(importOf({ year: 2025, names: { COS10009: 'Programming 2025' } }));
    expect((await prisma.unit.findUnique({ where: { unit_code: 'COS10009' } }))?.unit_name).toBe('Programming 2027');
  });

  test('an import with no course name is refused before anything is written', async () => {
    await expect(plannerRepo.savePlannerFromImport(importOf({ course: '   ' }))).rejects.toThrow(/missing course/i);
    expect(await count('courses')).toBe(0);
  });

  test('a failure in the middle of an import rolls everything back', async () => {
    const bad = importOf();
    // A unit name that is not a string makes the transaction fail after the course and planner rows were written
    (bad.categories.core_units[0] as unknown as { unit_name: unknown }).unit_name = { not: 'a string' };
    await expect(plannerRepo.savePlannerFromImport(bad)).rejects.toThrow();
    expect({ courses: await count('courses'), planners: await count('planner_templates'), units: await count('units') }).toEqual({ courses: 0, planners: 0, units: 0 });
  });

  test('deletePlanner removes the planner and its placements but keeps the units', async () => {
    const saved = await plannerRepo.savePlannerFromImport(importOf());
    await plannerRepo.deletePlanner(saved.id);
    expect(await count('planner_templates')).toBe(0);
    expect(await count('template_units')).toBe(0);
    expect(await count('units')).toBeGreaterThan(0);
  });
});
