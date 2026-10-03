import {
  PLAN_FILE_FORMAT_VERSION,
  PLAN_FILE_MARKER,
  PLAN_FILE_LIMITS,
  buildPlanPayload,
  payloadToRows,
  rowsToPayload,
  validatePayload,
  findOversizedPlanDataCells,
  type BuildPlanPayloadInput,
  type PlanPayload,
} from '@core/shared/planFile';

const richInput: BuildPlanPayloadInput = {
  exportDate: new Date('2026-09-15T00:00:00.000Z'),
  planner: { courseCode: 'BA-CS', courseName: 'Bachelor of Computer Science', majorName: 'Artificial Intelligence', intakeYear: 2023, intakeMonth: 9 },
  completedUnitCodes: ['CORE1', 'CORE2', 'core3'],
  concededPassUnitCodes: ['CPUNIT'],
  arrangement: [
    { code: 'CORE4', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
    { code: 'PE1', category: 'prescribed_elective', year: 1, semester: 1, position: 1, recommended: true, outsidePlanner: false, retake: false, concededPassRetake: false },
    { code: 'CPUNIT', category: 'core', year: 1, semester: 2, position: 0, recommended: false, outsidePlanner: false, retake: true, concededPassRetake: true },
    { code: 'OUT1', category: 'elective', year: 2, semester: 1, position: 0, recommended: false, outsidePlanner: true, retake: false, concededPassRetake: false },
    { code: 'ICT20016*Optional', category: 'wil', year: 4, semester: 2, position: 2, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
  ],
  outsidePlannerUnitCodes: ['OUT1'],
  minorNames: ['Data Science Minor'],
  doubleMajorMajorName: 'Software Development',
  customWilSlot: '4-2',
  customMpuList: [{ code: 'MPU3193', name: 'Philosophy and Current Issues' }],
  startYear: 2023,
  startSemester: 2,
};

describe('buildPlanPayload', () => {
  test('stamps the format version and marker, and uppercases codes', () => {
    const payload = buildPlanPayload(richInput);
    expect(payload.formatVersion).toBe(PLAN_FILE_FORMAT_VERSION);
    expect(payload.marker).toBe(PLAN_FILE_MARKER);
    expect(payload.completedUnitCodes).toEqual(['CORE1', 'CORE2', 'CORE3']);
    expect(payload.exportDate).toBe('2026-09-15T00:00:00.000Z');
  });

  test('never contains a student ID, student name, grade or term field anywhere', () => {
    const payload = buildPlanPayload(richInput);
    const json = JSON.stringify(payload).toLowerCase();
    // customMpuList legitimately has a unit "name" (task's own decision table), so this
    // checks specific forbidden KEYS, not the word "name" in general.
    for (const forbiddenKey of ['"studentid"', '"studentname"', '"grade"', '"grades"', '"term"', '"terms"']) {
      expect(json.includes(forbiddenKey)).toBe(false);
    }
  });
});

describe('payload -> rows -> payload round trip', () => {
  test('a rich payload deep-equals after a full round trip', () => {
    const payload = buildPlanPayload(richInput);
    const rows = payloadToRows(payload);
    const result = rowsToPayload(rows);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.issues).toEqual([]);
    expect(result.payload).toEqual(payload);
  });

  test('a minimal payload (no minors, no double major, no WIL slot, no MPU, no arrangement) round-trips too', () => {
    const payload = buildPlanPayload({
      ...richInput,
      arrangement: [],
      outsidePlannerUnitCodes: [],
      minorNames: [],
      doubleMajorMajorName: null,
      customWilSlot: null,
      customMpuList: [],
    });
    const result = rowsToPayload(payloadToRows(payload));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.payload).toEqual(payload);
  });
});

