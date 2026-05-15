/**
 * plannerScraperService.ts
 *
 * Defines each scraper step and exposes runStep() — the atomic execution unit,
 * mirroring runScraperStep() in advisorScraperService.ts.
 *
 * Each step:
 *   - Has a human-readable label
 *   - Returns a typed StepResult<T>
 *   - Handles its own errors and wraps them in StepResult.error
 *   - Appends prefixed log lines (✓ success, ✗ error, → info)
 *
 * Steps do NOT call each other — composition is the orchestrator's job.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BrowserAdapter } from './plannerScraperAdapter';
import {
  WAIT_FOR_CONTENT_JS,
  DETECT_YEAR_TABS_JS,
  SCRAPE_PLANNER_INDEX_JS,
  VERIFY_PDF_LINK_JS,
} from './plannerScraperScripts';
import type {
  ScraperStepId,
  StepResult,
  RunStepOptions,
  DetectedTabs,
  ScrapeIndexResult,
  PlannerDiff,
  PlannerIndexEntry,
  DownloadPdfResult,
  StoredPlannerRecord,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PLANNER_INDEX_URL =
  'https://www.swinburne.edu.my/current-students/get-started/program-study-planner/';

export const STEP_LABELS: Record<ScraperStepId, string> = {
  'navigate-to-index':    'Navigating to planner index page',
  'wait-for-content':     'Waiting for page content to load',
  'detect-year-tabs':     'Detecting year tabs',
  'scrape-planner-index': 'Scraping planner index',
  'download-pdf':         'Downloading PDF',
  'parse-planner-pdf':    'Parsing PDF',
};

// ---------------------------------------------------------------------------
// Step implementations
// ---------------------------------------------------------------------------

async function stepNavigateToIndex(
  adapter: BrowserAdapter,
  opts: RunStepOptions,
): Promise<StepResult<{ url: string }>> {
  const logs: string[] = [];
  const url = opts.indexUrl ?? PLANNER_INDEX_URL;

  try {
    logs.push(`→ Navigating to ${url}`);
    await adapter.navigate(url, 'domcontentloaded');
    const landed = adapter.getURL();
    logs.push(`✓ Landed on: ${landed}`);
    return { success: true, logs, data: { url: landed } };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logs.push(`✗ Navigation failed: ${error}`);
    return { success: false, logs, error };
  }
}

// ---------------------------------------------------------------------------

async function stepWaitForContent(
  adapter: BrowserAdapter,
  opts: RunStepOptions,
): Promise<StepResult<{ tabCount: number }>> {
  const logs: string[] = [];
  const timeoutMs = opts.waitTimeoutMs ?? 15_000;

  try {
    logs.push(`→ Polling for .tab_container elements (timeout: ${timeoutMs}ms)`);

    type WaitResult = { success: boolean; tabCount?: number; error?: string };
    const result = await adapter.evaluate<WaitResult>(WAIT_FOR_CONTENT_JS(timeoutMs));

    if (!result.success) {
      logs.push(`✗ ${result.error}`);
      return { success: false, logs, error: result.error };
    }

    logs.push(`✓ Found ${result.tabCount} tab_container element(s)`);
    return { success: true, logs, data: { tabCount: result.tabCount ?? 0 } };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logs.push(`✗ Wait failed: ${error}`);
    return { success: false, logs, error };
  }
}

// ---------------------------------------------------------------------------

async function stepDetectYearTabs(
  adapter: BrowserAdapter,
): Promise<StepResult<DetectedTabs>> {
  const logs: string[] = [];

  try {
    logs.push('→ Reading year tab labels');

    type DetectResult = { success: boolean; tabCount?: number; years?: string[]; error?: string };
    const result = await adapter.evaluate<DetectResult>(DETECT_YEAR_TABS_JS);

    if (!result.success) {
      logs.push(`✗ ${result.error}`);
      return { success: false, logs, error: result.error };
    }

    const { tabCount = 0, years = [] } = result;
    logs.push(`✓ ${tabCount} tab(s) found: ${years.join(', ')}`);
    return { success: true, logs, data: { tabCount, years } };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logs.push(`✗ Tab detection failed: ${error}`);
    return { success: false, logs, error };
  }
}

// ---------------------------------------------------------------------------

async function stepScrapePlannerIndex(
  adapter: BrowserAdapter,
): Promise<StepResult<ScrapeIndexResult>> {
  const logs: string[] = [];

  try {
    logs.push('→ Scraping all planner rows from all year tabs');

    type ScrapeRaw = {
      success: boolean;
      entries?: PlannerIndexEntry[];
      totalRows?: number;
      tabCount?: number;
      skippedRows?: { year: string; reason: string }[];
      error?: string;
    };

    const result = await adapter.evaluate<ScrapeRaw>(SCRAPE_PLANNER_INDEX_JS);

    if (!result.success) {
      logs.push(`✗ ${result.error}`);
      return { success: false, logs, error: result.error };
    }

    const entries = (result.entries ?? []).map(normaliseEntry);
    const skipped = result.skippedRows ?? [];

    logs.push(`✓ Scraped ${entries.length} planner entries across ${result.tabCount} tab(s)`);

    if (skipped.length > 0) {
      logs.push(`→ Skipped ${skipped.length} row(s):`);
      skipped.forEach(s => logs.push(`   • [${s.year}] ${s.reason}`));
    }

    // Log a summary per year
    const byYear = groupByYear(entries);
    for (const [year, items] of Object.entries(byYear)) {
      logs.push(`   ${year}: ${items.length} planner(s)`);
    }

    return {
      success: true,
      logs,
      data: {
        entries,
        tabCount: result.tabCount ?? 0,
        years: Object.keys(byYear),
        totalRows: entries.length,
      },
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logs.push(`✗ Scrape failed: ${error}`);
    return { success: false, logs, error };
  }
}

// ---------------------------------------------------------------------------

async function stepDownloadPdf(
  adapter: BrowserAdapter,
  opts: RunStepOptions,
): Promise<StepResult<DownloadPdfResult>> {
  const logs: string[] = [];

  if (!opts.downloadOptions) {
    return { success: false, logs: ['✗ No downloadOptions provided'], error: 'Missing downloadOptions' };
  }

  const { entry, destDir } = opts.downloadOptions;
  const { pdfUrl, unitCode, year } = entry;

  if (!pdfUrl) {
    const error = 'Entry has no pdfUrl';
    logs.push(`✗ ${error}`);
    return { success: false, logs, error };
  }

  try {
    // 1. Verify the link is reachable before downloading
    logs.push(`→ Verifying PDF link: ${pdfUrl}`);
    type VerifyResult = { success: boolean; status?: number; contentType?: string; error?: string };
    const verify = await adapter.evaluate<VerifyResult>(VERIFY_PDF_LINK_JS(pdfUrl));

    if (!verify.success) {
      logs.push(`✗ Link check failed (HTTP ${verify.status ?? '?'}): ${verify.error ?? 'unreachable'}`);
      return { success: false, logs, error: `PDF link unreachable: ${pdfUrl}` };
    }
    logs.push(`✓ Link reachable — HTTP ${verify.status}, type: ${verify.contentType}`);

    // 2. Download the PDF buffer server-side
    logs.push(`→ Downloading PDF for ${unitCode} (${year})`);
    const { buffer, sizeBytes } = await adapter.fetchBuffer(pdfUrl);

    // 3. Write to disk
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const filename = buildFilename(entry);
    const filePath = path.join(destDir, filename);
    fs.writeFileSync(filePath, buffer);

    logs.push(`✓ Saved ${(sizeBytes / 1024).toFixed(1)} KB → ${filePath}`);
    return { success: true, logs, data: { filePath, sizeBytes } };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logs.push(`✗ Download failed: ${error}`);
    return { success: false, logs, error };
  }
}

// ---------------------------------------------------------------------------

async function stepParsePlannerPdf(
  _adapter: BrowserAdapter,
  opts: RunStepOptions,
): Promise<StepResult<{ message: string }>> {
  const logs: string[] = [];

  // TODO: Integrate with plannerPdfExtractor.py via child_process.spawn,
  // same pattern as plannerImportService.ts in the local app.
  // The Python binary should be bundled separately for the cloud deployment.

  if (!opts.pdfFilePath) {
    return { success: false, logs: ['✗ No pdfFilePath provided'], error: 'Missing pdfFilePath' };
  }

  logs.push(`→ PDF parsing not yet implemented for cloud deployment`);
  logs.push(`→ Target file: ${opts.pdfFilePath}`);
  logs.push(`→ To implement: spawn plannerStructureService.py, pass file path, parse JSON output`);

  return {
    success: false,
    logs,
    error: 'parse-planner-pdf step not implemented — see TODO in plannerScraperService.ts',
  };
}

// ---------------------------------------------------------------------------
// Public: runStep
// ---------------------------------------------------------------------------

/**
 * Executes a single scraper step by ID. Mirrors runScraperStep() from the
 * local app's advisorScraperService.ts.
 *
 * @param stepId   Which step to run
 * @param adapter  The browser adapter (Puppeteer or mock)
 * @param opts     Step-specific options
 */
