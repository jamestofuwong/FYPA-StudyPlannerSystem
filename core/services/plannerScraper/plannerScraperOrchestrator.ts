/**
 * plannerScraperOrchestrator.ts
 *
 * High-level workflows composed from individual steps. Callers pick the
 * workflow that matches their intent — each is independently usable.
 *
 * Available workflows:
 *
 *   checkForUpdates()      — Scrape the index, diff against DB records.
 *                            Does NOT download or parse PDFs. Fast.
 *                            Use case: scheduler checking daily if anything changed.
 *
 *   syncUpdatedPlanners()  — checkForUpdates, then download + parse only
 *                            new and changed planners.
 *                            Use case: standard scheduled daily sync.
 *
 *   forceResyncAll()       — Scrape index, download + parse every planner
 *                            regardless of diff. Ignores stored records.
 *                            Use case: full re-index after a schema change.
 *
 *   downloadAndParse()     — Download + parse a single specific planner entry.
 *                            Use case: manual re-trigger from the admin UI.
 *
 * All workflows follow the same callback contract as scraperOrchestrator.ts
 * in the local app: onLog, onStep, onProgress.
 */

import {
  runStep,
  diffEntries,
  PLANNER_INDEX_URL,
  STEP_LABELS,
} from './plannerScraperService';
import type { BrowserAdapter } from './plannerScraperAdapter';
import type {
  ScraperCallbacks,
  ScraperStepId,
  StoredPlannerRecord,
  PlannerIndexEntry,
  PlannerDiff,
  CheckUpdatesResult,
  SyncResult,
} from './types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function log(cb: ScraperCallbacks, ...msgs: string[]) {
  cb.onLog(msgs);
}

function step(cb: ScraperCallbacks, id: ScraperStepId) {
  cb.onStep(id, STEP_LABELS[id]);
}

/**
 * Run the shared index-scraping preamble (navigate → wait → detect → scrape).
 * Returns the list of scraped entries, or throws on any step failure.
 */
async function runIndexScrape(
  adapter: BrowserAdapter,
  cb: ScraperCallbacks,
  indexUrl?: string,
): Promise<PlannerIndexEntry[]> {
  // Step 1: navigate
  step(cb, 'navigate-to-index');
  const navResult = await runStep('navigate-to-index', adapter, { indexUrl });
  log(cb, ...navResult.logs);
  if (!navResult.success) throw new Error(navResult.error ?? 'Navigation failed');

  // Step 2: wait for content
  step(cb, 'wait-for-content');
  const waitResult = await runStep('wait-for-content', adapter, { waitTimeoutMs: 20_000 });
  log(cb, ...waitResult.logs);
  if (!waitResult.success) throw new Error(waitResult.error ?? 'Content did not load');

  // Step 3: detect year tabs
  step(cb, 'detect-year-tabs');
  const detectResult = await runStep('detect-year-tabs', adapter);
  log(cb, ...detectResult.logs);
  if (!detectResult.success) throw new Error(detectResult.error ?? 'Tab detection failed');

  // Step 4: scrape index
  step(cb, 'scrape-planner-index');
  const scrapeResult = await runStep('scrape-planner-index', adapter);
  log(cb, ...scrapeResult.logs);
  if (!scrapeResult.success) throw new Error(scrapeResult.error ?? 'Scrape failed');

  const data = scrapeResult.data as { entries: PlannerIndexEntry[] };
  return data.entries;
}

/**
 * Download + parse a single entry. Returns true on full success, false if
 * either sub-step failed (errors are logged via callback).
 */
