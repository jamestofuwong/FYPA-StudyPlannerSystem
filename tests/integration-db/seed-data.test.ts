/**
 * The seed data that every new install starts with (runtime/postgres/scripts/seed/*.sql), loaded into a real database
 * and checked against the rules that the matching, graduation and pathway code depend on.
 *
 * A seed file is plain SQL that nobody reads twice. A typo in a unit code, a unit with no offering term, or a loop in the
 * prerequisites does not fail at start-up. It fails later, in front of an advisor. These tests fail first.
 */
import { loadSeeds, resetDb, withClient } from './helpers';

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  withClient(async (c) => (await c.query(sql, params)).rows as T[]);

beforeAll(async () => {
  await resetDb();
  await withClient(loadSeeds);
});

// Known issues in the data. Each entry has a reason. Remove an entry when the data is fixed. A NEW entry is a real problem.
const KNOWN = {
  // 01_units.sql keeps the code of an old planner on purpose ("-- old planner")
  legacyUnitCodes: ['ICT20016*Optional'],
  // (none left) A planner whose recorded major unit count differs from the units that it lists.
  majorCountMismatch: [] as string[],
};

describe('seed files', () => {
  test('all five load into an empty database, in order', async () => {
    const files = await withClient(async (c) => { await resetDb(); return loadSeeds(c); });
    expect(files).toEqual(['01_units.sql', '02_prerequisites.sql', '03_couses_majors.sql', '04_planner_templates.sql', '05_elective_groups.sql']);
  });

  test('loading them reaches a usable catalogue', async () => {
    const [n] = await q<{ courses: string; majors: string; planners: string; units: string }>(
      `select (select count(*) from courses) courses, (select count(*) from majors) majors,
              (select count(*) from planner_templates) planners, (select count(*) from units) units`);
    expect(Number(n.courses)).toBeGreaterThanOrEqual(1);
    expect(Number(n.majors)).toBeGreaterThanOrEqual(2);
    expect(Number(n.planners)).toBeGreaterThanOrEqual(Number(n.majors));
    expect(Number(n.units)).toBeGreaterThan(30);
  });
});

describe('units', () => {
  test('every unit code has the form AAA1234 or AAA12345', async () => {
    const rows = await q<{ unit_code: string }>(`select unit_code from units where unit_code !~ '^[A-Z]{3}[0-9]{4,5}$'`);
    expect(rows.map((r) => r.unit_code).sort()).toEqual([...KNOWN.legacyUnitCodes].sort());
  });

  test('every unit that a planner places (except MPU) runs in at least one term, so the scheduler can place it', async () => {
    const rows = await q<{ unit_code: string }>(
      `select distinct u.unit_code from units u join template_units t on t.unit_id = u.id
        where u.unit_code not like 'MPU%' and not exists (select 1 from unit_offerings o where o.unit_id = u.id) order by 1`);
    expect(rows.map((r) => r.unit_code)).toEqual([]);
  });

  test('offering terms are 1 to 4', async () => {
    const [r] = await q<{ lo: number; hi: number }>(`select min(offered_in) lo, max(offered_in) hi from unit_offerings`);
    expect([r.lo, r.hi]).toEqual([1, 4]);
  });
});

describe('prerequisites', () => {
  test('a unit condition always points at a unit', async () => {
    const [r] = await q<{ n: string }>(`select count(*) n from unit_requisite_conditions where type = 'unit' and unit_id is null`);
    expect(Number(r.n)).toBe(0);
  });

  test('a credit-point condition always has a credit value', async () => {
    const [r] = await q<{ n: string }>(`select count(*) n from unit_requisite_conditions where type = 'credit_points' and (credit_points is null or credit_points <= 0)`);
    expect(Number(r.n)).toBe(0);
  });

  test('no unit is its own prerequisite', async () => {
    const [r] = await q<{ n: string }>(
      `select count(*) n from unit_requisite_conditions c join unit_requisite_groups g on g.id = c.group_id where c.unit_id = g.unit_id`);
    expect(Number(r.n)).toBe(0);
  });

  test('the prerequisite chain has no loop (a loop would make a unit impossible to take)', async () => {
    const [r] = await q<{ n: string }>(
      `with recursive r(unit_id, req_id, path, cyc) as (
         select g.unit_id, c.unit_id, array[g.unit_id], false
           from unit_requisite_groups g join unit_requisite_conditions c on c.group_id = g.id
          where c.unit_id is not null and c.requisite_type = 'prerequisite'
         union all
         select r.unit_id, c.unit_id, r.path || g.unit_id, c.unit_id = any (r.path || g.unit_id)
           from r join unit_requisite_groups g on g.unit_id = r.req_id join unit_requisite_conditions c on c.group_id = g.id
          where c.unit_id is not null and c.requisite_type = 'prerequisite' and not r.cyc)
       select count(*) n from r where cyc`);
    expect(Number(r.n)).toBe(0);
  });

  test('only the four known requisite kinds are used', async () => {
    const rows = await q<{ k: string }>(`select distinct coalesce(requisite_type, type) k from unit_requisite_conditions order by 1`);
    expect(rows.map((r) => r.k)).toEqual(['antirequisite', 'corequisite', 'credit_points', 'prerequisite']);
  });
});