export async function runStep(
  stepId: ScraperStepId,
  adapter: BrowserAdapter,
  opts: RunStepOptions = {},
): Promise<StepResult> {
  switch (stepId) {
    case 'navigate-to-index':    return stepNavigateToIndex(adapter, opts);
    case 'wait-for-content':     return stepWaitForContent(adapter, opts);
    case 'detect-year-tabs':     return stepDetectYearTabs(adapter);
    case 'scrape-planner-index': return stepScrapePlannerIndex(adapter);
    case 'download-pdf':         return stepDownloadPdf(adapter, opts);
    case 'parse-planner-pdf':    return stepParsePlannerPdf(adapter, opts);
    default: {
      const exhaustive: never = stepId;
      return {
        success: false,
        logs: [`✗ Unknown step: ${exhaustive}`],
        error: `Unknown step: ${exhaustive}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Utility: diff scraped vs stored
// ---------------------------------------------------------------------------

/**
 * Compares freshly scraped entries against records already in the database.
 *
 * Identity key: unitCode + year + intakeMonth (composite — a programme can
 * have multiple intakes per year, each producing its own planner).
 *
 * Returns three buckets:
 *   new       — composite key not in DB
 *   updated   — key exists but lastUpdated string differs
 *   unchanged — key exists and lastUpdated matches
 */
export function diffEntries(
  scraped: PlannerIndexEntry[],
  stored: StoredPlannerRecord[],
): PlannerDiff {
  const storedMap = new Map(
    stored.map(r => [makeKey(r.unitCode, r.year, r.intakeMonth), r.lastUpdated]),
  );

  const newEntries: PlannerIndexEntry[] = [];
  const updatedEntries: PlannerIndexEntry[] = [];
  const unchangedEntries: PlannerIndexEntry[] = [];

  for (const entry of scraped) {
    const key = makeKey(entry.unitCode, entry.year, entry.intakeMonth);
    const storedDate = storedMap.get(key);
    if (storedDate === undefined) {
      newEntries.push(entry);
    } else if (storedDate !== entry.lastUpdated) {
      updatedEntries.push(entry);
    } else {
      unchangedEntries.push(entry);
    }
  }

  return { newEntries, updatedEntries, unchangedEntries };
}

function makeKey(unitCode: string, year: string, intakeMonth: string): string {
  return `${unitCode}|${year}|${intakeMonth}`;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Normalise a raw scraped entry — parse ISO date, trim fields. */
function normaliseEntry(raw: PlannerIndexEntry): PlannerIndexEntry {
  return {
    ...raw,
    unitCode: raw.unitCode.trim(),
    courseName: raw.courseName.trim(),
    intakeMonth: raw.intakeMonth.trim(),
    programLevel: raw.programLevel.trim(),
    lastUpdated: raw.lastUpdated.trim(),
    lastUpdatedISO: parseLastUpdated(raw.lastUpdated),
  };
}

/** Parse "10 April 2026" → "2026-04-10". Returns null on failure. */
function parseLastUpdated(raw: string): string | null {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/** Build a deterministic filename from entry metadata. */
function buildFilename(entry: PlannerIndexEntry): string {
  const parts = [
    entry.year,
    entry.unitCode.replace(/[^A-Za-z0-9-]/g, '_'),
    entry.intakeMonth.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, ''),
  ].filter(Boolean);
  return `${parts.join('__')}.pdf`;
}

/** Group entries by year for logging summaries. */
function groupByYear(entries: PlannerIndexEntry[]): Record<string, PlannerIndexEntry[]> {
  return entries.reduce<Record<string, PlannerIndexEntry[]>>((acc, e) => {
    (acc[e.year] ??= []).push(e);
    return acc;
  }, {});
}