async function downloadAndParseOne(
  adapter: BrowserAdapter,
  entry: PlannerIndexEntry,
  destDir: string,
  cb: ScraperCallbacks,
): Promise<boolean> {
  // Download
  step(cb, 'download-pdf');
  const dlResult = await runStep('download-pdf', adapter, {
    downloadOptions: { entry, destDir },
  });
  log(cb, ...dlResult.logs);
  if (!dlResult.success) return false;

  const dlData = dlResult.data as { filePath: string };

  // Parse
  step(cb, 'parse-planner-pdf');
  const parseResult = await runStep('parse-planner-pdf', adapter, {
    pdfFilePath: dlData.filePath,
    plannerMeta: {
      unitCode: entry.unitCode,
      courseName: entry.courseName,
      intakeMonth: entry.intakeMonth,
      year: entry.year,
    },
  });
  log(cb, ...parseResult.logs);
  return parseResult.success;
}

// ---------------------------------------------------------------------------
// Workflow 1: checkForUpdates
// ---------------------------------------------------------------------------

/**
 * Visits the planner index, scrapes all entries, then diffs them against the
 * provided stored records. Does NOT download or parse any PDFs.
 *
 * @param adapter       Browser adapter instance (already created by caller)
 * @param storedRecords Records already in the DB (pdfUrl + lastUpdated)
 * @param cb            Progress callbacks
 * @param indexUrl      Override the default planner index URL (useful for testing)
 */
export async function checkForUpdates(
  adapter: BrowserAdapter,
  storedRecords: StoredPlannerRecord[],
  cb: ScraperCallbacks,
  indexUrl: string = PLANNER_INDEX_URL,
): Promise<CheckUpdatesResult> {
  log(cb, `→ [checkForUpdates] Starting — comparing against ${storedRecords.length} stored record(s)`);

  let entries: PlannerIndexEntry[];
  try {
    entries = await runIndexScrape(adapter, cb, indexUrl);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(cb, `✗ [checkForUpdates] Aborted: ${error}`);
    throw e;
  }

  const diff = diffEntries(entries, storedRecords);

  log(cb,
    `✓ [checkForUpdates] Done.`,
    `   New: ${diff.newEntries.length}`,
    `   Updated: ${diff.updatedEntries.length}`,
    `   Unchanged: ${diff.unchangedEntries.length}`,
  );

  return { diff, totalScraped: entries.length };
}

// ---------------------------------------------------------------------------
// Workflow 2: syncUpdatedPlanners
// ---------------------------------------------------------------------------

/**
 * Checks for updates, then downloads and parses only the new and updated
 * planners. Unchanged planners are skipped.
 *
 * @param adapter       Browser adapter
 * @param storedRecords Records already in the DB
 * @param destDir       Directory to write downloaded PDFs to
 * @param cb            Progress callbacks
 * @param indexUrl      Override the default planner index URL
 */
export async function syncUpdatedPlanners(
  adapter: BrowserAdapter,
  storedRecords: StoredPlannerRecord[],
  destDir: string,
  cb: ScraperCallbacks,
  indexUrl: string = PLANNER_INDEX_URL,
): Promise<SyncResult> {
  log(cb, '→ [syncUpdatedPlanners] Starting');

  // Phase 1: determine what needs updating
  const { diff } = await checkForUpdates(adapter, storedRecords, cb, indexUrl);
  const toProcess: PlannerIndexEntry[] = [...diff.newEntries, ...diff.updatedEntries];

  if (toProcess.length === 0) {
    log(cb, '✓ [syncUpdatedPlanners] Nothing to sync — all planners are up to date');
    return { attempted: 0, succeeded: 0, failed: [] };
  }

  log(cb, `→ [syncUpdatedPlanners] Processing ${toProcess.length} planner(s)`);

  // Phase 2: download + parse each
  const result: SyncResult = { attempted: toProcess.length, succeeded: 0, failed: [] };

  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i];
    cb.onProgress?.(i + 1, toProcess.length, `${entry.unitCode} — ${entry.intakeMonth}`);

    log(cb, `→ [${i + 1}/${toProcess.length}] ${entry.unitCode} · ${entry.courseName} · ${entry.intakeMonth}`);

    try {
      const ok = await downloadAndParseOne(adapter, entry, destDir, cb);
      if (ok) {
        result.succeeded++;
        log(cb, `✓ [${i + 1}/${toProcess.length}] Completed`);
      } else {
        result.failed.push({ entry, error: 'Step failed — see logs above' });
        log(cb, `✗ [${i + 1}/${toProcess.length}] Failed`);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      result.failed.push({ entry, error });
      log(cb, `✗ [${i + 1}/${toProcess.length}] Error: ${error}`);
    }
  }

  log(cb,
    `✓ [syncUpdatedPlanners] Done. ${result.succeeded}/${result.attempted} succeeded.`,
    result.failed.length > 0
      ? `   Failed: ${result.failed.map(f => f.entry.unitCode).join(', ')}`
      : '',
  );

  return result;
}

