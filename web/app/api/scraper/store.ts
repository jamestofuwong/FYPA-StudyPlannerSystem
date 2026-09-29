import type { ScrapedStudent } from '../../../../core/shared/types/student';

// ─── Scrape queue state (legacy DOM scraper, kept for compatibility) ───────────

export type ScraperQueueStatus = 'idle' | 'initializing' | 'pending' | 'scraping' | 'done' | 'error';
export type EnrollmentMode = 'latest' | 'earliest' | 'mpu' | 'by-text';

type ScraperQueueState = {
  status: ScraperQueueStatus;
  studentId: string | null;
  enrollmentMode: EnrollmentMode;
  enrollmentText: string | null;
  result: ScrapedStudent | null;
  error: string | null;
};

// ─── Global singleton ─────────────────────────────────────────────────────────
// Anchored on globalThis to survive Next.js HMR module reloads in dev mode.

declare global {
  // eslint-disable-next-line no-var
  var __scraperStore: ScraperQueueState | undefined;
}

if (!globalThis.__scraperStore) {
  globalThis.__scraperStore = {
    status: 'idle',
    studentId: null,
    enrollmentMode: 'latest',
    enrollmentText: null,
    result: null,
    error: null,
  };
}

export const scraperStore = globalThis.__scraperStore;
