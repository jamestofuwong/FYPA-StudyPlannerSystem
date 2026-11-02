// A plan file is a machine-readable payload embedded in the "Plan Data"
// sheet of an exported Excel workbook, so a plan can be restored without a
// transcript. Codes only: no student ID, name, grade or term may appear
// here. validatePayload is the trust boundary and must never throw.

export const PLAN_FILE_FORMAT_VERSION = 1;
export const PLAN_FILE_MARKER = 'SPS_PLAN_FILE';
export const PLAN_DATA_SHEET_NAME = 'Plan Data';
export const PLAN_DATA_SHEET_NOTE = 'Plan Data';

export const PLAN_FILE_LIMITS = {
  /** Metadata rows in the Plan Data sheet, excluding the note row: one row per top-level field (14 today, see ROW_KEYS). 50 leaves room to grow. */
  maxRows: 50,
  maxStringLength: 255,
  /** Applies to completedUnitCodes, concededPassUnitCodes, outsidePlannerUnitCodes, minorNames, customMpuList and arrangement. */
  maxCodesPerList: 1000,
  /**
   * Bounds a single cell's raw text before JSON.parse runs, Excel's own
   * hard per-cell limit (xlsx-js-style's XLSX.write throws "Text length
   * must not exceed 32767 characters" past this). handleExcelDownload's
   * pre-write check blocks an oversized export before it's written, so on
   * import a cell this size cannot be a genuine file. 1000 arrangement
   * entries serialise to ~159 KB, well over this cap, which is why the real
   * guard is that pre-write check, not a smaller maxCodesPerList.
   */
  maxCellLength: 32_767,
};

export const PLAN_CATEGORIES = [
  'core', 'major_core', 'prescribed_elective', 'elective', 'wil', 'mpu', 'double_major', 'minor',
] as const;
export type PlanCategory = typeof PLAN_CATEGORIES[number];

const UNIT_CODE_PATTERN = /^[A-Za-z0-9*_-]{1,40}$/;

export interface PlanPayloadPlannerKey {
  courseCode: string | null;
  courseName: string;
  majorName: string | null;
  intakeYear: number;
  intakeMonth: number | null;
}

export interface PlanPayloadArrangementUnit {
  code: string;
  category: string;
  year: number;
  semester: 1 | 2;
  /** Index within that semester's unit list, so replaceUnit/the picker's order survives a restore. */
  position: number;
  recommended: boolean;
  outsidePlanner: boolean;
  retake: boolean;
  concededPassRetake: boolean;
}

export interface PlanPayload {
  formatVersion: number;
  marker: string;
  /** ISO 8601. The restored page is a snapshot as of this date. */
  exportDate: string;
  planner: PlanPayloadPlannerKey;
  completedUnitCodes: string[];
  concededPassUnitCodes: string[];
  arrangement: PlanPayloadArrangementUnit[];
  outsidePlannerUnitCodes: string[];
  minorNames: string[];
  doubleMajorMajorName: string | null;
  customWilSlot: string | null;
  customMpuList: { code: string; name: string }[];
  startYear: number;
  startSemester: 1 | 2;
}

export interface PlanPayloadIssue {
  code: string;
  message: string;
}

export type PlanPayloadResult =
  | { payload: PlanPayload; issues: PlanPayloadIssue[] }
  | { error: string };

export interface BuildPlanPayloadInput {
  exportDate?: Date;
  planner: PlanPayloadPlannerKey;
  completedUnitCodes: string[];
  concededPassUnitCodes: string[];
  arrangement: PlanPayloadArrangementUnit[];
  outsidePlannerUnitCodes: string[];
  minorNames: string[];
  doubleMajorMajorName: string | null;
  customWilSlot: string | null;
  customMpuList: { code: string; name: string }[];
  startYear: number;
  startSemester: 1 | 2;
}

function upperCode(code: string): string {
  return code.trim().toUpperCase();
}