// ---------------------------------------------------------------------------
// Workflow 3: forceResyncAll
// ---------------------------------------------------------------------------

/**
 * Scrapes the index and re-downloads + re-parses every planner, regardless
 * of whether it has changed. Use this to rebuild the entire database.
 *
 * @param adapter   Browser adapter
 * @param destDir   Directory to write downloaded PDFs to
 * @param cb        Progress callbacks
 * @param indexUrl  Override the default planner index URL
 */
export async function forceResyncAll(
  adapter: BrowserAdapter,
  destDir: string,
  cb: ScraperCallbacks,
  indexUrl: string = PLANNER_INDEX_URL,
): Promise<SyncResult> {
  log(cb, '→ [forceResyncAll] Starting full re-sync (all planners will be re-downloaded)');

  let entries: PlannerIndexEntry[];
  try {
    entries = await runIndexScrape(adapter, cb, indexUrl);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(cb, `✗ [forceResyncAll] Aborted: ${error}`);
    throw e;
  }

  log(cb, `→ [forceResyncAll] Processing all ${entries.length} planner(s)`);

  const result: SyncResult = { attempted: entries.length, succeeded: 0, failed: [] };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    cb.onProgress?.(i + 1, entries.length, `${entry.unitCode} — ${entry.intakeMonth}`);

    log(cb, `→ [${i + 1}/${entries.length}] ${entry.unitCode} · ${entry.courseName} · ${entry.intakeMonth}`);

    try {
      const ok = await downloadAndParseOne(adapter, entry, destDir, cb);
      if (ok) {
        result.succeeded++;
      } else {
        result.failed.push({ entry, error: 'Step failed — see logs above' });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      result.failed.push({ entry, error });
      log(cb, `✗ [${i + 1}/${entries.length}] Error: ${error}`);
    }
  }

  log(cb, `✓ [forceResyncAll] Done. ${result.succeeded}/${result.attempted} succeeded.`);
  return result;
}

// ---------------------------------------------------------------------------
// Workflow 4: downloadAndParse (single entry)
// ---------------------------------------------------------------------------

/**
 * Downloads and parses a single planner entry. Intended for manual re-triggers
 * from the admin UI (e.g. "Re-parse this planner").
 *
 * @param adapter  Browser adapter
 * @param entry    The planner index entry to process
 * @param destDir  Directory to write the downloaded PDF to
 * @param cb       Progress callbacks
 */
export async function downloadAndParse(
  adapter: BrowserAdapter,
  entry: PlannerIndexEntry,
  destDir: string,
  cb: ScraperCallbacks,
): Promise<SyncResult> {
  log(cb, `→ [downloadAndParse] ${entry.unitCode} · ${entry.courseName} · ${entry.intakeMonth}`);

  const result: SyncResult = { attempted: 1, succeeded: 0, failed: [] };

  try {
    const ok = await downloadAndParseOne(adapter, entry, destDir, cb);
    if (ok) {
      result.succeeded = 1;
      log(cb, '✓ [downloadAndParse] Done');
    } else {
      result.failed.push({ entry, error: 'Step failed — see logs above' });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    result.failed.push({ entry, error });
    log(cb, `✗ [downloadAndParse] Error: ${error}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Re-export types for callers
// ---------------------------------------------------------------------------

export type { PlannerDiff, CheckUpdatesResult, SyncResult, ScraperCallbacks, PlannerIndexEntry };