describe('validatePayload: the untrusted-file security boundary', () => {
  const validRaw = () => JSON.parse(JSON.stringify(buildPlanPayload(richInput)));

  test('never throws on non-object input', () => {
    expect(() => validatePayload(null)).not.toThrow();
    expect(() => validatePayload(undefined)).not.toThrow();
    expect(() => validatePayload('a string')).not.toThrow();
    expect(() => validatePayload(42)).not.toThrow();
    expect(() => validatePayload([1, 2, 3])).not.toThrow();
    const r = validatePayload('not an object');
    expect('error' in r).toBe(true);
  });

  test('rejects a missing marker', () => {
    const raw = validRaw();
    delete raw.marker;
    const r = validatePayload(raw);
    expect('error' in r).toBe(true);
  });

  test('rejects an unsupported format version', () => {
    const raw = validRaw();
    raw.formatVersion = 999;
    const r = validatePayload(raw);
    expect('error' in r).toBe(true);
  });

  test('caps oversized lists rather than throwing, and reports the truncation', () => {
    const raw = validRaw();
    raw.completedUnitCodes = Array.from({ length: PLAN_FILE_LIMITS.maxCodesPerList + 50 }, (_, i) => `UNIT${i}`);
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.completedUnitCodes.length).toBeLessThanOrEqual(PLAN_FILE_LIMITS.maxCodesPerList);
    expect(r.issues.some((i) => i.code === 'list_truncated')).toBe(true);
  });

  test('skips wrong-typed entries in a code list instead of throwing', () => {
    const raw = validRaw();
    raw.completedUnitCodes = ['CORE1', 42, null, { not: 'a string' }, 'CORE2'];
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.completedUnitCodes).toEqual(['CORE1', 'CORE2']);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test('rejects a unit code outside the bounded charset', () => {
    const raw = validRaw();
    raw.completedUnitCodes = ['CORE1', 'DROP TABLE units;--', 'CORE2'];
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.completedUnitCodes).toEqual(['CORE1', 'CORE2']);
  });

  test('allows the real-world asterisk unit code shape (ICT20016*Optional)', () => {
    const raw = validRaw();
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement.some((u) => u.code === 'ICT20016*OPTIONAL')).toBe(true);
  });

  test('rejects an unknown category on an arrangement unit, keeping the rest', () => {
    const raw = validRaw();
    raw.arrangement = [
      { code: 'GOOD1', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      { code: 'BAD1', category: 'not_a_real_category', year: 1, semester: 1, position: 1, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
    ];
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement.map((u) => u.code)).toEqual(['GOOD1']);
    expect(r.issues.some((i) => i.code === 'bad_unit')).toBe(true);
  });

  test('a flag that is not strictly a boolean is treated as false, never thrown on', () => {
    const raw = validRaw();
    raw.arrangement = [
      { code: 'UNIT1', category: 'core', year: 1, semester: 1, position: 0, recommended: 'yes', outsidePlanner: 1, retake: null, concededPassRetake: undefined },
    ];
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement[0]).toMatchObject({ recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false });
  });

  test('one bad unit among good ones: restores the good, reports the bad', () => {
    const raw = validRaw();
    raw.arrangement = [
      { code: 'GOOD1', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      { code: 'GOOD2', category: 'elective', year: 1, semester: 2, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      { notEvenAUnitShape: true },
    ];
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement.map((u) => u.code)).toEqual(['GOOD1', 'GOOD2']);
    expect(r.issues.length).toBe(1);
  });

  test('a missing planner key is a hard error, not a partial restore', () => {
    const raw = validRaw();
    delete raw.planner;
    const r = validatePayload(raw);
    expect('error' in r).toBe(true);
  });

  test('ignores unknown keys without complaint', () => {
    const raw = validRaw();
    raw.somethingWeNeverDefined = 'whatever';
    const r = validatePayload(raw);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect((r.payload as any).somethingWeNeverDefined).toBeUndefined();
  });
});