export function buildPlanPayload(input: BuildPlanPayloadInput): PlanPayload {
  return {
    formatVersion: PLAN_FILE_FORMAT_VERSION,
    marker: PLAN_FILE_MARKER,
    exportDate: (input.exportDate ?? new Date()).toISOString(),
    planner: {
      courseCode: input.planner.courseCode,
      courseName: input.planner.courseName,
      majorName: input.planner.majorName,
      intakeYear: input.planner.intakeYear,
      intakeMonth: input.planner.intakeMonth,
    },
    completedUnitCodes: input.completedUnitCodes.map(upperCode),
    concededPassUnitCodes: input.concededPassUnitCodes.map(upperCode),
    arrangement: input.arrangement.map((u) => ({
      code: upperCode(u.code),
      category: u.category,
      year: u.year,
      semester: u.semester,
      position: u.position,
      recommended: !!u.recommended,
      outsidePlanner: !!u.outsidePlanner,
      retake: !!u.retake,
      concededPassRetake: !!u.concededPassRetake,
    })),
    outsidePlannerUnitCodes: input.outsidePlannerUnitCodes.map(upperCode),
    minorNames: [...input.minorNames],
    doubleMajorMajorName: input.doubleMajorMajorName,
    customWilSlot: input.customWilSlot,
    customMpuList: input.customMpuList.map((m) => ({ code: upperCode(m.code), name: m.name })),
    startYear: input.startYear,
    startSemester: input.startSemester,
  };
}

/**
 * Field names whose cell would exceed maxCellLength, Excel's own hard
 * per-cell limit. Checked before writing: an export this large would
 * otherwise throw deep inside XLSX.write, or get silently truncated into
 * invalid JSON, so handleExcelDownload blocks the export outright instead.
 */
export function findOversizedPlanDataCells(payload: PlanPayload): string[] {
  return payloadToRows(payload)
    .filter(([, value]) => value.length > PLAN_FILE_LIMITS.maxCellLength)
    .map(([key]) => key);
}

// The Plan Data sheet is a two-column key/value table. Composite fields are
// their own JSON string in the value cell, so one corrupted field only
// affects that field on read back, not the whole sheet.

const ROW_KEYS = [
  'marker', 'formatVersion', 'exportDate', 'planner',
  'completedUnitCodes', 'concededPassUnitCodes', 'arrangement',
  'outsidePlannerUnitCodes', 'minorNames', 'doubleMajorMajorName',
  'customWilSlot', 'customMpuList', 'startYear', 'startSemester',
] as const;

export function payloadToRows(payload: PlanPayload): string[][] {
  return [
    ['marker', payload.marker],
    ['formatVersion', String(payload.formatVersion)],
    ['exportDate', payload.exportDate],
    ['planner', JSON.stringify(payload.planner)],
    ['completedUnitCodes', JSON.stringify(payload.completedUnitCodes)],
    ['concededPassUnitCodes', JSON.stringify(payload.concededPassUnitCodes)],
    ['arrangement', JSON.stringify(payload.arrangement)],
    ['outsidePlannerUnitCodes', JSON.stringify(payload.outsidePlannerUnitCodes)],
    ['minorNames', JSON.stringify(payload.minorNames)],
    ['doubleMajorMajorName', JSON.stringify(payload.doubleMajorMajorName)],
    ['customWilSlot', JSON.stringify(payload.customWilSlot)],
    ['customMpuList', JSON.stringify(payload.customMpuList)],
    ['startYear', String(payload.startYear)],
    ['startSemester', String(payload.startSemester)],
  ];
}

/** Parses a JSON cell defensively. Never throws; bad JSON becomes `fallback` plus an issue. */
function parseJsonCell(raw: string | undefined, key: string, fallback: unknown, issues: PlanPayloadIssue[]): unknown {
  if (raw === undefined) return fallback;
  // Checked before JSON.parse, not after: a hostile cell many megabytes
  // long should never be parsed at all just to be truncated by
  // maxCodesPerList afterwards.
  if (raw.length > PLAN_FILE_LIMITS.maxCellLength) {
    issues.push({ code: 'cell_too_large', message: `"${key}" in the Plan Data sheet was too large to read; using a default instead.` });
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    issues.push({ code: 'bad_json', message: `Could not read "${key}" from the Plan Data sheet; using a default instead.` });
    return fallback;
  }
}

