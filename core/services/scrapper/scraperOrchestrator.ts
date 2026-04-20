import type { ScraperStepId, ScrapeResult } from '../../shared/types/scraping';
import { SCRAPER_STEPS } from '../../shared/types/scraping';
import {
  runScraperStep,
  isMicrosoftLoginUrl,
  type WebviewAdapter,
} from './advisorScraperService';
import { DISMISS_DROPDOWN_JS } from './advisorScraperScripts';

// ---------------------------------------------------------------------------
// Step sequences
// ---------------------------------------------------------------------------

// Runs automatically when the portal loads — navigates to the degree page and
// opens the student dropdown so it is ready for input.
export const AUTO_RUN_STEPS: ScraperStepId[] = [
  'go-degree',
  'open-degree-iframe',
  'click-student-dropdown',
  'wait-for-kendo-list',
];

// Runs per-student after the auto-run phase completes.
export const STUDENT_STEPS: ScraperStepId[] = [
  'click-student-dropdown',
  'wait-for-kendo-list',
  'enter-student-id',
  'click-dropdown',
  'select-dropdown',
  'scrape-program-data',
];

// ---------------------------------------------------------------------------
// Callback interface — lets the caller (ScraperContext) update UI state
// without the orchestrator knowing about React.
// ---------------------------------------------------------------------------

export type OrchestratorCallbacks = {
  onLog: (msgs: string[]) => void;
  onBotStep: (label: string) => void;
  onScrapeResult?: (result: ScrapeResult) => void;
};

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type AutoRunResult = {
  completedIndex: number;
  loginDetected: boolean;
  error?: string;
};

export type StudentScrapeResult = {
  finalResult: ScrapeResult | null;
  loginDetected: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// runAutoRun — navigate to the portal and open the student dropdown.
// Resumes from startIndex so it can continue after a login interruption.
// ---------------------------------------------------------------------------

export async function runAutoRun(
  adapter: WebviewAdapter,
  startIndex: number,
  callbacks: OrchestratorCallbacks,
): Promise<AutoRunResult> {
  const { onLog, onBotStep } = callbacks;
  let currentIndex = startIndex;

  while (currentIndex < AUTO_RUN_STEPS.length) {
    const stepId = AUTO_RUN_STEPS[currentIndex];
    onBotStep(SCRAPER_STEPS.find((s) => s.id === stepId)?.label ?? stepId);
    try {
      const result = await runScraperStep(stepId, adapter);
      onLog(result.logs);
      currentIndex += 1;
      if (isMicrosoftLoginUrl(adapter.getURL())) {
        return { completedIndex: currentIndex, loginDetected: true };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      onLog([`✗ Auto-run error: ${error}`]);
      return { completedIndex: currentIndex, loginDetected: false, error };
    }
  }

  // Dismiss the open dropdown so the next runStudentScrape opens it fresh.
  try { await adapter.executeJavaScript(DISMISS_DROPDOWN_JS); } catch {}
  await new Promise<void>((r) => globalThis.setTimeout(r, 300));

  onBotStep('Ready — enter Student ID to continue');
  return { completedIndex: currentIndex, loginDetected: false };
}

// ---------------------------------------------------------------------------
// runStudentScrape — run the student-specific steps and return the result.
// ---------------------------------------------------------------------------

export async function runStudentScrape(
  adapter: WebviewAdapter,
  studentId: string,
  callbacks: OrchestratorCallbacks,
): Promise<StudentScrapeResult> {
  const { onLog, onBotStep, onScrapeResult } = callbacks;
  let finalResult: ScrapeResult | null = null;
  let studentName: string | undefined;

  try {
    for (const stepId of STUDENT_STEPS) {
      onBotStep(SCRAPER_STEPS.find((s) => s.id === stepId)?.label ?? stepId);
      const result = await runScraperStep(stepId, adapter, { studentId });
      onLog(result.logs);
      if (result.studentName) studentName = result.studentName;
      if (result.scrapeResult) {
        finalResult = result.scrapeResult;
        onScrapeResult?.(result.scrapeResult);
      }
      if (result.loginDetected) return { finalResult, loginDetected: true };
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    onLog([`✗ Error: ${error}`]);
    return { finalResult, loginDetected: false, error };
  }

  // Attach the name captured from the dropdown into the final scrape result.
  if (finalResult?.scraped && studentName) {
    finalResult = { ...finalResult, studentName };
  }

  return { finalResult, loginDetected: false };
}
