import type { ScrapedStudent } from '../../../../core/shared/types/student';

export type ScraperQueueStatus = 'idle' | 'pending' | 'scraping' | 'done' | 'error';

type ScraperQueueState = {
  status: ScraperQueueStatus;
  studentId: string | null;
  result: ScrapedStudent | null;
  error: string | null;
};

// Module-level singleton — shared across all API route invocations in the same
// Node.js process (works correctly in Electron where Next.js runs in-process).
export const scraperStore: ScraperQueueState = {
  status: 'idle',
  studentId: null,
  result: null,
  error: null,
};
