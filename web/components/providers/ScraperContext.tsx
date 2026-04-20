'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type MutableRefObject, type ReactNode,
} from 'react';
import {
  SCRAPER_STEPS,
  type ScraperPhase, type ScraperStepId, type ScrapeResult,
} from '../../../core/shared/types/scraping';
import {
  runScraperStep, runAllSteps,
  isMicrosoftLoginUrl, isLoggedInPortalUrl,
  sanitizeUrl, TARGET_URL,
  type WebviewAdapter,
} from '../../../core/services/scrapper/advisorScraperService';
import {
  AUTO_RUN_STEPS, STUDENT_STEPS,
  runAutoRun, runStudentScrape,
} from '../../../core/services/scrapper/scraperOrchestrator';
import { usePortalAuth } from './PortalAuthContext';

// ---------------------------------------------------------------------------
// WebviewAdapterImpl — Electron-specific implementation of WebviewAdapter.
// Wraps the <webview> DOM element so the core service never touches Electron.
// ---------------------------------------------------------------------------

class WebviewAdapterImpl implements WebviewAdapter {
  constructor(private el: ElectronWebviewTag) {}

  loadURL(url: string): Promise<void> {
    const safe = sanitizeUrl(url);
    if (!safe) return Promise.reject(new Error(`Invalid URL: ${url}`));
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out loading ${url}`));
      }, 30000);
      const cleanup = () => {
        globalThis.clearTimeout(timeout);
        this.el.removeEventListener('did-finish-load', onFinish);
        this.el.removeEventListener('did-fail-load', onFail);
      };
      const onFinish = () => { cleanup(); resolve(); };
      const onFail = (e: any) => { cleanup(); reject(new Error(e?.errorDescription ?? 'Failed to load URL')); };
      this.el.addEventListener('did-finish-load', onFinish);
      this.el.addEventListener('did-fail-load', onFail);
      this.el.loadURL(safe);
    });
  }

  executeJavaScript<T = unknown>(script: string): Promise<T> {
    return this.el.executeJavaScript<T>(script);
  }

  getURL(): string {
    try { return this.el.getURL(); } catch { return ''; }
  }
}

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

export type ScraperContextValue = {
  phase: ScraperPhase;
  currentUrl: string;
  botStep: string;
  showBrowser: boolean;
  error: string | null;
  scrapeResult: ScrapeResult | null;
  log: string[];
  stepIndex: number;
  studentId: string;
  partitionId: string;
  isBusy: boolean;
  isElectron: boolean;
  setStudentId: (v: string) => void;
  execStep: (stepId: ScraperStepId) => void;
  execNextStep: () => void;
  execAll: () => void;
  handleClearSession: () => void;
  scrapeStudent: (id: string) => void;
  registerWebviewSlot: (el: HTMLDivElement | null) => void;
};

const ScraperContext = createContext<ScraperContextValue | null>(null);

// ---------------------------------------------------------------------------
// PersistentWebview — fixed-position overlay that tracks the scraping-page
// slot div. Stays mounted for the lifetime of the app so the webview session
// is never lost on navigation.
// ---------------------------------------------------------------------------

type WebviewSlotRect = { top: number; left: number; width: number; height: number };

function PersistentWebview({
  webviewRef, partitionId, slotElement, onReady, showBrowser,
}: {
  webviewRef: MutableRefObject<ElectronWebviewTag | null>;
  partitionId: string;
  slotElement: HTMLDivElement | null;
  onReady: (v: boolean) => void;
  showBrowser: boolean;
}) {
  const [rect, setRect] = useState<WebviewSlotRect | null>(null);

  useEffect(() => {
    if (!slotElement) { setRect(null); return; }
    const update = () => {
      const r = slotElement.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(slotElement);
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [slotElement]);

  const visible = !!rect;
  const height = rect ? (showBrowser ? Math.max(rect.height, 540) : rect.height) : 1;

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: visible ? 10 : -1,
        top:    rect ? rect.top  : -9999,
        left:   rect ? rect.left : -9999,
        width:  rect ? rect.width : 1,
        height,
        visibility:    visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto'    : 'none',
        overflow: 'hidden',
        background: 'var(--panel-bg)',
      }}
    >
      <webview
        key={partitionId}
        ref={(el: any) => {
          webviewRef.current = el;
          onReady(!!el);
          if (el && typeof el.setAttribute === 'function') {
            el.setAttribute('allowpopups', 'true');
          }
        }}
        src={TARGET_URL}
        partition={partitionId}
        style={{ width: '100%', height: '100%', display: 'flex' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScraperProvider — wires the core orchestrator to React state and the
// Electron webview. All business logic lives in core/services/scrapper/.
// ---------------------------------------------------------------------------

export function ScraperProvider({ children }: { children: ReactNode }) {
  const { partitionId, isLoggedIn, setLoggedIn, setPortalLoading, resetSession } = usePortalAuth();

  const webviewRef                      = useRef<ElectronWebviewTag | null>(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const autoRunIndexRef  = useRef(isLoggedIn ? AUTO_RUN_STEPS.length : 0);
  const autoRunActiveRef = useRef(false);
  const prevPartitionRef = useRef(partitionId);

  const [slotElement, setSlotElement] = useState<HTMLDivElement | null>(null);

  const [runtime, setRuntime]   = useState<'unknown' | 'electron' | 'web'>('unknown');
  const [phase, setPhaseState]  = useState<ScraperPhase>('idle');
  const phaseRef                = useRef<ScraperPhase>('idle');
  const setPhase = useCallback((p: ScraperPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const [currentUrl, setCurrentUrl]     = useState('');
  const [botStep, setBotStep]           = useState('');
  const [showBrowser, setShowBrowser]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [log, setLog]                   = useState<string[]>([]);
  const [stepIndex, setStepIndex]       = useState(0);
  const [studentId, setStudentId]       = useState('');

  const addLogs = useCallback((msgs: string[]) => {
    setLog((prev) => [...prev, ...msgs]);
  }, []);

  // Detect runtime
  useEffect(() => {
    const w = globalThis as any;
    setRuntime(w?.native?.versions?.electron ? 'electron' : 'web');
  }, []);

  const isElectron = runtime === 'electron';

  // Auto-start when Electron is detected
  useEffect(() => {
    if (!isElectron) return;
    setPhase('browser');
  }, [isElectron, setPhase]);

  // Sync phase → global login + loading state
  useEffect(() => {
    if (phase === 'browser') {
      setPortalLoading(true);
    } else if (phase === 'ready' || phase === 'done' || phase === 'scraping') {
      setLoggedIn(true);
      setPortalLoading(false);
    } else if (phase === 'login' || phase === 'error') {
      setLoggedIn(false);
      setPortalLoading(false);
    }
  }, [phase, setLoggedIn, setPortalLoading]);

  // When login completes, navigate the webview back to the portal.
  const prevIsLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    const wasLoggedIn = prevIsLoggedInRef.current;
    prevIsLoggedInRef.current = isLoggedIn;
    if (!isLoggedIn || wasLoggedIn) return;
    if (phaseRef.current !== 'login') return;
    const wv = webviewRef.current;
    if (!wv) return;
    try { wv.loadURL(TARGET_URL); } catch {}
  }, [isLoggedIn]);

  // ---------------------------------------------------------------------------
  // URL tracking — updates currentUrl and phase based on webview navigation
  // ---------------------------------------------------------------------------

  const refreshUrl = useCallback(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    try {
      const url = wv.getURL();
      setCurrentUrl(url);
      if (isMicrosoftLoginUrl(url)) {
        setShowBrowser(true);
        if (phaseRef.current !== 'scraping') setPhase('login');
      } else if (phaseRef.current === 'login') {
        setShowBrowser(false);
        setPhase(isLoggedInPortalUrl(url) ? 'ready' : 'browser');
      }
    } catch {
      setCurrentUrl('');
    }
  }, [setPhase]);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const exitLoginMode = (url: string) => {
      if (phaseRef.current !== 'login') return;
      setShowBrowser(false);
      setPhase(isLoggedInPortalUrl(url) ? 'ready' : 'browser');
    };

    const onNavigate = (e: any) => {
      const url = typeof e?.url === 'string' ? e.url : wv.getURL();
      setCurrentUrl(url);
      if (isMicrosoftLoginUrl(url)) { setShowBrowser(true); setPhase('login'); return; }
      exitLoginMode(url);
      if (isLoggedInPortalUrl(url) && phaseRef.current !== 'scraping') {
        setShowBrowser(false);
        setPhase('ready');
      }
    };

    const onDidFinishLoad = () => {
      try { const url = wv.getURL(); if (!isMicrosoftLoginUrl(url)) exitLoginMode(url); } catch {}
    };

    const onDidFailLoad = (e: any) => {
      if (e?.isMainFrame === false) return;
      const rawUrl = typeof e?.validatedURL === 'string' ? e.validatedURL : typeof e?.url === 'string' ? e.url : '';
      const safeUrl = sanitizeUrl(rawUrl) ?? rawUrl;
      setError(`Load failed (${String(e?.errorCode ?? '')}): ${String(e?.errorDescription ?? '')} ${safeUrl}`.trim());
      setBotStep('Load failed');
    };

    const onNewWindow = (e: any) => {
      const safeUrl = sanitizeUrl(typeof e?.url === 'string' ? e.url : '');
      if (safeUrl) wv.loadURL(safeUrl);
    };

    wv.addEventListener('did-navigate',            onNavigate);
    wv.addEventListener('did-navigate-in-page',    onNavigate);
    wv.addEventListener('did-redirect-navigation', onNavigate);
    wv.addEventListener('did-finish-load',         onDidFinishLoad);
    wv.addEventListener('new-window',              onNewWindow);
    wv.addEventListener('did-fail-load',           onDidFailLoad);

    return () => {
      wv.removeEventListener('did-navigate',            onNavigate);
      wv.removeEventListener('did-navigate-in-page',    onNavigate);
      wv.removeEventListener('did-redirect-navigation', onNavigate);
      wv.removeEventListener('did-finish-load',         onDidFinishLoad);
      wv.removeEventListener('new-window',              onNewWindow);
      wv.removeEventListener('did-fail-load',           onDidFailLoad);
    };
  }, [webviewReady, setPhase]);

  useEffect(() => {
    if (phase === 'idle') return;
    refreshUrl();
    const id = globalThis.setInterval(() => refreshUrl(), 750);
    return () => globalThis.clearInterval(id);
  }, [refreshUrl, phase]);

  // ---------------------------------------------------------------------------
  // Adapter factory
  // ---------------------------------------------------------------------------

  const getAdapter = useCallback((): WebviewAdapter | null => {
    const wv = webviewRef.current;
    if (!wv) return null;
    return new WebviewAdapterImpl(wv);
  }, []);

  // ---------------------------------------------------------------------------
  // Step runners — thin wrappers that update React state around core calls
  // ---------------------------------------------------------------------------

  const execStep = useCallback(async (stepId: ScraperStepId) => {
    const adapter = getAdapter();
    if (!adapter) return;
    setError(null);
    setPhase('scraping');
    const stepLabel = SCRAPER_STEPS.find((s) => s.id === stepId)?.label ?? stepId;
    setBotStep(stepLabel);
    try {
      const result = await runScraperStep(stepId, adapter, { studentId });
      addLogs(result.logs);
      if (result.scrapeResult) setScrapeResult(result.scrapeResult);
      if (result.loginDetected) { setShowBrowser(true); setPhase('login'); return; }
      setShowBrowser(false);
      setPhase('ready');
      setBotStep(`Done: ${stepLabel}`);
      refreshUrl();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLogs([`✗ Error: ${msg}`]);
      setBotStep('Error');
      setPhase('error');
    }
  }, [getAdapter, studentId, addLogs, setPhase, refreshUrl]);

  const execNextStep = useCallback(async () => {
    const step = SCRAPER_STEPS[stepIndex];
    if (!step) return;
    await execStep(step.id);
    const url = webviewRef.current?.getURL() ?? '';
    if (!isMicrosoftLoginUrl(url)) setStepIndex((i) => Math.min(i + 1, SCRAPER_STEPS.length));
  }, [stepIndex, execStep]);

  const execAll = useCallback(async () => {
    const adapter = getAdapter();
    if (!adapter) return;
    setError(null);
    setPhase('scraping');
    setBotStep('Running all steps...');
    try {
      const result = await runAllSteps(adapter, { studentId });
      addLogs(result.logs);
      if (result.scrapeResult) setScrapeResult(result.scrapeResult);
      if (result.loginDetected) { setShowBrowser(true); setPhase('login'); return; }
      setPhase('done');
      setBotStep('All steps complete');
      setStepIndex(SCRAPER_STEPS.length);
      refreshUrl();
      if (result.scrapeResult?.scraped) {
        await fetch('/api/scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.scrapeResult),
        }).catch(() => {});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      addLogs([`✗ Error: ${msg}`]);
      setBotStep('Error');
      setPhase('error');
    }
  }, [getAdapter, studentId, addLogs, setPhase, refreshUrl]);

  // scrapeStudent — delegates to core orchestrator, then reports result via API.
  const scrapeStudent = useCallback(async (id: string) => {
    const adapter = getAdapter();
    if (!adapter) return;
    setStudentId(id);
    setError(null);
    setPhase('scraping');
    setBotStep('Starting student scrape…');

    const result = await runStudentScrape(adapter, id, {
      onLog: addLogs,
      onBotStep: setBotStep,
      onScrapeResult: setScrapeResult,
    });

    if (result.loginDetected) {
      setShowBrowser(true);
      setPhase('login');
      return;
    }

    if (result.error) {
      setError(result.error);
      addLogs([`✗ Error: ${result.error}`]);
      setBotStep('Error — ready for next student');
      await fetch('/api/scraper/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'error', error: result.error }),
      }).catch(() => {});
      setPhase('ready');
      return;
    }

    setBotStep('Student scrape complete — ready for next student');
    setStepIndex(STUDENT_STEPS.length);
    refreshUrl();

    if (result.finalResult?.scraped) {
      await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.finalResult),
      }).catch(() => {});
    } else {
      await fetch('/api/scraper/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'error', error: 'Scrape returned no data' }),
      }).catch(() => {});
    }

    setPhase('ready');
  }, [getAdapter, addLogs, setPhase, refreshUrl]);

  // ---------------------------------------------------------------------------
  // Auto-run — delegates to core orchestrator
  // ---------------------------------------------------------------------------

  const putApiStatus = useCallback((status: string, extra?: object) => {
    fetch('/api/scraper/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    }).catch(() => {});
  }, []);

  const runAutoSteps = useCallback(async () => {
    if (autoRunActiveRef.current) return;
    if (autoRunIndexRef.current >= AUTO_RUN_STEPS.length) return;
    const adapter = getAdapter();
    if (!adapter) return;

    autoRunActiveRef.current = true;
    setError(null);
    setPhase('scraping');
    putApiStatus('initializing');

    const result = await runAutoRun(adapter, autoRunIndexRef.current, {
      onLog: addLogs,
      onBotStep: setBotStep,
    });

    autoRunIndexRef.current = result.completedIndex;

    if (result.error) {
      setError(result.error);
      setPhase('error');
      autoRunActiveRef.current = false;
      putApiStatus('idle');
      return;
    }

    if (result.loginDetected) {
      setShowBrowser(true);
      setPhase('login');
      autoRunActiveRef.current = false;
      putApiStatus('idle');
      return;
    }

    autoRunActiveRef.current = false;
    setStepIndex(AUTO_RUN_STEPS.length);
    setPhase('ready');
    refreshUrl();
    putApiStatus('idle');
  }, [getAdapter, addLogs, setPhase, refreshUrl, putApiStatus]);

  useEffect(() => {
    if (!isElectron) return;
    if (phase !== 'ready') return;
    if (autoRunIndexRef.current >= AUTO_RUN_STEPS.length) return;
    if (autoRunActiveRef.current) return;
    void runAutoSteps();
  }, [isElectron, phase, runAutoSteps]);

  // ---------------------------------------------------------------------------
  // Poll /api/scraper/status when ready — pick up student IDs queued by the
  // dashboard and kick off scrapeStudent automatically.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isElectron) return;
    if (phase !== 'ready') return;

    const id = globalThis.setInterval(async () => {
      if (phaseRef.current !== 'ready') return;
      const res = await fetch('/api/scraper/status').catch(() => null);
      if (!res?.ok) return;
      const data: { status: string; studentId: string | null } = await res.json();
      if (data.status === 'pending' && data.studentId) {
        const sid = data.studentId;
        await fetch('/api/scraper/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'scraping' }),
        }).catch(() => {});
        void scrapeStudent(sid);
      }
    }, 1000);

    return () => globalThis.clearInterval(id);
  }, [isElectron, phase, scrapeStudent]);

  // ---------------------------------------------------------------------------
  // Session reset (partition change)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (prevPartitionRef.current === partitionId) return;
    prevPartitionRef.current = partitionId;
    autoRunIndexRef.current  = 0;
    autoRunActiveRef.current = false;
    setScrapeResult(null);
    setError(null);
    setLog([]);
    setShowBrowser(false);
    setPhase('browser');
    setStepIndex(0);
    setBotStep('');
  }, [partitionId, setPhase]);

  const handleClearSession = useCallback(() => resetSession(), [resetSession]);

  const registerWebviewSlot = useCallback((el: HTMLDivElement | null) => {
    setSlotElement(el);
  }, []);

  const isBusy = phase === 'login' || phase === 'scraping';

  return (
    <ScraperContext.Provider
      value={{
        phase, currentUrl, botStep, showBrowser, error,
        scrapeResult, log, stepIndex, studentId, partitionId,
        isBusy, isElectron,
        setStudentId,
        execStep:         (id) => { void execStep(id); },
        execNextStep:     ()   => { void execNextStep(); },
        execAll:          ()   => { void execAll(); },
        scrapeStudent:    (id) => { void scrapeStudent(id); },
        handleClearSession,
        registerWebviewSlot,
      }}
    >
      {children}
      {isElectron && (
        <PersistentWebview
          webviewRef={webviewRef}
          partitionId={partitionId}
          slotElement={slotElement}
          onReady={setWebviewReady}
          showBrowser={showBrowser}
        />
      )}
    </ScraperContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScraperContext(): ScraperContextValue {
  const ctx = useContext(ScraperContext);
  if (!ctx) throw new Error('useScraperContext must be used inside ScraperProvider');
  return ctx;
}