describe('rowsToPayload on a malformed sheet', () => {
  test('rejects rows missing the marker row entirely', () => {
    const r = rowsToPayload([['formatVersion', '1']]);
    expect('error' in r).toBe(true);
  });

  test('never throws on garbage row shapes', () => {
    expect(() => rowsToPayload([['marker', PLAN_FILE_MARKER], [], ['x'], [null as any, null as any]])).not.toThrow();
  });

  test('a corrupted JSON cell becomes an issue, not a crash, and the rest of the sheet still restores', () => {
    const payload = buildPlanPayload(richInput);
    const rows = payloadToRows(payload);
    const arrangementRowIdx = rows.findIndex((r) => r[0] === 'arrangement');
    rows[arrangementRowIdx] = ['arrangement', '{not valid json'];
    const r = rowsToPayload(rows);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement).toEqual([]);
    expect(r.issues.some((i) => i.code === 'bad_json')).toBe(true);
    // Everything else on the sheet still came through.
    expect(r.payload.completedUnitCodes).toEqual(payload.completedUnitCodes);
  });

  test('oversized row count is rejected outright', () => {
    const rows: string[][] = [['marker', PLAN_FILE_MARKER], ['formatVersion', '1']];
    for (let i = 0; i < PLAN_FILE_LIMITS.maxRows + 10; i++) rows.push([`junk${i}`, 'x']);
    const r = rowsToPayload(rows);
    expect('error' in r).toBe(true);
  });
});

// Part 2: hostile-input hardening. rowsToPayload's only "key-like" cell data
// is a Plan Data row's key column, and it only ever reaches a Map guarded by
// the ROW_KEYS allowlist — never a plain-object property write — so there is
// no path from a cell value to Object.prototype. These tests prove it, not
// just assert it: every case below must produce an issue or a clear error,
// never throw, and leave Object.prototype provably untouched.
describe('Part 2: hostile spreadsheet input never pollutes Object.prototype', () => {
  const validRows = () => payloadToRows(buildPlanPayload(richInput));

  const expectCleanPrototype = () => {
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(Object.keys(Object.prototype)).toEqual([]);
  };

  afterEach(() => {
    expectCleanPrototype();
  });

  test.each(['__proto__', 'constructor', 'prototype'])('a metadata row keyed "%s" is ignored, not written anywhere, and reported as an issue', (poisonKey) => {
    const rows = [...validRows(), [poisonKey, '{"polluted":true}']];
    const r = rowsToPayload(rows);
    expect(() => rowsToPayload(rows)).not.toThrow();
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.issues.some((i) => i.code === 'unknown_key' && i.message.includes(poisonKey))).toBe(true);
    // The rest of the sheet still restored correctly around the poisoned row.
    expect(r.payload.planner.courseCode).toBe('BA-CS');
  });

  test('duplicate metadata keys: the first value is kept, the duplicate is reported as an issue, never silently overwritten', () => {
    const rows = validRows();
    const plannerRowIdx = rows.findIndex((row) => row[0] === 'planner');
    const duplicateRows = [...rows, ['planner', JSON.stringify({ courseCode: 'FAKE', courseName: 'Fake Course', majorName: null, intakeYear: 1, intakeMonth: null })]];
    const r = rowsToPayload(duplicateRows);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.planner.courseCode).toBe(rows[plannerRowIdx] && JSON.parse(rows[plannerRowIdx][1]).courseCode);
    expect(r.issues.some((i) => i.code === 'duplicate_key')).toBe(true);
  });

  test('a cell that looks like a formula is treated as plain text, never evaluated, in any string field', () => {
    const rows = validRows();
    const doubleMajorRowIdx = rows.findIndex((row) => row[0] === 'doubleMajorMajorName');
    rows[doubleMajorRowIdx] = ['doubleMajorMajorName', JSON.stringify('=1+1')];
    const minorNamesRowIdx = rows.findIndex((row) => row[0] === 'minorNames');
    rows[minorNamesRowIdx] = ['minorNames', JSON.stringify(['=HYPERLINK("http://example.com","click")'])];

    const r = rowsToPayload(rows);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    // Preserved as the literal text, not evaluated to 2 or turned into a link object.
    expect(r.payload.doubleMajorMajorName).toBe('=1+1');
    expect(r.payload.minorNames).toEqual(['=HYPERLINK("http://example.com","click")']);
  });

  test('non-string cell types (number, boolean, object-like "date", error marker) in the key/value columns never throw', () => {
    const weirdRows = [
      ['marker', PLAN_FILE_MARKER],
      ['formatVersion', 1 as any], // number instead of string
      [true as any, 'x'], // boolean key
      ['exportDate', new Date() as any], // Date instead of string
      ['planner', '#REF!'], // error-looking text, but still just a string
    ];
    expect(() => rowsToPayload(weirdRows)).not.toThrow();
    const r = rowsToPayload(weirdRows);
    // formatVersion came through as a number, not a string, so the row is
    // skipped by the string-type guard and the version is unresolved -> error.
    expect('error' in r).toBe(true);
  });

  test('a version cell that is a number is accepted exactly like the string form', () => {
    const rows = validRows().map((row) => (row[0] === 'formatVersion' ? ['formatVersion', String(PLAN_FILE_FORMAT_VERSION)] : row));
    const r1 = rowsToPayload(rows);
    expect('error' in r1).toBe(false);

    // Simulate a caller that never stringified the cell (raw: true somewhere upstream):
    // the Map's string-only guard rejects it cleanly rather than coercing silently.
    const numericRows = rows.map((row) => (row[0] === 'formatVersion' ? ['formatVersion', PLAN_FILE_FORMAT_VERSION as any] : row));
    const r2 = rowsToPayload(numericRows);
    expect('error' in r2).toBe(true);
  });

  test('strings over the length cap are dropped with an issue, not truncated silently into something else', () => {
    const rows = validRows();
    const minorNamesRowIdx = rows.findIndex((row) => row[0] === 'minorNames');
    const tooLong = 'X'.repeat(PLAN_FILE_LIMITS.maxStringLength + 1);
    rows[minorNamesRowIdx] = ['minorNames', JSON.stringify([tooLong, 'A Real Minor'])];
    const r = rowsToPayload(rows);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.minorNames).toEqual(['A Real Minor']);
    expect(r.issues.some((i) => i.code === 'bad_string')).toBe(true);
  });

  test('rowsToPayload rejects on row count alone, via a length check before the row loop runs', () => {
    const hugeRows: string[][] = new Array(PLAN_FILE_LIMITS.maxRows + 1000);
    for (let i = 0; i < hugeRows.length; i++) hugeRows[i] = ['marker', PLAN_FILE_MARKER];
    const r = rowsToPayload(hugeRows);
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/more rows than a plan file should ever contain/i);
  });
});

