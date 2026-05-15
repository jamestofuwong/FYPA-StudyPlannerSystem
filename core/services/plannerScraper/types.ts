// ---------------------------------------------------------------------------
// Scraper step identifiers
// ---------------------------------------------------------------------------

export type ScraperStepId =
  | 'navigate-to-index'    // Load the planner index page
  | 'wait-for-content'     // Poll until .tab_container elements are present
  | 'detect-year-tabs'     // Enumerate year tabs and their labels
  | 'scrape-planner-index' // Extract all planner rows from every tab
  | 'download-pdf'         // Fetch a single PDF file by URL
  | 'parse-planner-pdf';   // Parse a downloaded PDF into structured data

// ---------------------------------------------------------------------------
// Raw scraped data
// ---------------------------------------------------------------------------

/** One row from the planner index table */
export interface PlannerIndexEntry {
  year: string;          // e.g. "2025"
  unitCode: string;      // e.g. "CT000-3-3"
  courseName: string;    // e.g. "Bachelor of Computer Science (Hons)"
  intakeMonth: string;   // e.g. "March intake"
  programLevel: string;  // e.g. "Undergraduate"
  pdfUrl: string;        // Absolute URL to PDF
  lastUpdated: string;   // Raw string e.g. "10 April 2026"
  lastUpdatedISO: string | null; // Parsed ISO date or null if unparseable
}

/** Result of the detect-year-tabs step */
export interface DetectedTabs {
  tabCount: number;
  years: string[];
}

/** Result of the scrape-planner-index step */
export interface ScrapeIndexResult {
  entries: PlannerIndexEntry[];
  tabCount: number;
  years: string[];
  totalRows: number;
}

// ---------------------------------------------------------------------------
// Diff / update detection
// ---------------------------------------------------------------------------

/** Represents an entry already stored in the database */
export interface StoredPlannerRecord {
  pdfUrl: string;
  lastUpdated: string;
}

export interface PlannerDiff {
  newEntries: PlannerIndexEntry[];       // URL not seen before
  updatedEntries: PlannerIndexEntry[];   // URL known but lastUpdated changed
  unchangedEntries: PlannerIndexEntry[]; // URL known and lastUpdated matches
}

// ---------------------------------------------------------------------------
// PDF download
// ---------------------------------------------------------------------------

export interface DownloadPdfOptions {
  entry: PlannerIndexEntry;
  destDir: string; // Absolute path to write PDF to
}

export interface DownloadPdfResult {
  filePath: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// PDF parsing (stub — to be implemented with Python service)
// ---------------------------------------------------------------------------

export interface ParsedPlannerUnit {
  code: string;
  name: string;
  credits: number;
  category: 'core' | 'major_core' | 'prescribed_elective' | 'free_elective' | 'mpu' | 'wil' | 'unknown';
  year: number;
  semester: number;
}

export interface ParsedPlanner {
  courseCode: string;
  courseName: string;
  majorCode: string;
  majorName: string;
  intakeYear: number;
  intakeSemester: number;
  units: ParsedPlannerUnit[];
  rawText?: string;
}

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

export interface StepResult<T = unknown> {
  success: boolean;
  logs: string[];
  data?: T;
  error?: string;
}

export interface RunStepOptions {
  // navigate-to-index
  indexUrl?: string;

  // wait-for-content
  waitTimeoutMs?: number;

  // diff-against-db — pass existing records so the step can compute the diff
  storedRecords?: StoredPlannerRecord[];

  // download-pdf
  downloadOptions?: DownloadPdfOptions;

  // parse-planner-pdf
  pdfFilePath?: string;
  plannerMeta?: Pick<PlannerIndexEntry, 'unitCode' | 'courseName' | 'intakeMonth' | 'year'>;
}

// ---------------------------------------------------------------------------
// Orchestrator callbacks
// ---------------------------------------------------------------------------

export interface ScraperCallbacks {
  /** Append log lines to the UI / console */
  onLog: (messages: string[]) => void;
  /** Notify which step is starting */
  onStep: (stepId: ScraperStepId, label: string) => void;
  /** Progress through a list of items (e.g. downloading N PDFs) */
  onProgress?: (current: number, total: number, description: string) => void;
}

// ---------------------------------------------------------------------------
// Orchestrator results
// ---------------------------------------------------------------------------

export interface CheckUpdatesResult {
  diff: PlannerDiff;
  totalScraped: number;
}

export interface SyncResult {
  attempted: number;
  succeeded: number;
  failed: Array<{ entry: PlannerIndexEntry; error: string }>;
}
