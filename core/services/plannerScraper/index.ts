/**
 * Public API for the planner scraper service.
 *
 * Usage example (in a Next.js API route):
 *
 *   import { createPuppeteerAdapter, checkForUpdates, syncUpdatedPlanners } from '@/services/plannerScraper';
 *
 *   const adapter = await createPuppeteerAdapter({ headless: true });
 *   try {
 *     const { diff } = await checkForUpdates(adapter, storedRecords, {
 *       onLog: (msgs) => console.log(msgs.join('\n')),
 *       onStep: (id, label) => console.log(`[step] ${label}`),
 *     });
 *     console.log('New:', diff.newEntries.length, 'Updated:', diff.updatedEntries.length);
 *   } finally {
 *     await adapter.close();
 *   }
 */

// Browser adapter
export { createPuppeteerAdapter, createMockAdapter } from './plannerScraperAdapter';
export type { BrowserAdapter } from './plannerScraperAdapter';

// Individual step runner (for custom workflows)
export { runStep, diffEntries, PLANNER_INDEX_URL, STEP_LABELS } from './plannerScraperService';

// High-level workflows
export {
  checkForUpdates,
  syncUpdatedPlanners,
  forceResyncAll,
  downloadAndParse,
} from './plannerScraperOrchestrator';

// Types
export type {
  ScraperStepId,
  ScraperCallbacks,
  PlannerIndexEntry,
  DetectedTabs,
  ScrapeIndexResult,
  PlannerDiff,
  StoredPlannerRecord,
  CheckUpdatesResult,
  SyncResult,
  StepResult,
  RunStepOptions,
  DownloadPdfResult,
  ParsedPlanner,
  ParsedPlannerUnit,
} from './types';
