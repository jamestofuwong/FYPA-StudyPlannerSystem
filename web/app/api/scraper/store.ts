import fs from 'fs';
import path from 'path';
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

// ─── Portal session state (API-based pipeline) ────────────────────────────────

export type SessionStatus = 'idle' | 'login-pending' | 'logged-in' | 'login-error';

type PortalSessionState = {
  sessionStatus: SessionStatus;
  cookies: string | null;
  portalToken: string | null;
  sessionError: string | null;
  // Manual step-through debug mode
  manualMode: boolean;
  manualStep: 0 | 1 | 2 | 3 | 4;
  manualStepError: string | null;
};

// ─── Portal student list (in-memory, re-fetched on each login/startup) ────────

export type PortalStudent = {
  Id: number;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  StudentNumber: string;
};

type PortalStore = {
  students: PortalStudent[];
};

// ─── Global singletons ────────────────────────────────────────────────────────
// Anchored on globalThis so they survive Next.js module hot-reloads in dev mode.
// In production (Electron, no HMR) this is a no-op — the module only loads once.

declare global {
  // eslint-disable-next-line no-var
  var __scraperStore: ScraperQueueState | undefined;
  // eslint-disable-next-line no-var
  var __portalSessionStore: PortalSessionState | undefined;
  // eslint-disable-next-line no-var
  var __portalStore: PortalStore | undefined;
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

if (!globalThis.__portalSessionStore) {
  globalThis.__portalSessionStore = {
    sessionStatus: 'idle',
    cookies: null,
    portalToken: null,
    sessionError: null,
    manualMode: false,
    manualStep: 0,
    manualStepError: null,
  };
}

if (!globalThis.__portalStore) {
  globalThis.__portalStore = { students: [] };
}

export const scraperStore       = globalThis.__scraperStore;
export const portalSessionStore = globalThis.__portalSessionStore;
export const portalStore        = globalThis.__portalStore;

// ─── Session file persistence ─────────────────────────────────────────────────

function getSessionFilePath(): string | null {
  const dir = process.env.APP_DATA_DIR;
  if (!dir) return null;
  return path.join(dir, 'portal-session.json');
}

export function loadSession(): boolean {
  const filePath = getSessionFilePath();
  if (!filePath) return false;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as { cookies?: string; portalToken?: string };
    if (data.cookies && data.portalToken) {
      portalSessionStore.cookies = data.cookies;
      portalSessionStore.portalToken = data.portalToken;
      portalSessionStore.sessionStatus = 'logged-in';
      return true;
    }
  } catch {
    // No file or corrupt — start idle
  }
  return false;
}

export function saveSession(): void {
  const filePath = getSessionFilePath();
  if (!filePath) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify({
      cookies: portalSessionStore.cookies,
      portalToken: portalSessionStore.portalToken,
    }), 'utf-8');
  } catch {
    // Non-fatal — session just won't persist across restarts
  }
}

export function clearPersistedSession(): void {
  const filePath = getSessionFilePath();
  if (filePath) {
    try { fs.unlinkSync(filePath); } catch { /* already gone */ }
  }
  portalSessionStore.cookies = null;
  portalSessionStore.portalToken = null;
  portalSessionStore.sessionStatus = 'idle';
  portalSessionStore.sessionError = null;
  portalSessionStore.manualMode = false;
  portalSessionStore.manualStep = 0;
  portalSessionStore.manualStepError = null;
  portalStore.students = [];
}

// ─── Auto-load session on module init ────────────────────────────────────────
// Runs synchronously when this module is first imported. If APP_DATA_DIR is set
// and a valid portal-session.json exists, the session is restored immediately so
// the app is ready without requiring a fresh login on every start.
loadSession();
