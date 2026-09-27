// ============================================================
// Tests for core/services/classEstimation/studentGrouping.ts and retention.ts, Phase 7.
//
// Grouping is only ever allowed to be an optimisation, so the tests are shaped around one question: can two
// students end up sharing a result when they deserved different ones? Every field the pipeline reads gets a
// test proving it splits a group, because a missing field would not crash anything. It would hand one
// student another's answer and the estimate would just be quietly wrong.
//
// The reverse matters less but is still checked: fields the pipeline never reads must NOT split a group, or
// the batching stops saving anything.
// ============================================================

import {
  groupIdenticalStudents,
  groupingKeyFor,
  summariseGrouping,
} from '@core/services/classEstimation/studentGrouping';
import {
  applyRetention,
  resolveRetentionRate,
  projectUnit,
} from '@core/services/classEstimation/retention';
import type { EstimationRecord } from '@shared/types/classEstimation';

function record(overrides: Partial<EstimationRecord> = {}, rawOverrides: Record<string, unknown> = {}): EstimationRecord {
  return {
    studentId: '102780000',
    source: 'mock',
    name: 'Student A',
    transcript: [],
    totalCreditsEarned: 37.5,
    concededPassUnitCodes: [],
    scheduledUnits: [],
    appliedAliases: [],
    unitStates: new Map(),
    mappingWarnings: [],
    rawInput: {
      studentID: '102780000',
      courseType: 'degree',
      intakeYear: 2024,
      intakeSemester: 1,
      currentSemester: 1,
      completedUnitCodes: ['COS10009', 'COS20007'],
      hasWIL: true,
      ...rawOverrides,
    },
    ...overrides,
  } as EstimationRecord;
}

describe('groupingKeyFor', () => {
  test('two students in the same situation share a key', () => {
    expect(groupingKeyFor(record())).toBe(groupingKeyFor(record()));
  });

  // The student's own ID is the one rawInput field the pipeline does not act on, so it must not split.
  test('identity does not split a group', () => {
    const other = record(
      { studentId: '102780999', name: 'Someone Else' },
      { studentID: '102780999' },
    );
    expect(groupingKeyFor(other)).toBe(groupingKeyFor(record()));
  });

  // Every one of these changes what the pipeline returns, so every one has to split the group.
  test.each([
    ['courseType',      { courseType: 'diploma' }],
    ['intakeYear',      { intakeYear: 2025 }],
    ['intakeSemester',  { intakeSemester: 2 }],
    ['currentSemester', { currentSemester: 2 }],
    ['hasWIL',          { hasWIL: false }],
    ['manualOverride',  { manualOverride: 'some-planner-id' }],
    ['completedUnits',  { completedUnitCodes: ['COS10009'] }],
  ])('%s splits a group', (_label, rawOverrides) => {
    expect(groupingKeyFor(record({}, rawOverrides))).not.toBe(groupingKeyFor(record()));
  });

  // Credit-point requisites read this, so two students with the same units but different earned credit,
  // which happens when one of them holds a Conceded Pass or a zero-credit module, are different cases.
  test('credits earned splits a group', () => {
    expect(groupingKeyFor(record({ totalCreditsEarned: 25 }))).not.toBe(groupingKeyFor(record()));
  });

  // A Conceded Pass earns credit but cannot satisfy a requisite, so it changes what a student can take
  // next even though the unit appears in both students' completed lists.
  test('a conceded pass splits a group', () => {
    const conceded = record({ concededPassUnitCodes: ['COS10009'] });
    expect(groupingKeyFor(conceded)).not.toBe(groupingKeyFor(record()));
  });

  // Display-only fields. If these split groups, batching saves nothing on a real cohort, where portal
  // course strings and credit figures vary between students in the same academic position.
  test('display-only differences do not split a group', () => {
    const different = record({
      name: 'Another Name',
      source: 'import',
      mappingWarnings: ['some warning'],
      scraped: { course: 'A different course string', creditsCompleted: 999 } as never,
      transcript: [{ courseId: 'COS10009' }] as never,
      scheduledUnits: [{ code: 'COS30008', term: '2027_MAR_S1' }],
    });
    expect(groupingKeyFor(different)).toBe(groupingKeyFor(record()));
  });

  // Two transcripts listing the same units differently are the same case, and must not be split by
  // something as incidental as row order or a stray space.
  test('unit order, case and padding do not split a group', () => {
    const messy = record({}, { completedUnitCodes: ['  cos20007', 'COS10009 '] });
    expect(groupingKeyFor(messy)).toBe(groupingKeyFor(record()));
  });

  test('a repeated unit code does not split a group', () => {
    const repeated = record({}, { completedUnitCodes: ['COS10009', 'COS20007', 'COS10009'] });
    expect(groupingKeyFor(repeated)).toBe(groupingKeyFor(record()));
  });
});

