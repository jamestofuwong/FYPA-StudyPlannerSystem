import {
  validateBody, COURSE_FIELDS, MAJOR_FIELDS, PLANNER_UPDATE_FIELDS, TEMPLATE_UNIT_EDIT_FIELDS, TEMPLATE_UNIT_FIELDS, UNIT_FIELDS,
} from '../../web/lib/requestBody';

const UUID = '3f2b8c1e-9d4a-4e7b-a1c5-6d8e2f0b7a93';
const ok = (r: ReturnType<typeof validateBody>) => (r.ok ? 'ok' : r.error);

describe('validateBody', () => {
  test.each([null, undefined, 5, 'x', true, []])('%j is not a body', (raw) => {
    expect(validateBody(raw, COURSE_FIELDS)).toEqual({ ok: false, error: 'The request body must be a JSON object.' });
  });

  test('a valid body is returned as it is', () => {
    expect(validateBody({ name: 'BCS', code: 'BA-CS' }, COURSE_FIELDS)).toEqual({ ok: true, data: { name: 'BCS', code: 'BA-CS' } });
  });

  test('every unknown field is named, even when the rest is valid', () => {
    expect(ok(validateBody({ name: 'BCS', id: UUID, created_at: 'x' }, COURSE_FIELDS))).toBe('Unknown fields: "id", "created_at".');
  });

  test('required fields must be there unless the body is a partial update', () => {
    expect(ok(validateBody({}, MAJOR_FIELDS))).toBe('Missing required fields: "course_id", "name".');
    expect(ok(validateBody({ name: 'New name' }, MAJOR_FIELDS, { partial: true }))).toBe('ok');
    expect(ok(validateBody({}, MAJOR_FIELDS, { partial: true }))).toMatch(/Nothing to update/);
  });

  test('a required string cannot be empty or blank; an optional one can be', () => {
    expect(ok(validateBody({ name: '   ' }, COURSE_FIELDS))).toMatch(/cannot be empty/);
    expect(ok(validateBody({ name: 'x', code: '' }, COURSE_FIELDS))).toBe('ok');
  });

  test('null is allowed only where the field says so', () => {
    expect(ok(validateBody({ name: 'x', code: null }, COURSE_FIELDS))).toBe('ok');
    expect(ok(validateBody({ name: null }, COURSE_FIELDS))).toMatch(/cannot be null/);
    expect(ok(validateBody({ intake_month: null, core_cp: null }, PLANNER_UPDATE_FIELDS, { partial: true }))).toBe('ok');
  });

  test('types: strings, whole numbers, ids, booleans, enums and lists', () => {
    expect(ok(validateBody({ unit_code: 5, unit_name: 'x' }, UNIT_FIELDS))).toMatch(/must be a string/);
    expect(ok(validateBody({ unit_code: 'A', unit_name: 'x', is_active: 'yes' }, UNIT_FIELDS))).toMatch(/true or false/);
    expect(ok(validateBody({ unit_code: 'A', unit_name: 'x', replaced_by_unit_id: 'nope' }, UNIT_FIELDS))).toMatch(/UUID/);
    expect(ok(validateBody({ planner_template_id: UUID, category: 'bonus', year_level: 1, semester: 1 }, TEMPLATE_UNIT_FIELDS))).toMatch(/one of: core, major_core/);
    expect(ok(validateBody({ planner_template_id: UUID, category: 'core', year_level: 1.5, semester: 1 }, TEMPLATE_UNIT_FIELDS))).toMatch(/whole number/);
    expect(ok(validateBody({ template_unit_id: UUID, offered_in: [1, 5] }, TEMPLATE_UNIT_EDIT_FIELDS))).toMatch(/from 1 to 4/);
    expect(ok(validateBody({ template_unit_id: UUID, offered_in: 'all' }, TEMPLATE_UNIT_EDIT_FIELDS))).toMatch(/list of whole numbers/);
  });

  test.each([
    [{ planner_template_id: UUID, category: 'core', year_level: 0, semester: 1 }, /at least 1/],
    [{ planner_template_id: UUID, category: 'core', year_level: 7, semester: 1 }, /at most 6/],
    [{ planner_template_id: UUID, category: 'core', year_level: 1, semester: 5 }, /at most 4/],
  ])('ranges follow the database constraints: %j', (body, message) => {
    expect(ok(validateBody(body, TEMPLATE_UNIT_FIELDS))).toMatch(message);
  });

  test('a string longer than the column is refused before the database does it', () => {
    expect(ok(validateBody({ name: 'x'.repeat(256) }, COURSE_FIELDS))).toMatch(/longer than 255/);
    expect(ok(validateBody({ name: 'x'.repeat(255) }, COURSE_FIELDS))).toBe('ok');
  });

  test('the Study Planners page edit (what it really sends) is accepted', () => {
    expect(ok(validateBody({ course_name: 'BCS', major_name: 'AI', intake_year: 2025, intake_month: 2, elective_count: 8, elective_cp: 100 }, PLANNER_UPDATE_FIELDS, { partial: true }))).toBe('ok');
    expect(ok(validateBody({ template_unit_id: UUID, unit_code: 'COS10009', unit_name: 'Intro', offered_in: [1, 2], prerequisite: null, category: 'core', year_level: 1, semester: 1 }, TEMPLATE_UNIT_EDIT_FIELDS))).toBe('ok');
  });

  test('a column that only the database should set is not in any spec', () => {
    for (const spec of [COURSE_FIELDS, MAJOR_FIELDS, UNIT_FIELDS, TEMPLATE_UNIT_FIELDS, PLANNER_UPDATE_FIELDS]) {
      for (const forbidden of ['id', 'created_at', 'updated_at']) expect(spec).not.toHaveProperty(forbidden);
    }
  });
});
