// ============================================================
// Tests for core/services/classEstimation/estimationStore.ts.
// This is the ephemeral, in-memory store that replaced the old inline globalThis.__estimationResults block
// that used to live directly in web/app/api/class-estimation/run/route.ts. It follows the same globalThis
// singleton pattern as portalSessionService.ts, so these tests just check the reset/push/get contract directly.
// ============================================================

import { resetEstimationRecords, pushEstimationRecord, getEstimationRecords } from '@core/services/classEstimation/estimationStore';
import type { EstimationRecord } from '@shared/types/classEstimation';

// A minimal fake record, only studentId matters for these tests, the rest is filler to satisfy the type.
function record(studentId: string): EstimationRecord {
  return {
    studentId, name: 'Test Student', dbId: 1, enrollId: 1,
    scraped: {} as never, rawInput: {} as never, unitStates: new Map(), mappingWarnings: [],
  };
}

describe('estimationStore', () => {
  // Every test starts from a clean slate, since the store is a shared globalThis singleton across the whole test file.
  beforeEach(() => resetEstimationRecords());

  test('starts empty after a reset', () => {
    expect(getEstimationRecords()).toEqual([]);
  });

  test('push adds a record, visible via getEstimationRecords', () => {
    pushEstimationRecord(record('S1'));
    expect(getEstimationRecords()).toHaveLength(1);
    expect(getEstimationRecords()[0].studentId).toBe('S1');
  });

  test('reset clears whatever was pushed before', () => {
    pushEstimationRecord(record('S1'));
    resetEstimationRecords();
    expect(getEstimationRecords()).toEqual([]);
  });

  // Order matters downstream, the SSE progress events sent to the class-estimation page are emitted in scrape order,
  // so the stored records should come back in that same order too.
  test('preserves push order across multiple calls', () => {
    pushEstimationRecord(record('S1'));
    pushEstimationRecord(record('S2'));
    expect(getEstimationRecords().map((r) => r.studentId)).toEqual(['S1', 'S2']);
  });
});
