// ============================================================
// Ephemeral, in-memory store for per-student EstimationRecords, built
// during a class-estimation scrape run. Follows the same globalThis
// singleton pattern already used by portalSessionService.ts and
// web/app/api/scraper/store.ts, so records survive Next.js dev-mode
// HMR module reloads. Nothing here persists across server restarts,
// and every new run wipes whatever the previous run collected.
// ============================================================

import type { EstimationRecord } from '../../shared/types/classEstimation';

declare global {
  // eslint-disable-next-line no-var
  var __estimationRecords: EstimationRecord[] | undefined;
}

if (!globalThis.__estimationRecords) {
  globalThis.__estimationRecords = [];
}

export function resetEstimationRecords(): void {
  globalThis.__estimationRecords = [];
}

export function pushEstimationRecord(record: EstimationRecord): void {
  globalThis.__estimationRecords!.push(record);
}

export function getEstimationRecords(): EstimationRecord[] {
  return globalThis.__estimationRecords ?? [];
}
