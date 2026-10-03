import {
  PLAN_FILE_FORMAT_VERSION,
  PLAN_FILE_MARKER,
  PLAN_FILE_LIMITS,
  buildPlanPayload,
  payloadToRows,
  rowsToPayload,
  validatePayload,
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
