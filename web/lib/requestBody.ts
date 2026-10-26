import { NextResponse } from 'next/server';

/**
 * Checks the JSON body of a request against a list of allowed fields, before anything reaches the database.
 *
 * Without this, a route that passes the body to Prisma lets a caller set any column (`id`, `created_at`, a foreign
 * key of another record) and turns every mistake into a 500. A body is accepted only when:
 *   - it is a JSON object
 *   - it has no field that the spec does not list (the error names the field)
 *   - every required field is present (not for an update: `partial`)
 *   - every value has the right type and range
 */

type Common = { required?: boolean; nullable?: boolean };
export type Field =
  | (Common & { type: 'string'; max?: number })
  | (Common & { type: 'uuid' })
  | (Common & { type: 'int'; min?: number; max?: number })
  | (Common & { type: 'boolean' })
  | (Common & { type: 'enum'; values: readonly string[] })
  | (Common & { type: 'intArray'; min?: number; max?: number });
export type Spec = Record<string, Field>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(name: string, field: Field, value: unknown): string | null {
  if (value === null) return field.nullable ? null : `"${name}" cannot be null.`;
  switch (field.type) {
    case 'string':
      if (typeof value !== 'string') return `"${name}" must be a string.`;
      if (field.required && value.trim() === '') return `"${name}" cannot be empty.`;
      if (field.max !== undefined && value.length > field.max) return `"${name}" is longer than ${field.max} characters.`;
      return null;
    case 'uuid':
      return typeof value === 'string' && UUID.test(value) ? null : `"${name}" must be an id (UUID).`;
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) return `"${name}" must be a whole number.`;
      if (field.min !== undefined && value < field.min) return `"${name}" must be at least ${field.min}.`;
      if (field.max !== undefined && value > field.max) return `"${name}" must be at most ${field.max}.`;
      return null;
    case 'boolean':
      return typeof value === 'boolean' ? null : `"${name}" must be true or false.`;
    case 'enum':
      return typeof value === 'string' && field.values.includes(value) ? null : `"${name}" must be one of: ${field.values.join(', ')}.`;
    case 'intArray':
      if (!Array.isArray(value) || !value.every((v) => Number.isInteger(v) && v >= (field.min ?? -Infinity) && v <= (field.max ?? Infinity))) {
        return `"${name}" must be a list of whole numbers${field.min !== undefined ? ` from ${field.min} to ${field.max}` : ''}.`;
      }
      return null;
  }
}

export type BodyResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function validateBody<T = Record<string, unknown>>(raw: unknown, spec: Spec, opts: { partial?: boolean } = {}): BodyResult<T> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'The request body must be a JSON object.' };
  const body = raw as Record<string, unknown>;

  const unknown = Object.keys(body).filter((k) => !(k in spec));
  if (unknown.length) return { ok: false, error: `Unknown field${unknown.length > 1 ? 's' : ''}: ${unknown.map((k) => `"${k}"`).join(', ')}.` };

  if (!opts.partial) {
    const missing = Object.entries(spec).filter(([k, f]) => f.required && body[k] === undefined).map(([k]) => `"${k}"`);
    if (missing.length) return { ok: false, error: `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.` };
  } else if (Object.keys(body).length === 0) {
    return { ok: false, error: 'Nothing to update: the body has no fields.' };
  }

  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    const problem = check(k, spec[k], v);
    if (problem) return { ok: false, error: problem };
  }
  return { ok: true, data: body as T };
}

/** Reads the request body as JSON and validates it. A bad body gives a ready 400 response. */
export async function readBody<T = Record<string, unknown>>(
  req: Request,
  spec: Spec,
  opts: { partial?: boolean } = {},
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'The request body is not valid JSON.' }, { status: 400 }) };
  }
  const result = validateBody<T>(raw, spec, opts);
  return result.ok ? result : { ok: false, response: NextResponse.json({ error: result.error }, { status: 400 }) };
}

// ── the fields of each table that a caller may set ──────────────────────────────────────────────────────────────────
export const UNIT_CATEGORIES = ['core', 'major_core', 'prescribed_elective', 'elective', 'wil', 'mpu'] as const;

const requirement = { type: 'int', nullable: true, min: 0, max: 32000 } as const;
export const COURSE_FIELDS: Spec = {
  code: { type: 'string', max: 50, nullable: true },
  name: { type: 'string', max: 255, required: true },
};
export const MAJOR_FIELDS: Spec = {
  course_id: { type: 'uuid', required: true },
  name: { type: 'string', max: 255, required: true },
};
export const ELECTIVE_GROUP_FIELDS: Spec = { planner_template_id: { type: 'uuid', required: true } };
export const ELECTIVE_GROUP_UNIT_FIELDS: Spec = {
  elective_group_id: { type: 'uuid', required: true },
  unit_id: { type: 'uuid', required: true },
};
export const TEMPLATE_UNIT_FIELDS: Spec = {
  planner_template_id: { type: 'uuid', required: true },
  unit_id: { type: 'uuid', nullable: true },
  category: { type: 'enum', values: UNIT_CATEGORIES, required: true },
  year_level: { type: 'int', min: 1, max: 6, required: true },
  semester: { type: 'int', min: 1, max: 4, required: true },
};
export const UNIT_FIELDS: Spec = {
  unit_code: { type: 'string', max: 20, required: true },
  unit_name: { type: 'string', max: 255, required: true },
  is_active: { type: 'boolean' },
  replaced_by_unit_id: { type: 'uuid', nullable: true },
};
const PLANNER_SETTINGS: Spec = {
  intake_year: { type: 'int', min: 1990, max: 2100 },
  intake_month: { type: 'int', min: 1, max: 12, nullable: true },
  course_type: { type: 'string', max: 50 },
  duration_semesters: { type: 'int', min: 1, max: 32 },
  core_count: requirement, core_cp: requirement,
  major_count: requirement, major_cp: requirement,
  elective_count: requirement, elective_cp: requirement,
  wil_count: requirement, wil_cp: requirement,
};
export const PLANNER_CREATE_FIELDS: Spec = {
  course_id: { type: 'uuid', required: true },
  major_id: { type: 'uuid', nullable: true },
  ...PLANNER_SETTINGS,
  intake_year: { type: 'int', min: 1990, max: 2100, required: true },
};
/** What the Study Planners page edits: the names of the course and the major, and the planner's own settings. */
export const PLANNER_UPDATE_FIELDS: Spec = {
  course_name: { type: 'string', max: 255 },
  major_name: { type: 'string', max: 255 },
  ...PLANNER_SETTINGS,
};
/** One row of a planner, as the Study Planners page edits it. `template_unit_id` says which row. */
export const TEMPLATE_UNIT_EDIT_FIELDS: Spec = {
  template_unit_id: { type: 'uuid', required: true },
  unit_code: { type: 'string', max: 20 },
  unit_name: { type: 'string', max: 255 },
  offered_in: { type: 'intArray', min: 1, max: 4 },
  prerequisite: { type: 'string', max: 2000, nullable: true },
  category: { type: 'enum', values: UNIT_CATEGORIES },
  year_level: { type: 'int', min: 1, max: 6 },
  semester: { type: 'int', min: 1, max: 4 },
};