export function rowsToPayload(rows: string[][]): PlanPayloadResult {
  if (!Array.isArray(rows)) return { error: 'The Plan Data sheet is not readable.' };
  if (rows.length > PLAN_FILE_LIMITS.maxRows) {
    return { error: 'The Plan Data sheet has more rows than a plan file should ever contain.' };
  }

  // byKey is a Map, and every key reaching it has already passed the
  // ROW_KEYS allowlist below: a cell value of "__proto__", "constructor" or
  // "prototype" is just an unrecognised key here, never a property write,
  // so it cannot reach Object.prototype through this or any later step.
  const issues: PlanPayloadIssue[] = [];
  const byKey = new Map<string, string>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [key, value] = row;
    if (typeof key !== 'string' || typeof value !== 'string') continue;
    if (!(ROW_KEYS as readonly string[]).includes(key)) {
      issues.push({ code: 'unknown_key', message: `Ignored an unrecognised Plan Data row ("${key}").` });
      continue;
    }
    if (byKey.has(key)) {
      issues.push({ code: 'duplicate_key', message: `"${key}" appeared more than once in the Plan Data sheet; the first value was kept.` });
      continue;
    }
    byKey.set(key, value);
  }

  if (byKey.get('marker') !== PLAN_FILE_MARKER) {
    return { error: 'This file does not contain a Study Planner Plan Data sheet.' };
  }

  const formatVersionRaw = byKey.get('formatVersion');
  const formatVersion = formatVersionRaw !== undefined ? Number(formatVersionRaw) : NaN;
  if (!Number.isFinite(formatVersion) || formatVersion !== PLAN_FILE_FORMAT_VERSION) {
    return { error: `This plan file's format (version ${formatVersionRaw ?? 'unknown'}) is not supported by this version of the app.` };
  }

  const raw: Record<string, unknown> = {
    marker: PLAN_FILE_MARKER,
    formatVersion,
    exportDate: byKey.get('exportDate') ?? '',
    planner: parseJsonCell(byKey.get('planner'), 'planner', null, issues),
    completedUnitCodes: parseJsonCell(byKey.get('completedUnitCodes'), 'completedUnitCodes', [], issues),
    concededPassUnitCodes: parseJsonCell(byKey.get('concededPassUnitCodes'), 'concededPassUnitCodes', [], issues),
    arrangement: parseJsonCell(byKey.get('arrangement'), 'arrangement', [], issues),
    outsidePlannerUnitCodes: parseJsonCell(byKey.get('outsidePlannerUnitCodes'), 'outsidePlannerUnitCodes', [], issues),
    minorNames: parseJsonCell(byKey.get('minorNames'), 'minorNames', [], issues),
    doubleMajorMajorName: parseJsonCell(byKey.get('doubleMajorMajorName'), 'doubleMajorMajorName', null, issues),
    customWilSlot: parseJsonCell(byKey.get('customWilSlot'), 'customWilSlot', null, issues),
    customMpuList: parseJsonCell(byKey.get('customMpuList'), 'customMpuList', [], issues),
    startYear: Number(byKey.get('startYear')),
    startSemester: Number(byKey.get('startSemester')),
  };

  const result = validatePayload(raw);
  if ('error' in result) return result;
  return { payload: result.payload, issues: [...issues, ...result.issues] };
}

// The trust boundary for an untrusted uploaded file. Never throws: every
// unrecognised or malformed item is dropped and recorded in `issues`, and
// the caller decides what to do with a payload that came back partial.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > maxLength) return null;
  return value;
}

