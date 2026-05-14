/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, act, screen, fireEvent, renderHook  } from '@testing-library/react';
import { ScraperProvider, useScraperContext } from '@/components/providers/ScraperContext';
import { PortalAuthProvider } from '@/components/providers/PortalAuthContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

// ---------------------------------------------------------------------------
// Mock the orchestrator so scrapeStudent never needs a real Electron webview
// ---------------------------------------------------------------------------
jest.mock('@core/services/scrapper/scraperOrchestrator', () => ({
  AUTO_RUN_STEPS:   [],
  STUDENT_STEPS:    [],
  runAutoRun:       jest.fn(),
  runStudentScrape: jest.fn(),
}));

jest.mock('@core/services/scrapper/advisorScraperService', () => ({
  runScraperStep:      jest.fn(),
  runAllSteps:         jest.fn(),
  isMicrosoftLoginUrl: jest.fn(() => false),
  isLoggedInPortalUrl: jest.fn(() => false),
  sanitizeUrl:         jest.fn((url: string) => url),
  TARGET_URL:          'https://portal.example.com',
}));

import { runStudentScrape } from '@core/services/scrapper/scraperOrchestrator';

// ---------------------------------------------------------------------------
// Fake adapter injected via the testability seam added to ScraperContext.tsx
// ---------------------------------------------------------------------------
const fakeAdapter = {
  loadURL:             jest.fn().mockResolvedValue(undefined),
  executeJavaScript:   jest.fn().mockResolvedValue({}),
  getURL:              jest.fn().mockReturnValue('https://portal.example.com'),
  addEventListener:    jest.fn(),
  removeEventListener: jest.fn(),
};

// ---------------------------------------------------------------------------
// Build a mock webview element whose addEventListener captures callbacks.
// ---------------------------------------------------------------------------
function makeMockWebview() {
  const listeners: Record<string, Function[]> = {};
  return {
    addEventListener:    jest.fn((event: string, cb: Function) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    removeEventListener: jest.fn((event: string, cb: Function) => {
      listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb);
    }),
    loadURL:           jest.fn(),
    getURL:            jest.fn().mockReturnValue('https://portal.example.com'),
    executeJavaScript: jest.fn().mockResolvedValue({}),
    emit(event: string, payload: any) {
      (listeners[event] ?? []).forEach((fn) => fn(payload));
    },
  };
}

// ---------------------------------------------------------------------------
// Providers + test component
// ---------------------------------------------------------------------------
const Providers = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>
    <PortalAuthProvider>
      <ScraperProvider>{children}</ScraperProvider>
    </PortalAuthProvider>
  </ToastProvider>
);

