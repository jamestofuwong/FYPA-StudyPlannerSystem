/**
 * The migrations, applied to an empty PostgreSQL by the same Prisma command the app runs at start-up.
 * These tests protect users who upgrade in place: the schema the code expects must be the schema the migrations build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Prisma } from '@local/prisma-client';
import { prisma } from '@core/db/client';
import { desktopUrl, loadSeeds, resetDb, withClient } from './helpers';

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = path.join(ROOT, 'core/db/prisma/schema/base.prisma');
const MIGRATIONS = path.join(ROOT, 'core/db/prisma/schema/migrations');

beforeEach(resetDb);

describe('migrations on an empty database', () => {
  // The migrations are written by hand, so the schema file and the database can drift. Querying every model checks that
  // each table and column that the generated client selects really exists.
  test('every model of the Prisma client can be queried', async () => {
    const lowerFirst = (n: string) => n[0].toLowerCase() + n.slice(1);
    const broken: string[] = [];
    for (const model of Object.keys(Prisma.ModelName)) {
      try { await (prisma as any)[lowerFirst(model)].findFirst(); } catch { broken.push(model); }
    }
    expect(broken).toEqual([]);
  });

  // `prisma migrate dev` writes any difference between the schema and the migrations into the next migration. When the two
  // disagree, it drops indexes and foreign keys that the app relies on. This test keeps them in agreement: if you change
  // base.prisma, add the migration for it. If you add a migration, change base.prisma to match.
  test('base.prisma describes exactly what the migrations build (no drift)', async () => {
    const shadow = `drift_shadow_${Date.now()}`;
    await withClient((c) => c.query(`create database ${shadow}`));
    try {
      const out = execFileSync(process.execPath, [
        path.join(ROOT, 'node_modules/prisma/build/index.js'), 'migrate', 'diff',
        '--from-migrations', MIGRATIONS, '--to-schema-datamodel', SCHEMA,
        '--shadow-database-url', desktopUrl().replace(/\/[^/]+$/, `/${shadow}`), '--script',
      ], { cwd: path.join(ROOT, 'core/db'), env: { ...process.env, DATABASE_URL: desktopUrl() }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      expect(out.trim()).toMatch(/^-- This is an empty migration\.$/);
    } finally {
      await withClient((c) => c.query(`drop database if exists ${shadow} with (force)`));
    }
  });

  test('every migration folder is recorded as finished', async () => {
    const folders = fs.readdirSync(MIGRATIONS).filter((f) => fs.statSync(path.join(MIGRATIONS, f)).isDirectory());
    const rows = await withClient(async (c) =>
      (await c.query(`select migration_name, finished_at, rolled_back_at from _prisma_migrations order by migration_name`)).rows);
    expect(rows.map((r) => r.migration_name)).toEqual(folders.sort());
    expect(rows.every((r) => r.finished_at && !r.rolled_back_at)).toBe(true);
  });

  test('running the migrations again changes nothing (the app runs them at every start)', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', `--schema=${SCHEMA}`], {
      cwd: path.join(ROOT, 'core/db'), env: { ...process.env, DATABASE_URL: desktopUrl() },
    }).toString();
    expect(out).toMatch(/No pending migrations/i);
  });
});

describe('the data fix migration (20261026000000)', () => {
  const SQL = fs.readFileSync(path.join(MIGRATIONS, '20261026000000_fix_seed_data_and_strict_loader', 'migration.sql'), 'utf8');
  const q = (text: string, params: unknown[] = []) => withClient(async (c) => (await c.query(text, params)).rows);
  // the requisite groups of a unit, each as its list of unit codes (a unit is allowed when any group is met)
  const groups = async (code: string) => (await q(
    `select array_agg(r.unit_code order by r.unit_code) codes from unit_requisite_groups g join units t on t.id = g.unit_id
       join unit_requisite_conditions c on c.group_id = g.id join units r on r.id = c.unit_id
      where t.unit_code = $1 group by g.id`, [code])).map((r) => (r.codes as string[]).join('+')).sort();
  const iotMajorUnits = async () => (await q(`select count(*)::int n from template_units tu join planner_templates pt on pt.id = tu.planner_template_id
                                   join majors m on m.id = pt.major_id where m.name = 'Internet of Things' and pt.intake_year = 2024 and pt.intake_month = 9 and tu.category = 'major_core'`))[0].n as number;

  test('a fresh install has a requisite group for each web unit', async () => {
    await withClient(loadSeeds);
    expect(await groups('SWE30011')).toEqual(['COS10011+COS20007', 'COS10026+COS20007']);
    expect(await groups('COS30015')).toEqual(['COS10009+COS10011+TNE10006', 'COS10009+COS10026+TNE10006']);
  });

  test('repairs an install that has the old data, and does nothing to one that is already right', async () => {
    await withClient(loadSeeds);
    // put the data back as the old seed had it: SWE30011 with COS10011 only, COS30015 with COS10026 only, COS30049 missing
    await q(`delete from unit_requisite_groups g using units t, unit_requisite_conditions c, units r
              where g.unit_id = t.id and c.group_id = g.id and r.id = c.unit_id
                and ((t.unit_code = 'SWE30011' and r.unit_code = 'COS10026') or (t.unit_code = 'COS30015' and r.unit_code = 'COS10011'))`);
    await q(`delete from template_units where unit_id = (select id from units where unit_code = 'COS30049')
                and planner_template_id in (select pt.id from planner_templates pt join majors m on m.id = pt.major_id
                                              where m.name = 'Internet of Things' and pt.intake_year = 2024 and pt.intake_month = 9)`);
    expect(await groups('SWE30011')).toEqual(['COS10011+COS20007']);
    expect(await groups('COS30015')).toEqual(['COS10009+COS10026+TNE10006']);
    const before = await iotMajorUnits();

    await withClient((c) => c.query(SQL));
    expect(await groups('SWE30011')).toEqual(['COS10011+COS20007', 'COS10026+COS20007']);
    expect(await groups('COS30015')).toEqual(['COS10009+COS10011+TNE10006', 'COS10009+COS10026+TNE10006']);
    expect(await iotMajorUnits()).toBe(before + 1);

    await withClient((c) => c.query(SQL));                                  // again: no change
    expect(await groups('SWE30011')).toHaveLength(2);
    expect(await groups('COS30015')).toHaveLength(2);
    expect(await iotMajorUnits()).toBe(before + 1);
  });

  test('the seed loader stops on a unit code that matches no unit, instead of leaving it out', async () => {
    await withClient(loadSeeds);
    const [planner] = await q(`select id from planner_templates limit 1`);
    await expect(q(`select add_template_units($1::uuid, ARRAY['COS30049 ', 'core', '1', '1']::varchar[])`, [planner.id])).rejects.toThrow(/no unit has the code/);
    await expect(q(`select add_template_units($1::uuid, ARRAY['NOSUCH999', 'core', '1', '1']::varchar[])`, [planner.id])).rejects.toThrow(/NOSUCH999/);
  });
});

describe('constraints that the code relies on', () => {
  const sql = (q: string, p: unknown[] = []) => withClient((c) => c.query(q, p));
  const uuid = '00000000-0000-0000-0000-00000000000';

  test('a unit code is unique', async () => {
    await sql(`insert into units (unit_code, unit_name) values ('COS10009', 'Programming')`);
    await expect(sql(`insert into units (unit_code, unit_name) values ('COS10009', 'Again')`)).rejects.toThrow(/duplicate key/);
  });

  test('a planner is unique per course, major, intake year and month', async () => {
    const { rows: [course] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    const { rows: [major] } = await sql(`insert into majors (course_id, name) values ($1, 'Data Science') returning id`, [course.id]);
    const insert = () => sql(`insert into planner_templates (course_id, major_id, intake_year, intake_month) values ($1, $2, 2026, 3)`, [course.id, major.id]);
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/);
  });

  // PostgreSQL treats two NULLs as different, so the unique index does not stop a second planner with no major.
  // The repository checks this case itself (see repositories.test.ts). This test pins the reason that check must stay.
  test('the unique index alone does not stop two planners with no major', async () => {
    const { rows: [course] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    const insert = () => sql(`insert into planner_templates (course_id, intake_year, intake_month) values ($1, 2026, 3)`, [course.id]);
    await insert();
    await expect(insert()).resolves.toBeDefined();
  });

  test('a planner cannot use a major that belongs to another course', async () => {
    const { rows: [a] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    const { rows: [b] } = await sql(`insert into courses (name) values ('BIT') returning id`);
    const { rows: [major] } = await sql(`insert into majors (course_id, name) values ($1, 'Data Science') returning id`, [b.id]);
    await expect(sql(`insert into planner_templates (course_id, major_id, intake_year, intake_month) values ($1, $2, 2026, 3)`, [a.id, major.id]))
      .rejects.toThrow(/does not belong to course/);
  });

  test('a course that still has majors cannot be deleted', async () => {
    const { rows: [course] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    await sql(`insert into majors (course_id, name) values ($1, 'Data Science')`, [course.id]);
    await expect(sql(`delete from courses where id = $1`, [course.id])).rejects.toThrow(/foreign key/);
  });

  test('deleting a planner deletes its template units but not the units', async () => {
    const { rows: [course] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    const { rows: [unit] } = await sql(`insert into units (unit_code, unit_name) values ('COS10009', 'P') returning id`);
    const { rows: [planner] } = await sql(`insert into planner_templates (course_id, intake_year, intake_month) values ($1, 2026, 3) returning id`, [course.id]);
    await sql(`insert into template_units (planner_template_id, unit_id, category, year_level, semester) values ($1, $2, 'core', 1, 1)`, [planner.id, unit.id]);

    await sql(`delete from planner_templates where id = $1`, [planner.id]);

    expect((await sql(`select count(*)::int n from template_units`)).rows[0].n).toBe(0);
    expect((await sql(`select count(*)::int n from units`)).rows[0].n).toBe(1);
  });

  test('a unit that a planner uses cannot be deleted', async () => {
    const { rows: [course] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    const { rows: [unit] } = await sql(`insert into units (unit_code, unit_name) values ('COS10009', 'P') returning id`);
    const { rows: [planner] } = await sql(`insert into planner_templates (course_id, intake_year, intake_month) values ($1, 2026, 3) returning id`, [course.id]);
    await sql(`insert into template_units (planner_template_id, unit_id, category, year_level, semester) values ($1, $2, 'core', 1, 1)`, [planner.id, unit.id]);
    await expect(sql(`delete from units where id = $1`, [unit.id])).rejects.toThrow(/foreign key/);
  });

  test('a unit appears at most once in one planner', async () => {
    const { rows: [course] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    const { rows: [unit] } = await sql(`insert into units (unit_code, unit_name) values ('COS10009', 'P') returning id`);
    const { rows: [planner] } = await sql(`insert into planner_templates (course_id, intake_year, intake_month) values ($1, 2026, 3) returning id`, [course.id]);
    const add = () => sql(`insert into template_units (planner_template_id, unit_id, category, year_level, semester) values ($1, $2, 'core', 1, 1)`, [planner.id, unit.id]);
    await add();
    await expect(add()).rejects.toThrow(/duplicate key/);
  });

  test('the unit category only accepts the six known values', async () => {
    const { rows: [course] } = await sql(`insert into courses (name) values ('BCS') returning id`);
    const { rows: [planner] } = await sql(`insert into planner_templates (course_id, intake_year, intake_month) values ($1, 2026, 3) returning id`, [course.id]);
    await expect(sql(`insert into template_units (planner_template_id, category, year_level, semester) values ($1, 'bonus', 1, 1)`, [planner.id])).rejects.toThrow(/invalid input value for enum/);
    await expect(sql(`insert into template_units (planner_template_id, category, year_level, semester) values ($1, 'elective', 1, 1)`, [planner.id])).resolves.toBeDefined();
  });
});
