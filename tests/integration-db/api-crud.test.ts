/**
 * REST routes for courses, majors, elective groups, ping and export, called as functions against a real database.
 * The status codes here are the contract that the renderer relies on: 201 on create, 404 on a missing row, 500 on a database refusal.
 */
import { prisma } from '@core/db/client';
import { resetDb } from './helpers';
import * as courses from '@/app/api/courses/route';
import * as course from '@/app/api/courses/[id]/route';
import { GET as courseMajors } from '@/app/api/courses/[id]/majors/route';
import * as majors from '@/app/api/majors/route';
import * as groups from '@/app/api/elective-groups/route';
import * as group from '@/app/api/elective-groups/[id]/route';
import { GET as ping } from '@/app/api/ping/route';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const req = (body?: unknown, method = 'POST') =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('/api/ping', () => {
  test('answers 200 with a payload', async () => {
    const res = await ping();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeTruthy();
  });
});

describe('/api/courses', () => {
  test('create, read, update and delete a course', async () => {
    const created = await courses.POST(req({ name: 'Bachelor of Computer Science', code: 'BCS' }));
    expect(created.status).toBe(201);
    const { id } = await created.json();

    const read = await course.GET(req(undefined, 'GET'), ctx(id));
    expect(read.status).toBe(200);
    expect((await read.json()).code).toBe('BCS');

    const updated = await course.PUT(req({ name: 'BCS (renamed)' }), ctx(id));
    expect(updated.status).toBe(200);
    expect((await prisma.course.findUniqueOrThrow({ where: { id } })).name).toBe('BCS (renamed)');

    const del = await course.DELETE(req(undefined, 'DELETE'), ctx(id));
    expect(del.status).toBe(200);
    expect(await prisma.course.count()).toBe(0);
  });

  test('the list returns every course', async () => {
    await prisma.course.createMany({ data: [{ name: 'A', code: 'A1' }, { name: 'B', code: 'B1' }] });
    const res = await courses.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).map((c: { code: string }) => c.code).sort()).toEqual(['A1', 'B1']);
  });

  test('a course that does not exist gives 404', async () => {
    const res = await course.GET(req(undefined, 'GET'), ctx(MISSING));
    expect(res.status).toBe(404);
  });

  test('a malformed id gives 500, not a crash', async () => {
    const res = await course.GET(req(undefined, 'GET'), ctx('not-a-uuid'));
    expect(res.status).toBe(500);
  });

  test('a duplicate course code is refused and nothing is added', async () => {
    await courses.POST(req({ name: 'A', code: 'DUP' }));
    const again = await courses.POST(req({ name: 'B', code: 'DUP' }));
    expect(again.status).toBe(500);
    expect(await prisma.course.count()).toBe(1);
  });

  test('updating or deleting a missing course gives 500', async () => {
    expect((await course.PUT(req({ name: 'x' }), ctx(MISSING))).status).toBe(500);
    expect((await course.DELETE(req(undefined, 'DELETE'), ctx(MISSING))).status).toBe(500);
  });

  test('a course that still has majors cannot be deleted (ON DELETE RESTRICT)', async () => {
    const c = await prisma.course.create({ data: { name: 'C', code: 'C1' } });
    await prisma.major.create({ data: { course_id: c.id, name: 'Software' } });
    const res = await course.DELETE(req(undefined, 'DELETE'), ctx(c.id));
    expect(res.status).toBe(500);
    expect(await prisma.course.count()).toBe(1);
  });
});

describe('/api/majors', () => {
  test('creating a major links it to its course, and the course lists it', async () => {
    const c = await prisma.course.create({ data: { name: 'C', code: 'C1' } });
    const other = await prisma.course.create({ data: { name: 'D', code: 'D1' } });
    const res = await majors.POST(req({ course_id: c.id, name: 'Software' }));
    expect(res.status).toBe(201);
    await prisma.major.create({ data: { course_id: other.id, name: 'Networks' } });

    const mine = await (await courseMajors(req(undefined, 'GET'), ctx(c.id))).json();
    expect(mine.map((m: { name: string }) => m.name)).toEqual(['Software']);
    expect(await (await majors.GET()).json()).toHaveLength(2);
  });

  test('the same major name twice in one course is refused; in another course it is allowed', async () => {
    const a = await prisma.course.create({ data: { name: 'A', code: 'A1' } });
    const b = await prisma.course.create({ data: { name: 'B', code: 'B1' } });
    expect((await majors.POST(req({ course_id: a.id, name: 'Same' }))).status).toBe(201);
    expect((await majors.POST(req({ course_id: a.id, name: 'Same' }))).status).toBe(500);
    expect((await majors.POST(req({ course_id: b.id, name: 'Same' }))).status).toBe(201);
  });

  test('a major for a course that does not exist is refused', async () => {
    expect((await majors.POST(req({ course_id: MISSING, name: 'Ghost' }))).status).toBe(500);
    expect(await prisma.major.count()).toBe(0);
  });
});

describe('/api/elective-groups', () => {
  const planner = async () => {
    const c = await prisma.course.create({ data: { name: 'C', code: 'C1' } });
    return prisma.plannerTemplate.create({ data: { course_id: c.id, intake_year: 2024, intake_month: 2 } });
  };

  test('create, read, update and delete a group', async () => {
    const p = await planner();
    const created = await groups.POST(req({ planner_template_id: p.id }));
    expect(created.status).toBe(201);
    const { id } = await created.json();

    expect((await group.GET(req(undefined, 'GET'), ctx(id))).status).toBe(200);
    expect((await groups.GET()).status).toBe(200);
    expect((await group.PUT(req({ planner_template_id: p.id }), ctx(id))).status).toBe(200);
    expect((await group.PUT(req({}), ctx(id))).status).toBe(400);     // nothing to update
    expect((await group.DELETE(req(undefined, 'DELETE'), ctx(id))).status).toBe(200);
    expect(await prisma.electiveGroup.count()).toBe(0);
  });

  test('a missing group gives 404', async () => {
    expect((await group.GET(req(undefined, 'GET'), ctx(MISSING))).status).toBe(404);
  });

  test('a group for a missing planner is refused', async () => {
    expect((await groups.POST(req({ planner_template_id: MISSING }))).status).toBe(500);
  });

  test('deleting a planner removes its groups (ON DELETE CASCADE)', async () => {
    const p = await planner();
    await prisma.electiveGroup.create({ data: { planner_template_id: p.id } });
    await prisma.plannerTemplate.delete({ where: { id: p.id } });
    expect(await prisma.electiveGroup.count()).toBe(0);
  });
});