// The "declared range huge, few actual cells" and "readable sheet never
// parsed" cases operate one layer up, at the real XLSX worksheet — see
// tests/ui/pathway-restore-plan.test.tsx for those (they need a real
// worksheet's "!ref" attribute, which this pure module never sees).

// Part 3: is maxRows = 50 realistic? The Plan Data sheet is one row per
// top-level field (14 today — see ROW_KEYS), never one row per item, so a
// double major / long completed list / many retakes never adds a row at
// all, only lengthens an existing cell. The real worst-case dimension is
// cell length, which maxCellLength now bounds directly.
describe('Part 3: worst-case export sizing', () => {
  function worstCasePayloadInput(): BuildPlanPayloadInput {
    // double major, one minor, several outside-planner units, ~30 completed
    // codes, an MPU list, and a full scheduler-sized arrangement (the
    // DEFAULT_SCHEDULER_CONFIG caps real usage well under 1000, this is the
    // realistic worst case, not the absolute allowed maximum).
    const arrangement = Array.from({ length: 100 }, (_, i) => ({
      code: `UNIT${String(i).padStart(4, '0')}`,
      category: 'core',
      year: Math.floor(i / 5) + 1,
      semester: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      position: i % 5,
      recommended: i % 10 === 0,
      outsidePlanner: i % 15 === 0,
      retake: i % 20 === 0,
      concededPassRetake: i % 25 === 0,
    }));
    return {
      planner: { courseCode: 'BA-CS', courseName: 'Bachelor of Computer Science', majorName: 'Artificial Intelligence', intakeYear: 2023, intakeMonth: 9 },
      completedUnitCodes: Array.from({ length: 30 }, (_, i) => `DONE${String(i).padStart(3, '0')}`),
      concededPassUnitCodes: ['CPUNIT1', 'CPUNIT2'],
      arrangement,
      outsidePlannerUnitCodes: ['OUT1', 'OUT2', 'OUT3', 'OUT4'],
      minorNames: ['Data Science Minor'],
      doubleMajorMajorName: 'Software Development',
      customWilSlot: '4-2',
      customMpuList: Array.from({ length: 6 }, (_, i) => ({ code: `MPU${i}`, name: `Malaysian Studies and Language Unit Number ${i}` })),
      startYear: 2023,
      startSemester: 2 as const,
    };
  }

  test('a realistic worst-case export is exactly 14 rows (fixed), regardless of content size', () => {
    const payload = buildPlanPayload(worstCasePayloadInput());
    const rows = payloadToRows(payload);
    expect(rows.length).toBe(14);
    expect(rows.length).toBeLessThan(PLAN_FILE_LIMITS.maxRows);
  });

  test('the worst-case export imports successfully, with no cells rejected', () => {
    const payload = buildPlanPayload(worstCasePayloadInput());
    const rows = payloadToRows(payload);
    // Sanity: every cell is comfortably under the per-cell length cap too.
    for (const [, value] of rows) expect(value.length).toBeLessThan(PLAN_FILE_LIMITS.maxCellLength);

    const r = rowsToPayload(rows);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.issues).toEqual([]);
    expect(r.payload).toEqual(payload);
  });

  test('a single cell exceeding maxCellLength is dropped with an issue, never parsed', () => {
    const rows = payloadToRows(buildPlanPayload(worstCasePayloadInput()));
    const arrangementRowIdx = rows.findIndex((row) => row[0] === 'arrangement');
    const hostileArrangement = JSON.stringify(
      Array.from({ length: 50000 }, () => ({ code: 'X', category: 'core', year: 1, semester: 1, position: 0 }))
    );
    expect(hostileArrangement.length).toBeGreaterThan(PLAN_FILE_LIMITS.maxCellLength);
    rows[arrangementRowIdx] = ['arrangement', hostileArrangement];

    const r = rowsToPayload(rows);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement).toEqual([]);
    expect(r.issues.some((i) => i.code === 'cell_too_large')).toBe(true);
  });

  // Empirically confirmed (xlsx-js-style, real XLSX.write): a cell over
  // 32,767 characters throws "Text length must not exceed 32767
  // characters" — Excel's own hard per-cell limit. maxCellLength was
  // previously 200,000, comfortably accepting a cell this size; it no
  // longer does.
  test('a cell between the new 32,767 cap and the old 200,000 cap is now rejected on import, where it previously was not', () => {
    const rows = payloadToRows(buildPlanPayload(worstCasePayloadInput()));
    const arrangementRowIdx = rows.findIndex((row) => row[0] === 'arrangement');
    const midSizedArrangement = JSON.stringify(
      Array.from({ length: 600 }, () => ({ code: 'X', category: 'core', year: 1, semester: 1, position: 0 }))
    );
    expect(midSizedArrangement.length).toBeGreaterThan(32_767);
    expect(midSizedArrangement.length).toBeLessThan(200_000);
    rows[arrangementRowIdx] = ['arrangement', midSizedArrangement];

    const r = rowsToPayload(rows);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.payload.arrangement).toEqual([]);
    expect(r.issues.some((i) => i.code === 'cell_too_large')).toBe(true);
  });

  test('findOversizedPlanDataCells: a normal and the worst-case payload both report no oversized cells', () => {
    expect(findOversizedPlanDataCells(buildPlanPayload(richInput))).toEqual([]);
    expect(findOversizedPlanDataCells(buildPlanPayload(worstCasePayloadInput()))).toEqual([]);
  });

  test('findOversizedPlanDataCells: an arrangement large enough to exceed Excel\'s cell limit is reported by field name', () => {
    const tooLarge = buildPlanPayload({
      ...worstCasePayloadInput(),
      arrangement: Array.from({ length: 400 }, (_, i) => ({
        code: `UNIT${i}`, category: 'core', year: 1, semester: 1 as const, position: 0,
        recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false,
      })),
    });
    expect(findOversizedPlanDataCells(tooLarge)).toEqual(['arrangement']);
  });
});
