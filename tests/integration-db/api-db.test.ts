/**
 * API route handlers called as functions, against a real database (no mocks). The mocked route tests in tests/api check the
 * HTTP mapping. These check that the route and the database agree.
 */
import * as XLSX from 'xlsx-js-style';
import { prisma } from '@core/db/client';
import { NOTICE_VERSION } from '../../web/lib/privacyNoticeContent';
import { POST as acknowledge } from '@/app/api/privacy/acknowledge/route';
import { GET as privacyStatus } from '@/app/api/privacy/status/route';
import { GET as configGet, POST as configPost } from '@/app/api/config/route';
import { POST as savePlanner } from '@/app/api/planners/save/route';
import { GET as listPlanners } from '@/app/api/planners/route';
import { POST as unitsCheck } from '@/app/api/units/check/route';
import { POST as importExcel } from '@/app/api/import/route';
import { resetDb, withClient } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const json = (url: string, body?: unknown, method = 'POST') =>
  new Request(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const rowCount = async (table: string) => Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) n from ${table}`))[0].n);

describe('privacy notice (PDPA)', () => {
  const status = async () => (await privacyStatus()).json();

  test('a new install has not acknowledged the notice', async () => {
    expect(await status()).toEqual({ acknowledged: false, version: NOTICE_VERSION });
  });

  test('acknowledging records that the notice was shown and accepted, and writes an audit entry', async () => {
    const shown = '2026-10-01T08:00:00.000Z';
    const res = await acknowledge(json('/api/privacy/acknowledge', { presented_at: shown }) as never);
    expect(res.status).toBe(200);

    const events = await prisma.privacyEvent.findMany({ orderBy: { id: 'asc' } });
    expect(events.map((e) => [e.event_type, e.notice_version])).toEqual([['presented', NOTICE_VERSION], ['acknowledged', NOTICE_VERSION]]);
    expect(events[0].occurred_at.toISOString()).toBe(shown);          // the time that the advisor saw it, not the time of the click

    const audit = await prisma.auditLog.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('PRIVACY_NOTICE_ACKNOWLEDGED');
    expect(await status()).toEqual({ acknowledged: true, version: NOTICE_VERSION });
  });

  test('an acknowledgement of an older version does not count for the current one', async () => {
    await prisma.privacyEvent.create({ data: { event_type: 'acknowledged', notice_version: NOTICE_VERSION - 1 } });
    expect((await status()).acknowledged).toBe(false);
  });

  test('a presented-but-not-acknowledged notice does not count', async () => {
    await prisma.privacyEvent.create({ data: { event_type: 'presented', notice_version: NOTICE_VERSION } });
    expect((await status()).acknowledged).toBe(false);
  });
});

describe('importing a transcript writes nothing about the student to the database', () => {
  const workbook = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Course', 'Course Title', 'Credits', 'Earned', 'Status', 'Grade', 'Term'],
      ['COS10009', 'Introduction to Programming', 12.5, 12.5, 'Complete', 'D', '2025_SEP_S2'],
      ['COS20007', 'Object-oriented Programming', 12.5, 12.5, 'Complete', 'CP', '2026_MAR_S1'],
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  };
  const upload = () => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array(workbook())], 'transcript.xlsx'));
    return importExcel(new Request('http://localhost/api/import', { method: 'POST', body: fd }) as never);
  };
  const snapshot = () => withClient(async (c) => {
    const { rows } = await c.query(`select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations' order by 1`);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.tablename] = Number((await c.query(`select count(*) n from "${r.tablename}"`)).rows[0].n);
    return out;
  });

  test('before the notice is acknowledged the import is refused', async () => {
    expect((await upload()).status).toBe(403);
  });

  test('after it, the transcript is read and not one row is stored', async () => {
    await acknowledge(json('/api/privacy/acknowledge', {}) as never);
    const before = await snapshot();

    const res = await upload();
    expect(res.status).toBe(200);
    const { courseList } = await res.json();
    expect(courseList.map((c: any) => c.courseId)).toEqual(expect.arrayContaining(['COS10009', 'COS20007']));

    expect(await snapshot()).toEqual(before);
  });
});

describe('settings (system config)', () => {
  test('a value that is saved is read back, and saving again replaces it', async () => {
    await configPost(json('/api/config', { key: 'second_major_threshold', value: '65' }) as never);
    await configPost(json('/api/config', { key: 'second_major_threshold', value: '80' }) as never);
    const res = await configGet({ nextUrl: new URL('http://localhost/api/config?key=second_major_threshold') } as never);
    expect(await res.json()).toEqual({ key: 'second_major_threshold', value: '80' });
    expect(await rowCount('system_config')).toBe(1);
  });

  test('a key that the app does not know is refused and nothing is stored', async () => {
    const res = await configPost(json('/api/config', { key: 'anything', value: 'x' }) as never);
    expect(res.status).toBe(400);
    expect(await rowCount('system_config')).toBe(0);
  });

  test('a key with no value yet reads as null', async () => {
    const res = await configGet({ nextUrl: new URL('http://localhost/api/config?key=class_estimation_new_intake') } as never);
    expect(await res.json()).toEqual({ key: 'class_estimation_new_intake', value: null });
  });
});

