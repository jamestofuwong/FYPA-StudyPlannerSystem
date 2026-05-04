import type { ScrapedStudent } from '../../../../core/shared/types/student';

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

// Module-level singleton — shared across all API route invocations in the same
// Node.js process (works correctly in Electron where Next.js runs in-process).
export const scraperStore: ScraperQueueState = {
  status: 'idle',
  studentId: null,
  enrollmentMode: 'latest',
  enrollmentText: null,
  result: null,
  error: null,
};