function sanitizeCodeList(value: unknown, key: string, issues: PlanPayloadIssue[]): string[] {
  if (!Array.isArray(value)) {
    issues.push({ code: 'bad_list', message: `"${key}" was not a list; treated as empty.` });
    return [];
  }
  const capped = value.slice(0, PLAN_FILE_LIMITS.maxCodesPerList);
  if (value.length > capped.length) {
    issues.push({ code: 'list_truncated', message: `"${key}" had more entries than allowed; the extra entries were dropped.` });
  }
  const out: string[] = [];
  for (const item of capped) {
    if (typeof item !== 'string') {
      issues.push({ code: 'bad_code', message: `A non-text entry in "${key}" was skipped.` });
      continue;
    }
    const code = upperCode(item);
    if (!UNIT_CODE_PATTERN.test(code)) {
      issues.push({ code: 'bad_code', message: `"${item}" in "${key}" is not a valid unit code and was skipped.` });
      continue;
    }
    out.push(code);
  }
  return out;
}

function sanitizeStringList(value: unknown, key: string, issues: PlanPayloadIssue[]): string[] {
  if (!Array.isArray(value)) {
    issues.push({ code: 'bad_list', message: `"${key}" was not a list; treated as empty.` });
    return [];
  }
  const capped = value.slice(0, PLAN_FILE_LIMITS.maxCodesPerList);
  const out: string[] = [];
  for (const item of capped) {
    const s = sanitizeString(item, PLAN_FILE_LIMITS.maxStringLength);
    if (s === null) {
      issues.push({ code: 'bad_string', message: `An invalid entry in "${key}" was skipped.` });
      continue;
    }
    out.push(s);
  }
  return out;
}

function sanitizeNullableString(value: unknown, key: string, issues: PlanPayloadIssue[]): string | null {
  if (value === null || value === undefined) return null;
  const s = sanitizeString(value, PLAN_FILE_LIMITS.maxStringLength);
  if (s === null) {
    issues.push({ code: 'bad_string', message: `"${key}" was not valid text and was cleared.` });
    return null;
  }
  return s;
}

function sanitizeMpuList(value: unknown, issues: PlanPayloadIssue[]): { code: string; name: string }[] {
  if (!Array.isArray(value)) {
    issues.push({ code: 'bad_list', message: `"customMpuList" was not a list; treated as empty.` });
    return [];
  }
  const capped = value.slice(0, PLAN_FILE_LIMITS.maxCodesPerList);
  const out: { code: string; name: string }[] = [];
  for (const item of capped) {
    if (!isPlainObject(item)) {
      issues.push({ code: 'bad_mpu', message: 'An invalid entry in "customMpuList" was skipped.' });
      continue;
    }
    const code = typeof item.code === 'string' ? upperCode(item.code) : null;
    const name = sanitizeString(item.name, PLAN_FILE_LIMITS.maxStringLength);
    if (!code || !UNIT_CODE_PATTERN.test(code) || name === null) {
      issues.push({ code: 'bad_mpu', message: 'An invalid entry in "customMpuList" was skipped.' });
      continue;
    }
    out.push({ code, name });
  }
  return out;
}

function sanitizePlannerKey(value: unknown, issues: PlanPayloadIssue[]): PlanPayloadPlannerKey | null {
  if (!isPlainObject(value)) return null;
  const courseName = sanitizeString(value.courseName, PLAN_FILE_LIMITS.maxStringLength);
  const intakeYear = Number(value.intakeYear);
  if (courseName === null || !Number.isFinite(intakeYear)) return null;

  const courseCode = typeof value.courseCode === 'string' ? sanitizeString(value.courseCode, PLAN_FILE_LIMITS.maxStringLength) : null;
  const majorName = typeof value.majorName === 'string' ? sanitizeString(value.majorName, PLAN_FILE_LIMITS.maxStringLength) : null;
  const intakeMonthRaw = value.intakeMonth;
  const intakeMonth = intakeMonthRaw === null || intakeMonthRaw === undefined ? null : Number(intakeMonthRaw);

  return {
    courseCode: courseCode ?? null,
    courseName,
    majorName: majorName ?? null,
    intakeYear,
    intakeMonth: intakeMonth !== null && Number.isFinite(intakeMonth) ? intakeMonth : null,
  };
}