describe('planners', () => {
  test('every intake month is 1 to 12 and every intake year is plausible', async () => {
    const [r] = await q<{ n: string }>(`select count(*) n from planner_templates where intake_month is null or intake_month not between 1 and 12 or intake_year not between 2000 and 2100`);
    expect(Number(r.n)).toBe(0);
  });

  test('no planner is empty', async () => {
    const [r] = await q<{ n: string }>(`select count(*) n from planner_templates p where not exists (select 1 from template_units t where t.planner_template_id = p.id)`);
    expect(Number(r.n)).toBe(0);
  });

  test('every planner with a major lists major core units, and every planner lists core units', async () => {
    const noMajor = await q(`select p.id from planner_templates p where p.major_id is not null and not exists (select 1 from template_units t where t.planner_template_id = p.id and t.category = 'major_core')`);
    const noCore = await q(`select p.id from planner_templates p where not exists (select 1 from template_units t where t.planner_template_id = p.id and t.category = 'core')`);
    expect([noMajor.length, noCore.length]).toEqual([0, 0]);
  });

  test('year levels are 1 to 3; only MPU and the work placement use a break (semester 3 or 4)', async () => {
    const rows = await q<{ category: string; lo: number; hi: number }>(`select category, min(semester) lo, max(semester) hi from template_units group by category`);
    const byCat = Object.fromEntries(rows.map((r) => [r.category, [r.lo, r.hi]]));
    for (const cat of ['core', 'major_core', 'prescribed_elective', 'elective']) expect(byCat[cat]).toEqual([1, 2]);
    expect(byCat.wil[0]).toBeGreaterThanOrEqual(3);
    const [y] = await q<{ lo: number; hi: number }>(`select min(year_level) lo, max(year_level) hi from template_units`);
    expect([y.lo, y.hi]).toEqual([1, 3]);
  });

  test('the declared core count equals the core units that the planner lists', async () => {
    const rows = await q(`select p.id from planner_templates p where p.core_count is not null and p.core_count <> (select count(*) from template_units t where t.planner_template_id = p.id and t.category = 'core')`);
    expect(rows).toEqual([]);
  });

  test('the declared major count equals the major core units that the planner lists (known exceptions only)', async () => {
    const rows = await q<{ name: string; intake_year: number; intake_month: number }>(
      `select m.name, p.intake_year, p.intake_month from planner_templates p join majors m on m.id = p.major_id
        where p.major_count is not null and p.major_count <> (select count(*) from template_units t where t.planner_template_id = p.id and t.category = 'major_core')`);
    expect(rows.map((r) => `${r.name} ${r.intake_year}-${r.intake_month}`)).toEqual(KNOWN.majorCountMismatch);
  });

  test('each major has a planner for every intake that the others have', async () => {
    const rows = await q<{ intake: string; majors: string }>(`select intake_year || '-' || intake_month intake, count(distinct major_id) majors from planner_templates group by 1`);
    const [{ n }] = await q<{ n: string }>(`select count(*) n from majors`);
    expect(rows.filter((r) => Number(r.majors) !== Number(n)).map((r) => r.intake)).toEqual([]);
  });

  test('every elective group has at least one unit', async () => {
    const [r] = await q<{ n: string }>(`select count(*) n from elective_groups g where not exists (select 1 from elective_group_units u where u.elective_group_id = g.id)`);
    expect(Number(r.n)).toBe(0);
  });
});
