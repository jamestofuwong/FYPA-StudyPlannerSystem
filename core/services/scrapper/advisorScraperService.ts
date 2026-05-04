import type { ScraperStepId, ScrapeResult, ScrapedProgramData, ScrapedCourseRow } from "../../shared/types/scraping";
import {
  FIND_IFRAME_POLLING_JS,
  WAIT_FOR_KENDO_DROPDOWN_JS,
  CLICK_STUDENT_DROPDOWN_JS,
  WAIT_FOR_KENDO_LIST_JS,
  OPEN_STUDENT_DROPDOWN_JS,
  DISMISS_DROPDOWN_JS,
  ENTER_STUDENT_ID_JS,
  CLICK_DROPDOWN_JS,
  FIND_AND_SELECT_JS,
  WAIT_FOR_PROGRAM_SECTION_JS,
  SCRAPE_PROGRAM_DATA_JS,
  EXTRACT_GRID_JS,
} from "./advisorScraperScripts";

// ---------------------------------------------------------------------------
// Portal URLs
// ---------------------------------------------------------------------------

export const TARGET_URL =
  "https://sisportal-100380.campusnexus.cloud/CMCPortal/secure/Staff/loginsta.aspx";

export const DEGREE_URL =
  "https://sisportal-100380.campusnexus.cloud/CMCPortal/secure/links/Degree1.aspx?sm=1";

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function isMicrosoftLoginUrl(url: string): boolean {
  return url.startsWith("https://login.microsoftonline.com");
}

export function isLoggedInPortalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "sisportal-100380.campusnexus.cloud";
  } catch {
    return false;
  }
}