function sanitizeArrangement(value: unknown, issues: PlanPayloadIssue[]): PlanPayloadArrangementUnit[] {
  if (!Array.isArray(value)) {
    issues.push({ code: 'bad_list', message: '"arrangement" was not a list; treated as empty.' });
    return [];
  }
  const capped = value.slice(0, PLAN_FILE_LIMITS.maxCodesPerList);
  if (value.length > capped.length) {
    issues.push({ code: 'list_truncated', message: '"arrangement" had more entries than allowed; the extra entries were dropped.' });
  }

  const out: PlanPayloadArrangementUnit[] = [];
  for (const item of capped) {
    if (!isPlainObject(item)) {
      issues.push({ code: 'bad_unit', message: 'A malformed unit entry in the arrangement was skipped.' });
      continue;
    }
    const codeRaw = typeof item.code === 'string' ? upperCode(item.code) : '';
    const category = typeof item.category === 'string' ? item.category : '';
    const year = Number(item.year);
    const semesterRaw = Number(item.semester);
    const position = Number(item.position);

    if (
      !UNIT_CODE_PATTERN.test(codeRaw) ||
      !(PLAN_CATEGORIES as readonly string[]).includes(category) ||
      !Number.isFinite(year) ||
      (semesterRaw !== 1 && semesterRaw !== 2) ||
      !Number.isFinite(position)
    ) {
      issues.push({ code: 'bad_unit', message: `Unit "${item.code ?? '?'}" in the arrangement had an invalid shape and was skipped.` });
      continue;
    }

    out.push({
      code: codeRaw,
      category,
      year,
      semester: semesterRaw as 1 | 2,
      position,
      recommended: item.recommended === true,
      outsidePlanner: item.outsidePlanner === true,
      retake: item.retake === true,
      concededPassRetake: item.concededPassRetake === true,
    });
  }
  return out;
}

export function validatePayload(value: unknown): PlanPayloadResult {
  if (!isPlainObject(value)) {
    return { error: 'Plan data is not a valid object.' };
  }
  if (value.marker !== PLAN_FILE_MARKER) {
    return { error: 'This file does not contain a Study Planner Plan Data sheet.' };
  }
  if (value.formatVersion !== PLAN_FILE_FORMAT_VERSION) {
    return { error: `This plan file's format (version ${String(value.formatVersion)}) is not supported by this version of the app.` };
  }

  const issues: PlanPayloadIssue[] = [];

  const planner = sanitizePlannerKey(value.planner, issues);
  if (!planner) {
    return { error: 'This plan file is missing the planner it was exported from.' };
  }

  const exportDate = sanitizeString(value.exportDate, PLAN_FILE_LIMITS.maxStringLength) ?? '';
  const completedUnitCodes = sanitizeCodeList(value.completedUnitCodes, 'completedUnitCodes', issues);
  const concededPassUnitCodes = sanitizeCodeList(value.concededPassUnitCodes, 'concededPassUnitCodes', issues);
  const arrangement = sanitizeArrangement(value.arrangement, issues);
  const outsidePlannerUnitCodes = sanitizeCodeList(value.outsidePlannerUnitCodes, 'outsidePlannerUnitCodes', issues);
  const minorNames = sanitizeStringList(value.minorNames, 'minorNames', issues);
  const doubleMajorMajorName = sanitizeNullableString(value.doubleMajorMajorName, 'doubleMajorMajorName', issues);
  const customWilSlot = sanitizeNullableString(value.customWilSlot, 'customWilSlot', issues);
  const customMpuList = sanitizeMpuList(value.customMpuList, issues);
  const startYearNum = Number(value.startYear);
  const startYear = Number.isFinite(startYearNum) ? startYearNum : planner.intakeYear;
  const startSemester: 1 | 2 = Number(value.startSemester) === 2 ? 2 : 1;

  const payload: PlanPayload = {
    formatVersion: PLAN_FILE_FORMAT_VERSION,
    marker: PLAN_FILE_MARKER,
    exportDate,
    planner,
    completedUnitCodes,
    concededPassUnitCodes,
    arrangement,
    outsidePlannerUnitCodes,
    minorNames,
    doubleMajorMajorName,
    customWilSlot,
    customMpuList,
    startYear,
    startSemester,
  };

  return { payload, issues };
}