describe('groupIdenticalStudents', () => {
  test('collapses identical students and keeps every member', () => {
    const records = [record(), record({ studentId: 'B' }), record({ studentId: 'C' })];

    const groups = groupIdenticalStudents(records);

    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
    expect(groups[0].representative).toBe(records[0]);
    expect(groups[0].members.map((m) => m.studentId)).toEqual(['102780000', 'B', 'C']);
  });

  test('keeps genuinely different students apart', () => {
    const groups = groupIdenticalStudents([
      record(),
      record({ studentId: 'B' }, { intakeYear: 2025 }),
      record({ studentId: 'C' }, { hasWIL: false }),
    ]);

    expect(groups).toHaveLength(3);
    for (const group of groups) expect(group.members).toHaveLength(1);
  });

  // Group order and member order both follow the input, so two runs over the same records give the same
  // answer rather than one that depends on hash iteration order.
  test('order follows the input', () => {
    const groups = groupIdenticalStudents([
      record({ studentId: 'A' }, { intakeYear: 2025 }),
      record({ studentId: 'B' }),
      record({ studentId: 'C' }, { intakeYear: 2025 }),
    ]);

    expect(groups.map((g) => g.members.map((m) => m.studentId))).toEqual([['A', 'C'], ['B']]);
  });

  test('an empty cohort produces no groups', () => {
    expect(groupIdenticalStudents([])).toEqual([]);
  });
});

describe('summariseGrouping', () => {
  test('reports how much work the grouping saved', () => {
    const groups = groupIdenticalStudents([
      record({ studentId: 'A' }),
      record({ studentId: 'B' }),
      record({ studentId: 'C' }),
      record({ studentId: 'D' }, { intakeYear: 2025 }),
    ]);

    // Four students, two distinct situations: two pipeline runs saved out of four.
    expect(summariseGrouping(groups)).toEqual({
      students: 4,
      groups: 2,
      largestGroup: 3,
      workSaved: 0.5,
    });
  });

  test('all-distinct students save nothing', () => {
    const groups = groupIdenticalStudents([
      record({ studentId: 'A' }),
      record({ studentId: 'B' }, { intakeYear: 2025 }),
    ]);

    expect(summariseGrouping(groups).workSaved).toBe(0);
  });

  test('an empty cohort does not divide by zero', () => {
    expect(summariseGrouping([])).toEqual({ students: 0, groups: 0, largestGroup: 0, workSaved: 0 });
  });
});

// ====== Retention ============================================================================

describe('resolveRetentionRate', () => {
  test.each([[0], [0.5], [0.85], [1]])('%p is a usable rate', (rate) => {
    expect(resolveRetentionRate(rate, 0.85)).toBe(rate);
  });

  // A rate above 1 would invent students and a negative one would subtract them. This figure arrives from a
  // config value or a query parameter, so it cannot be assumed sane. Falling back beats either.
  test.each([[1.5], [-0.1], [NaN], [Infinity], ['0.9'], [null], [undefined], [{}]])(
    '%p falls back to the default',
    (rate) => {
      expect(resolveRetentionRate(rate, 0.85)).toBe(0.85);
    },
  );
});

describe('applyRetention', () => {
  test('discounts a figure by the rate', () => {
    expect(applyRetention(100, 0.85)).toBeCloseTo(85, 10);
    expect(applyRetention(40, 1)).toBe(40);
    expect(applyRetention(40, 0)).toBe(0);
  });

  // Rounding belongs at the very end, once, so this has to stay fractional however awkward the figure.
  test('leaves the result unrounded', () => {
    expect(applyRetention(7, 0.85)).toBeCloseTo(5.95, 10);
  });
});

describe('projectUnit', () => {
  test('adds named picks and elective shares, then discounts', () => {
    const projection = projectUnit('COS10004', 40, 3.5, 0.85);

    expect(projection).toEqual({
      code: 'COS10004',
      fromNamedPicks: 40,
      fromElectives: 3.5,
      beforeRetention: 43.5,
      projected: 43.5 * 0.85,
    });
  });

  // Applying the rate once to the total is the same as applying it to each part, and this pins that so a
  // later refactor cannot start discounting one side twice.
  test('discounting the total matches discounting each part', () => {
    const projection = projectUnit('X', 12, 4.25, 0.7);
    expect(projection.projected).toBeCloseTo(12 * 0.7 + 4.25 * 0.7, 10);
  });

  test('a unit reached only through an elective pool still projects', () => {
    expect(projectUnit('POOL1', 0, 2, 0.85).projected).toBeCloseTo(1.7, 10);
  });
});