export function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const unwrapped = trimmed.replace(/^["'`\s]+|["'`\s]+$/g, "");
  if (!unwrapped) return null;
  if (unwrapped.startsWith("https://") || unwrapped.startsWith("http://")) {
    return unwrapped;
  }
  return null;
}

// ---------------------------------------------------------------------------
// WebviewAdapter — implemented by the renderer (wraps the <webview> element)
// ---------------------------------------------------------------------------

export interface WebviewAdapter {
  loadURL(url: string): Promise<void>;
  executeJavaScript<T = unknown>(script: string): Promise<T>;
  getURL(): string;
}

// ---------------------------------------------------------------------------
// Step result returned to the caller (React component or runAllSteps)
// ---------------------------------------------------------------------------

export type StepResult = {
  logs: string[];
  scrapeResult?: ScrapeResult;
  loginDetected?: boolean;
  studentName?: string;
  enrollmentOptions?: { text: string }[];
  selectedEnrollment?: string;
};

// ---------------------------------------------------------------------------
// Internal JS result shapes (mirrors what the injected scripts return)
// ---------------------------------------------------------------------------

type DropdownResult = {
  url: string;
  found: boolean;
  clicked: boolean;
  expanded: boolean;
  listItemCount: number;
  options: { text: string; value: string | null }[];
  ariaExpanded: string | null;
};

type KendoListResult = {
  success: boolean;
  listItems?: string[];
  itemCount?: number;
  error?: string;
};

type EnterIdResult = {
  success: boolean;
  clickedText?: string;
  error?: string;
};

type SelectResult = {
  found: boolean;
  expanded?: boolean;
  clicked?: boolean;
  selectedOption?: { text: string; value: string | null } | null;
  allOptions?: { text: string; value: string | null }[];
  filteredOptions?: { text: string; value: string | null }[];
  error?: string;
};

type ProgramDataResult = {
  found: boolean;
  data?: Record<string, string | null>;
  rawGrid?: string[][];
  rowCount?: number;
  error?: string;
};

type GridDataResult = {
  found: boolean;
  rows?: {
    courseId: string;
    courseTitle: string;
    credits: string;
    earned: string;
    status: string;
    grade: string;
    term: string;
  }[];
  rowCount?: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// runScraperStep — execute a single step via the adapter
// ---------------------------------------------------------------------------

export async function runScraperStep(
  stepId: ScraperStepId,
  adapter: WebviewAdapter,
  opts?: { studentId?: string; enrollmentMode?: 'latest' | 'earliest' | 'mpu' | 'by-text'; enrollmentText?: string }
): Promise<StepResult> {
  const logs: string[] = [];

  if (stepId === "go-degree") {
    logs.push("→ Navigating to Degree1.aspx");
    await adapter.loadURL(DEGREE_URL);
    logs.push(`✓ Navigated: ${adapter.getURL()}`);

  } else if (stepId === "open-degree-iframe") {
    logs.push("→ Waiting for iframe on Degree1.aspx");
    const iframeSrc = await adapter.executeJavaScript<string | null>(FIND_IFRAME_POLLING_JS);
    if (iframeSrc) {
      logs.push(`✓ Found iframe: ${iframeSrc}`);
      await adapter.loadURL(iframeSrc);
      logs.push(`✓ Navigated to iframe: ${adapter.getURL()}`);
    } else {
      logs.push("⚠ No iframe found, staying on Degree1.aspx");
    }

  } else if (stepId === "click-student-dropdown") {
    logs.push("→ Waiting for kendo-dropdownlist to appear");
    const appeared = await adapter.executeJavaScript<boolean>(WAIT_FOR_KENDO_DROPDOWN_JS);
    if (!appeared) {
      logs.push("✗ kendo-dropdownlist did not appear within 20s");
    } else {
      logs.push("→ Clicking first kendo-dropdownlist");
    }
    const data = await adapter.executeJavaScript<DropdownResult>(CLICK_STUDENT_DROPDOWN_JS);
    if (data.found) {
      logs.push(`✓ Dropdown clicked — expanded: ${data.expanded}, items: ${data.listItemCount}`);
    } else {
      logs.push("✗ Student dropdown not found");
    }

  } else if (stepId === "wait-for-kendo-list") {
    logs.push("→ Waiting for kendo-list");
    const data = await adapter.executeJavaScript<KendoListResult>(WAIT_FOR_KENDO_LIST_JS);
    if (data.success) {
      logs.push(`✓ List populated with ${data.itemCount} items`);
    } else {
      logs.push(`✗ ${data.error}`);
    }

  } else if (stepId === "open-student-dropdown") {
    logs.push("→ Opening student dropdown");
    const data = await adapter.executeJavaScript<{ success: boolean; alreadyOpen?: boolean; attempt?: number; polls?: number; error?: string }>(OPEN_STUDENT_DROPDOWN_JS);
    if (data.success) {
      const detail = data.alreadyOpen ? "already open" : `attempt ${data.attempt}, poll ${data.polls}`;
      logs.push(`✓ Student dropdown open (${detail})`);
    } else {
      logs.push(`✗ ${data.error ?? "Failed to open student dropdown"}`);
    }

  } else if (stepId === "enter-student-id") {
    const studentId = opts?.studentId ?? "";
    logs.push(`→ Entering student ID ${studentId}`);
    const data = await adapter.executeJavaScript<EnterIdResult>(ENTER_STUDENT_ID_JS(studentId));
    if (data.success) {
      logs.push(`✓ Clicked list item: ${data.clickedText}`);
      // Extract the student name by removing the student ID from the clicked text.
      const rawName = (data.clickedText ?? '').replace(studentId, '').replace(/\s+/g, ' ').trim();
      const studentName = rawName || undefined;
      if (studentName) logs.push(`✓ Student name extracted: ${studentName}`);
      return { logs, studentName };
    } else {
      logs.push(`✗ ${data.error}`);
    }

  } else if (stepId === "click-dropdown") {
    logs.push("→ Clicking enroll dropdown");
    const data = await adapter.executeJavaScript<DropdownResult>(CLICK_DROPDOWN_JS);
    if (data.found) {
      logs.push(`✓ Dropdown clicked — expanded: ${data.expanded}, options: ${data.options.length}`);
    } else {
      logs.push("✗ Enrollment dropdown not found");
    }

  } else if (stepId === "select-dropdown") {
    logs.push("→ Selecting best enrollment option");
    const data = await adapter.executeJavaScript<SelectResult>(
      FIND_AND_SELECT_JS(opts?.enrollmentMode ?? 'latest', opts?.enrollmentText)
    );
    if (data.clicked && data.selectedOption) {
      logs.push(`✓ Selected: ${data.selectedOption.text}`);
    } else {
      logs.push(`⚠ ${data.error ?? "No option selected"}`);
    }
    return {
      logs,
      enrollmentOptions: (data.allOptions ?? []).map((o) => ({ text: o.text })),
      selectedEnrollment: data.selectedOption?.text ?? undefined,
    };

  } else if (stepId === "scrape-program-data") {
    logs.push("→ Waiting for Current Program section to appear");
    const appeared = await adapter.executeJavaScript<boolean>(WAIT_FOR_PROGRAM_SECTION_JS);
    if (!appeared) {
      logs.push("✗ Current Program section did not appear within 30s");
      return {
        logs,
        scrapeResult: { scraped: false, error: "Current Program section did not render in time" },
      };
    }
    logs.push("✓ Current Program section found, proceeding to scrape");

    const programData = await adapter.executeJavaScript<ProgramDataResult>(SCRAPE_PROGRAM_DATA_JS);
    logs.push("→ Extracting course audit grid");
    const gridData = await adapter.executeJavaScript<GridDataResult>(EXTRACT_GRID_JS);

    if (programData.found && programData.data) {
      logs.push(`✓ Program data scraped (${programData.rowCount} rows)`);
      logs.push(`✓ Grid: ${gridData.rowCount ?? 0} course rows`);
      return {
        logs,
        scrapeResult: {
          scraped: true,
          data: programData.data as ScrapedProgramData,
          rawGrid: programData.rawGrid,
          rowCount: programData.rowCount,
          gridRows: gridData.rows as ScrapedCourseRow[] | undefined,
          gridRowCount: gridData.rowCount,
        },
      };
    } else {
      logs.push(`✗ ${programData.error ?? "Current Program not found"}`);
      return {
        logs,
        scrapeResult: { scraped: false, error: programData.error },
      };
    }
  }

  return { logs };
}

// ---------------------------------------------------------------------------
// runAllSteps — run the full pipeline, stopping on login redirect
// ---------------------------------------------------------------------------

export async function runAllSteps(
  adapter: WebviewAdapter,
  opts?: { studentId?: string; enrollmentMode?: 'latest' | 'earliest' | 'mpu' | 'by-text'; enrollmentText?: string }
): Promise<StepResult> {
  const allStepIds: ScraperStepId[] = [
    "go-degree",
    "open-degree-iframe",
    "click-student-dropdown",
    "wait-for-kendo-list",
    "enter-student-id",
    "click-dropdown",
    "select-dropdown",
    "scrape-program-data",
  ];

  const allLogs: string[] = [];
  let finalScrapeResult: ScrapeResult | undefined;

  for (const stepId of allStepIds) {
    const result = await runScraperStep(stepId, adapter, opts);
    allLogs.push(...result.logs);

    if (result.scrapeResult) {
      finalScrapeResult = result.scrapeResult;
    }

    if (isMicrosoftLoginUrl(adapter.getURL())) {
      allLogs.push("⚠ Microsoft login required — stopping");
      return { logs: allLogs, scrapeResult: finalScrapeResult, loginDetected: true };
    }
  }

  return { logs: allLogs, scrapeResult: finalScrapeResult };
}