describe('saving a planner through the API', () => {
  const planner = () => ({
    file_name: 'p.pdf',
    course_information: { course: 'Bachelor of Computer Science', major: 'Data Science', intake: 'March', intake_year: 2026,
      requirements: { core: { count: 1, cp: 12.5 }, major: { count: 0, cp: 0 }, elective: { count: 0, cp: 0 }, wil: { count: 0, cp: 0 } } },
    categories: { core_units: [{ unit_code: 'COS10009', unit_name: 'Programming', year_level: 1, semester: 1, category: 'core', prerequisite: null }],
      major_units: [], mpu_group: [], wil_group: [], elective_groups: { prescribed_elective: [], elective: [] } },
  });

  test('a saved planner shows in the planner list; saving it again gives 409 and adds nothing', async () => {
    const first = await savePlanner(json('/api/planners/save', { planner: planner() }) as never);
    expect(first.status).toBe(200);
    const { plannerId } = await first.json();

    const list = await (await listPlanners()).json();
    expect(list.map((p: any) => p.id)).toContain(plannerId);

    const second = await savePlanner(json('/api/planners/save', { planner: planner() }) as never);
    expect(second.status).toBe(409);
    expect(await rowCount('planner_templates')).toBe(1);
  });

  test('a body with no course information is refused with 400', async () => {
    expect((await savePlanner(json('/api/planners/save', { planner: {} }) as never)).status).toBe(400);
    expect(await rowCount('courses')).toBe(0);
  });
});

describe('unit check', () => {
  test('returns the codes that exist', async () => {
    await prisma.unit.createMany({ data: [{ unit_code: 'COS10009', unit_name: 'P' }, { unit_code: 'COS10026', unit_name: 'W' }] });
    const res = await unitsCheck(json('/api/units/check', { codes: ['COS10009', 'NOPE00000'] }) as never);
    expect((await res.json()).existingCodes).toEqual(['COS10009']);
  });
});

// The routes check the body before it reaches the database: unknown fields (id, created_at, a foreign key of another
// record) and missing or wrongly typed fields are 400, and nothing is written.
describe('input validation', () => {
  const call = async (module: string, method: string, url: string, body: unknown, ctx?: unknown) => {
    const route = await import(module);
    return route[method](json(url, body, method) as never, ctx);
  };

  test('creating a course with an unknown field is refused instead of reaching the database', async () => {
    const res = await call('@/app/api/courses/route', 'POST', '/api/courses', { name: 'BCS', id: '00000000-0000-0000-0000-000000000001', created_at: '1999-01-01' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown fields: "id", "created_at"/);
    expect(await rowCount('courses')).toBe(0);
  });

  test('creating a course with no name gives 400, not 500', async () => {
    const res = await call('@/app/api/courses/route', 'POST', '/api/courses', {});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Missing required field: "name"/);
  });

  test('a body that is not an object, or not JSON, gives 400', async () => {
    for (const body of [[], 'text', 5, null]) {
      expect((await call('@/app/api/courses/route', 'POST', '/api/courses', body)).status).toBe(400);
    }
    const { POST } = await import('@/app/api/courses/route');
    const bad = new Request('http://localhost/api/courses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect((await POST(bad as never)).status).toBe(400);
  });

  test('a wrong type or a value out of range gives 400 and writes nothing', async () => {
    const course = await prisma.course.create({ data: { name: 'C', code: 'C1' } });
    const bad: [string, string, unknown][] = [
      ['@/app/api/majors/route', '/api/majors', { course_id: 'not-a-uuid', name: 'X' }],
      ['@/app/api/majors/route', '/api/majors', { course_id: course.id, name: '' }],
      ['@/app/api/majors/route', '/api/majors', { course_id: course.id, name: 5 }],
      ['@/app/api/majors/route', '/api/majors', { course_id: course.id, name: 'X'.repeat(300) }],
      ['@/app/api/template-units/route', '/api/template-units', { planner_template_id: course.id, category: 'bonus', year_level: 1, semester: 1 }],
      ['@/app/api/template-units/route', '/api/template-units', { planner_template_id: course.id, category: 'core', year_level: 9, semester: 1 }],
      ['@/app/api/planners/route', '/api/planners', { course_id: course.id, intake_year: '2025' }],
      ['@/app/api/planners/route', '/api/planners', { course_id: course.id, intake_year: 2025, intake_month: 13 }],
    ];
    for (const [module, url, body] of bad) {
      expect((await call(module, 'POST', url, body)).status).toBe(400);
    }
    expect(await rowCount('majors')).toBe(0);
    expect(await rowCount('planner_templates')).toBe(0);
  });

  test('an update that changes the primary key, or nothing at all, is refused', async () => {
    const course = await prisma.course.create({ data: { name: 'C', code: 'C1' } });
    const ctx = { params: Promise.resolve({ id: course.id }) };
    expect((await call('@/app/api/courses/[id]/route', 'PUT', '/x', { id: '00000000-0000-0000-0000-000000000009' }, ctx)).status).toBe(400);
    expect((await call('@/app/api/courses/[id]/route', 'PUT', '/x', {}, ctx)).status).toBe(400);
    expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).id).toBe(course.id);
  });

  test('a valid body still goes through (the Study Planners page edits these fields)', async () => {
    const course = await prisma.course.create({ data: { name: 'C', code: 'C1' } });
    const planner = await prisma.plannerTemplate.create({ data: { course_id: course.id, intake_year: 2024, intake_month: 2 } });
    const ctx = { params: Promise.resolve({ id: planner.id }) };
    const res = await call('@/app/api/planners/[id]/route', 'PUT', '/x', { course_name: 'Renamed', intake_month: 8, core_count: 12, core_cp: null }, ctx);
    expect(res.status).toBe(200);
    const after = await prisma.plannerTemplate.findUniqueOrThrow({ where: { id: planner.id }, include: { course: true } });
    expect(after.intake_month).toBe(8);
    expect(after.core_count).toBe(12);
    expect(after.course.name).toBe('Renamed');
  });
});