const ScraperTestTool = () => {
  const { scrapeStudent, phase, error } = useScraperContext();
  return (
    <div>
      <div data-testid="status">{phase}</div>
      <div data-testid="error-msg">{error ?? ''}</div>
      <button onClick={() => scrapeStudent('123')}>Start Scrape</button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ScraperContext Deep Coverage', () => {
  beforeEach(() => {
    jest.useRealTimers();
    (window as any).__scraperTestAdapter = fakeAdapter;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    (runStudentScrape as jest.Mock).mockReset();

    // Reset ALL service mocks so no test bleeds into the next
    const { runAllSteps, runScraperStep } = jest.requireMock('@core/services/scrapper/advisorScraperService');
    (runAllSteps as jest.Mock).mockResolvedValue({
      logs: [], scrapeResult: null, loginDetected: false,
    });
    (runScraperStep as jest.Mock).mockResolvedValue({
      logs: [], scrapeResult: null, loginDetected: false,
    });
  });

  afterEach(() => {
    delete (window as any).__scraperTestAdapter;
    delete (window as any).__scraperTestWebview;
    delete (window as any).native;
    jest.useRealTimers();
    jest.clearAllMocks();
    (runStudentScrape as jest.Mock).mockClear();
  });

  // ---------------------------------------------------------------------------
  // scrapeStudent — core result branches
  // ---------------------------------------------------------------------------

  test('scrapeStudent: sets error state on orchestrator error', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error:         'Database Timeout',
      loginDetected: false,
      finalResult:   null,
      logs:          [],
    });

    render(<Providers><ScraperTestTool /></Providers>);

    await act(async () => {
      fireEvent.click(screen.getByText('Start Scrape'));
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('error-msg')).toHaveTextContent('Database Timeout');
  });

  test('scrapeStudent: sets phase to ready on successful scrape', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error:         null,
      loginDetected: false,
      finalResult:   { scraped: true, units: [{ code: 'TEST1' }] },
      logs:          [],
    });

    render(<Providers><ScraperTestTool /></Providers>);

    await act(async () => {
      fireEvent.click(screen.getByText('Start Scrape'));
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('status')).toHaveTextContent(/ready/i);
  });

  test('scrapeStudent: sets phase to login when loginDetected', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error: null, loginDetected: true, finalResult: null, logs: [],
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.scrapeStudent('STU-LOGIN');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.phase).toBe('login');
  });

  test('scrapeStudent: PUTs error status when finalResult.scraped is false', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error: null, loginDetected: false,
      finalResult: { scraped: false }, logs: [],
    });

    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchSpy;

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.scrapeStudent('STU-NO-DATA');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/scraper/status',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('error'),
      }),
    );
    expect(result.current.phase).toBe('ready');
  });

  // ---------------------------------------------------------------------------
  // scrapeStudent — enrollmentMode branches
  // ---------------------------------------------------------------------------

  test('scrapeStudent: passes enrollmentMode=earliest to orchestrator', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error: null, loginDetected: false,
      finalResult: { scraped: true }, logs: [],
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.scrapeStudent('STU-001', 'earliest');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runStudentScrape).toHaveBeenCalledWith(
      expect.anything(), 'STU-001', 'earliest', expect.anything(), undefined,
    );
  });

  test('scrapeStudent: passes enrollmentMode=mpu to orchestrator', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error: null, loginDetected: false,
      finalResult: { scraped: true }, logs: [],
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.scrapeStudent('STU-002', 'mpu');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runStudentScrape).toHaveBeenCalledWith(
      expect.anything(), 'STU-002', 'mpu', expect.anything(), undefined,
    );
  });

  test('scrapeStudent: passes enrollmentMode=by-text with enrollmentText to orchestrator', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error: null, loginDetected: false,
      finalResult: { scraped: true }, logs: [],
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.scrapeStudent('STU-003', 'by-text', 'COMP 101');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runStudentScrape).toHaveBeenCalledWith(
      expect.anything(), 'STU-003', 'by-text', expect.anything(), 'COMP 101',
    );
  });

  test('scrapeStudent: defaults enrollmentMode to latest when not specified', async () => {
    (runStudentScrape as jest.Mock).mockResolvedValue({
      error: null, loginDetected: false,
      finalResult: { scraped: true }, logs: [],
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.scrapeStudent('STU-004');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runStudentScrape).toHaveBeenCalledWith(
      expect.anything(), 'STU-004', 'latest', expect.anything(), undefined,
    );
  });

  // ---------------------------------------------------------------------------
  // execAll branches
  // ---------------------------------------------------------------------------

  test('execAll: sets phase to ready/done on success with no scrape data', async () => {
    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.execAll();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(['ready', 'done']).toContain(result.current.phase);
  });

  test('execAll: POSTs to /api/scraper when scrapeResult.scraped is true', async () => {
    const { runAllSteps } = jest.requireMock('@core/services/scrapper/advisorScraperService');
    (runAllSteps as jest.Mock).mockResolvedValue({
      logs: [],
      scrapeResult: { scraped: true, units: [{ code: 'CS101' }] },
      loginDetected: false,
    });

    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    global.fetch = fetchSpy;

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.execAll();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/scraper',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.phase).toBe('done');
  });

  test('execAll: sets phase to login when loginDetected', async () => {
    const { runAllSteps } = jest.requireMock('@core/services/scrapper/advisorScraperService');
    (runAllSteps as jest.Mock).mockResolvedValue({
      logs: [], scrapeResult: null, loginDetected: true,
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.execAll();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.phase).toBe('login');
  });

  // ---------------------------------------------------------------------------
  // execStep branches
  // ---------------------------------------------------------------------------

  test('execStep: sets phase to login when loginDetected', async () => {
    const { runScraperStep } = jest.requireMock('@core/services/scrapper/advisorScraperService');
    (runScraperStep as jest.Mock).mockResolvedValue({
      logs: [], scrapeResult: null, loginDetected: true,
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.execStep('navigate' as any);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.phase).toBe('login');
  });

  test('execStep: stores scrapeResult and sets phase to ready on success', async () => {
    const { runScraperStep } = jest.requireMock('@core/services/scrapper/advisorScraperService');
    (runScraperStep as jest.Mock).mockResolvedValue({
      logs: ['step done'],
      scrapeResult: { scraped: true, units: [] },
      loginDetected: false,
    });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.execStep('navigate' as any);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.scrapeResult).toEqual({ scraped: true, units: [] });
    expect(result.current.phase).toBe('ready');
  });

  // ---------------------------------------------------------------------------
  // execNextStep
  // ---------------------------------------------------------------------------

  test('execNextStep: is a no-op when SCRAPER_STEPS is empty (mock)', async () => {
    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    await act(async () => {
      result.current.execNextStep();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(['idle', 'ready', 'scraping']).toContain(result.current.phase);
  });

  // ---------------------------------------------------------------------------
  // fetchStudentSuggestions
  // ---------------------------------------------------------------------------

  test('fetchStudentSuggestions: returns [] for empty/whitespace query', async () => {
    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    let out: any;
    await act(async () => {
      out = await result.current.fetchStudentSuggestions('   ');
    });

    expect(out).toEqual([]);
  });

  test('fetchStudentSuggestions: returns options on success when phase is ready', async () => {
    const suggestions = [
      { text: 'Alice (2021)', id: 'S001', name: 'Alice' },
      { text: 'Bob (2022)',   id: 'S002', name: 'Bob'   },
    ];
    fakeAdapter.executeJavaScript.mockResolvedValueOnce({ success: true, options: suggestions });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    // Bring context to 'ready' phase first
    (runStudentScrape as jest.Mock).mockResolvedValueOnce({
      error: null, loginDetected: false, finalResult: { scraped: true }, logs: [],
    });
    await act(async () => {
      result.current.scrapeStudent('STU-PRIME');
      await Promise.resolve();
      await Promise.resolve();
    });

    let out: any;
    await act(async () => {
      out = await result.current.fetchStudentSuggestions('Ali');
    });

    expect(out).toEqual(suggestions);
  });

  test('fetchStudentSuggestions: returns [] when success is false', async () => {
    fakeAdapter.executeJavaScript.mockResolvedValueOnce({ success: false, options: [] });

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    (runStudentScrape as jest.Mock).mockResolvedValueOnce({
      error: null, loginDetected: false, finalResult: { scraped: true }, logs: [],
    });
    await act(async () => {
      result.current.scrapeStudent('STU-X');
      await Promise.resolve();
      await Promise.resolve();
    });

    let out: any;
    await act(async () => {
      out = await result.current.fetchStudentSuggestions('xyz');
    });

    expect(out).toEqual([]);
  });

  test('fetchStudentSuggestions: returns [] when executeJavaScript throws', async () => {
    fakeAdapter.executeJavaScript.mockRejectedValueOnce(new Error('JS error'));

    const { result } = renderHook(() => useScraperContext(), { wrapper: Providers });

    (runStudentScrape as jest.Mock).mockResolvedValueOnce({
      error: null, loginDetected: false, finalResult: { scraped: true }, logs: [],
    });
    await act(async () => {
      result.current.scrapeStudent('STU-Y');
      await Promise.resolve();
      await Promise.resolve();
    });

    let out: any;
    await act(async () => {
      out = await result.current.fetchStudentSuggestions('err');
    });

    expect(out).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Lifecycle / cleanup
  // ---------------------------------------------------------------------------

  test('ScraperContext: removes native IPC listener on unmount', () => {
    const removeSpy = jest.fn();
    (window as any).native = {
      ipcRenderer: { on: jest.fn(), removeListener: removeSpy },
    };

    const { unmount } = render(<Providers><ScraperTestTool /></Providers>);
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('native-event', expect.any(Function));
  });

  // ---------------------------------------------------------------------------
  // Webview event listeners (via __scraperTestWebview seam)
  // ---------------------------------------------------------------------------

  test('ScraperContext: sets error state on did-fail-load', async () => {
    const mockWv = makeMockWebview();
    (window as any).__scraperTestWebview = mockWv;
    (window as any).native = { ipcRenderer: { on: jest.fn(), removeListener: jest.fn() } };

    render(<Providers><ScraperTestTool /></Providers>);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mockWv.emit('did-fail-load', {
        isMainFrame:      true,
        errorCode:        -105,
        errorDescription: 'DNS_PROBE_FINISHED_NXDOMAIN',
        validatedURL:     '',
      });
    });

    const errorMsg = await screen.findByTestId('error-msg');
    expect(errorMsg.textContent).toMatch(/DNS_PROBE_FINISHED_NXDOMAIN/i);
  }, 10_000);

  test('ScraperContext: calls loadURL on new-window event', async () => {
    const mockWv = makeMockWebview();
    (window as any).__scraperTestWebview = mockWv;
    (window as any).native = { ipcRenderer: { on: jest.fn(), removeListener: jest.fn() } };

    render(<Providers><ScraperTestTool /></Providers>);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      mockWv.emit('new-window', { url: 'https://portal.example.com/subpage' });
    });

    expect(mockWv.loadURL).toHaveBeenCalledWith('https://portal.example.com/subpage');
  });

  test('ScraperContext: sets phase to login on did-navigate to Microsoft Login', async () => {
    const mockWv = makeMockWebview();
    (window as any).__scraperTestWebview = mockWv;
    (window as any).native = { ipcRenderer: { on: jest.fn(), removeListener: jest.fn() } };

    const { isMicrosoftLoginUrl } = jest.requireMock('@core/services/scrapper/advisorScraperService');
    isMicrosoftLoginUrl.mockReturnValue(true);

    render(<Providers><ScraperTestTool /></Providers>);

    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      mockWv.emit('did-navigate', { url: 'https://login.microsoftonline.com' });
    });

    expect(screen.getByTestId('status')).toHaveTextContent(/login/i);

    isMicrosoftLoginUrl.mockReturnValue(false);
  });
});
