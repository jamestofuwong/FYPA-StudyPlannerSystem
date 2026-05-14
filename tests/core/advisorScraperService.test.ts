// @ts-nocheck
/**
 * Coverage tests for advisorScraperService.ts
 * Targets lines 43-244 (all runScraperStep branches) and 312-313 (runAllSteps login detection)
 */

import {
  runScraperStep,
  runAllSteps,
  isMicrosoftLoginUrl,
  isLoggedInPortalUrl,
  sanitizeUrl,
} from '@core/services/scrapper/advisorScraperService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(overrides: Partial<{
  loadURL: jest.Mock;
  executeJavaScript: jest.Mock;
  getURL: jest.Mock;
}> = {}) {
  return {
    loadURL: jest.fn().mockResolvedValue(undefined),
    executeJavaScript: jest.fn().mockResolvedValue({}),
    getURL: jest.fn().mockReturnValue('https://portal.example.com'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

describe('advisorScraperService – URL helpers', () => {
  test('isMicrosoftLoginUrl returns true for MS login URLs', () => {
    expect(isMicrosoftLoginUrl('https://login.microsoftonline.com/tenant/oauth2')).toBe(true);
    expect(isMicrosoftLoginUrl('https://portal.example.com')).toBe(false);
  });

  test('isLoggedInPortalUrl returns true for portal hostname', () => {
    expect(isLoggedInPortalUrl('https://sisportal-100380.campusnexus.cloud/CMCPortal/secure')).toBe(true);
    expect(isLoggedInPortalUrl('https://other.com')).toBe(false);
    expect(isLoggedInPortalUrl('not-a-url')).toBe(false);
  });

  test('sanitizeUrl returns null for empty/whitespace', () => {
    expect(sanitizeUrl('')).toBeNull();
    expect(sanitizeUrl('   ')).toBeNull();
  });

  test('sanitizeUrl strips quotes and returns https URLs', () => {
    expect(sanitizeUrl('"https://example.com"')).toBe('https://example.com');
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  test('sanitizeUrl returns null for non-http URLs', () => {
    expect(sanitizeUrl('ftp://example.com')).toBeNull();
    expect(sanitizeUrl('javascript:void(0)')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – go-degree (line ~148)
// ---------------------------------------------------------------------------

describe('runScraperStep – go-degree', () => {
  test('loads DEGREE_URL and logs navigation', async () => {
    const adapter = makeAdapter();
    const result = await runScraperStep('go-degree', adapter);
    expect(adapter.loadURL).toHaveBeenCalledWith(expect.stringContaining('Degree1.aspx'));
    expect(result.logs.some((l) => l.includes('Navigating'))).toBe(true);
    expect(result.logs.some((l) => l.includes('Navigated'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – open-degree-iframe (line ~155)
// ---------------------------------------------------------------------------

describe('runScraperStep – open-degree-iframe', () => {
  test('loads iframe URL when iframe is found', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue('https://portal.example.com/iframe'),
    });
    const result = await runScraperStep('open-degree-iframe', adapter);
    expect(adapter.loadURL).toHaveBeenCalledWith('https://portal.example.com/iframe');
    expect(result.logs.some((l) => l.includes('Found iframe'))).toBe(true);
  });

  test('logs warning when no iframe found', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue(null),
    });
    const result = await runScraperStep('open-degree-iframe', adapter);
    expect(adapter.loadURL).not.toHaveBeenCalled();
    expect(result.logs.some((l) => l.includes('No iframe found'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – click-student-dropdown (line ~165)
// ---------------------------------------------------------------------------

describe('runScraperStep – click-student-dropdown', () => {
  test('logs success when dropdown found', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn()
        .mockResolvedValueOnce(true) // WAIT_FOR_KENDO_DROPDOWN_JS
        .mockResolvedValueOnce({ found: true, expanded: true, listItemCount: 5 }), // CLICK_STUDENT_DROPDOWN_JS
    });
    const result = await runScraperStep('click-student-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('Dropdown clicked'))).toBe(true);
  });

  test('logs error when kendo did not appear', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn()
        .mockResolvedValueOnce(false) // WAIT_FOR_KENDO_DROPDOWN_JS — did not appear
        .mockResolvedValueOnce({ found: false }), // CLICK_STUDENT_DROPDOWN_JS
    });
    const result = await runScraperStep('click-student-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('did not appear'))).toBe(true);
    expect(result.logs.some((l) => l.includes('Student dropdown not found'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – wait-for-kendo-list (line ~179)
// ---------------------------------------------------------------------------

describe('runScraperStep – wait-for-kendo-list', () => {
  test('logs success when list populated', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ success: true, itemCount: 10 }),
    });
    const result = await runScraperStep('wait-for-kendo-list', adapter);
    expect(result.logs.some((l) => l.includes('10 items'))).toBe(true);
  });

  test('logs error when list fails', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ success: false, error: 'Timeout waiting for list' }),
    });
    const result = await runScraperStep('wait-for-kendo-list', adapter);
    expect(result.logs.some((l) => l.includes('Timeout waiting for list'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – open-student-dropdown (line ~188)
// ---------------------------------------------------------------------------

describe('runScraperStep – open-student-dropdown', () => {
  test('logs success with already open detail', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ success: true, alreadyOpen: true }),
    });
    const result = await runScraperStep('open-student-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('already open'))).toBe(true);
  });

  test('logs success with attempt/poll detail', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ success: true, alreadyOpen: false, attempt: 1, polls: 3 }),
    });
    const result = await runScraperStep('open-student-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('attempt 1'))).toBe(true);
  });

  test('logs error when dropdown fails to open', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ success: false, error: 'Dropdown not found' }),
    });
    const result = await runScraperStep('open-student-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('Dropdown not found'))).toBe(true);
  });

  test('logs generic error when no error message provided', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ success: false }),
    });
    const result = await runScraperStep('open-student-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('Failed to open student dropdown'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – enter-student-id (line ~200)
// ---------------------------------------------------------------------------

describe('runScraperStep – enter-student-id', () => {
  test('returns studentName extracted from clickedText', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({
        success: true,
        clickedText: 'BA-CS-2024-0001 Alice Johnson',
      }),
    });
    const result = await runScraperStep('enter-student-id', adapter, { studentId: 'BA-CS-2024-0001' });
    expect(result.studentName).toBe('Alice Johnson');
    expect(result.logs.some((l) => l.includes('Alice Johnson'))).toBe(true);
  });

  test('returns no studentName when clickedText equals studentId', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({
        success: true,
        clickedText: 'BA-CS-2024-0001',
      }),
    });
    const result = await runScraperStep('enter-student-id', adapter, { studentId: 'BA-CS-2024-0001' });
    expect(result.studentName).toBeUndefined();
  });

  test('logs error when enter-student-id fails', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ success: false, error: 'Student not found in list' }),
    });
    const result = await runScraperStep('enter-student-id', adapter, { studentId: 'INVALID' });
    expect(result.logs.some((l) => l.includes('Student not found in list'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – click-dropdown (line ~215)
// ---------------------------------------------------------------------------

describe('runScraperStep – click-dropdown', () => {
  test('logs success when enrollment dropdown found', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ found: true, expanded: true, options: [{ text: 'Opt1' }] }),
    });
    const result = await runScraperStep('click-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('options: 1'))).toBe(true);
  });

  test('logs error when enrollment dropdown not found', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ found: false }),
    });
    const result = await runScraperStep('click-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('Enrollment dropdown not found'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – select-dropdown (line ~225)
// ---------------------------------------------------------------------------

describe('runScraperStep – select-dropdown', () => {
  test('logs selected option and returns enrollmentOptions', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({
        clicked: true,
        selectedOption: { text: 'Latest Enrollment', value: '1' },
        allOptions: [{ text: 'Latest Enrollment', value: '1' }, { text: 'Earliest', value: '2' }],
        error: null,
      }),
    });
    const result = await runScraperStep('select-dropdown', adapter, { enrollmentMode: 'latest' });
    expect(result.logs.some((l) => l.includes('Latest Enrollment'))).toBe(true);
    expect(result.enrollmentOptions).toHaveLength(2);
    expect(result.selectedEnrollment).toBe('Latest Enrollment');
  });

  test('logs warning when no option selected', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({
        clicked: false,
        selectedOption: null,
        allOptions: [],
        error: 'No matching option',
      }),
    });
    const result = await runScraperStep('select-dropdown', adapter, { enrollmentMode: 'latest' });
    expect(result.logs.some((l) => l.includes('No matching option'))).toBe(true);
    expect(result.selectedEnrollment).toBeUndefined();
  });

  test('logs generic warning when no error message and nothing selected', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({ clicked: false, selectedOption: null, allOptions: [] }),
    });
    const result = await runScraperStep('select-dropdown', adapter);
    expect(result.logs.some((l) => l.includes('No option selected'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – scrape-program-data (line ~237)
// ---------------------------------------------------------------------------

describe('runScraperStep – scrape-program-data', () => {
  test('returns scraped=false when program section does not appear', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue(false), // WAIT_FOR_PROGRAM_SECTION_JS
    });
    const result = await runScraperStep('scrape-program-data', adapter);
    expect(result.scrapeResult?.scraped).toBe(false);
    expect(result.scrapeResult?.error).toMatch(/did not render/i);
    expect(result.logs.some((l) => l.includes('did not appear'))).toBe(true);
  });

  test('returns full scrapeResult when program data found', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn()
        .mockResolvedValueOnce(true) // WAIT_FOR_PROGRAM_SECTION_JS
        .mockResolvedValueOnce({     // SCRAPE_PROGRAM_DATA_JS
          found: true,
          data: { studentName: 'Alice', course: 'CS' },
          rawGrid: [],
          rowCount: 1,
        })
        .mockResolvedValueOnce({     // EXTRACT_GRID_JS
          found: true,
          rows: [{ courseId: 'COS101', courseTitle: 'Intro', credits: '12.5', earned: '12.5', status: 'Complete', grade: 'A', term: 'T1' }],
          rowCount: 1,
        }),
    });
    const result = await runScraperStep('scrape-program-data', adapter);
    expect(result.scrapeResult?.scraped).toBe(true);
    expect(result.scrapeResult?.gridRowCount).toBe(1);
    expect(result.logs.some((l) => l.includes('1 rows'))).toBe(true);
  });

  test('returns scraped=false when programData.found is false', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn()
        .mockResolvedValueOnce(true) // WAIT_FOR_PROGRAM_SECTION_JS
        .mockResolvedValueOnce({ found: false, error: 'Section not rendered' }) // SCRAPE_PROGRAM_DATA_JS
        .mockResolvedValueOnce({ found: false, rowCount: 0 }), // EXTRACT_GRID_JS
    });
    const result = await runScraperStep('scrape-program-data', adapter);
    expect(result.scrapeResult?.scraped).toBe(false);
    expect(result.scrapeResult?.error).toBe('Section not rendered');
  });
});

// ---------------------------------------------------------------------------
// runScraperStep – unknown step returns empty logs
// ---------------------------------------------------------------------------

describe('runScraperStep – unknown stepId', () => {
  test('returns empty logs for unrecognised step', async () => {
    const adapter = makeAdapter();
    const result = await runScraperStep('nonexistent-step' as any, adapter);
    expect(result.logs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// runAllSteps – lines 312-313 (login detection mid-pipeline)
// ---------------------------------------------------------------------------

describe('runAllSteps', () => {
  test('stops and returns loginDetected=true when MS login URL detected (lines 312-313)', async () => {
    let callCount = 0;
    const adapter = makeAdapter({
      executeJavaScript: jest.fn().mockResolvedValue({}),
      getURL: jest.fn().mockImplementation(() => {
        callCount++;
        // Return MS login URL after the first step completes
        return callCount > 1
          ? 'https://login.microsoftonline.com/tenant'
          : 'https://portal.example.com';
      }),
    });
    const result = await runAllSteps(adapter, { studentId: 'TEST' });
    expect(result.loginDetected).toBe(true);
    expect(result.logs.some((l) => l.includes('Microsoft login required'))).toBe(true);
  });

  test('completes all steps and returns loginDetected=undefined when no login redirect', async () => {
    const adapter = makeAdapter({
      executeJavaScript: jest.fn()
        // open-degree-iframe: no iframe
        .mockResolvedValueOnce(null)
        // click-student-dropdown: appeared=false, then not found
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce({ found: false })
        // wait-for-kendo-list: success
        .mockResolvedValueOnce({ success: true, itemCount: 0 })
        // enter-student-id
        .mockResolvedValueOnce({ success: false, error: 'not found' })
        // click-dropdown
        .mockResolvedValueOnce({ found: false })
        // select-dropdown
        .mockResolvedValueOnce({ clicked: false, allOptions: [] })
        // scrape-program-data: wait returns false
        .mockResolvedValueOnce(false),
      getURL: jest.fn().mockReturnValue('https://portal.example.com'),
    });
    const result = await runAllSteps(adapter, { studentId: 'S001' });
    expect(result.loginDetected).toBeUndefined();
    expect(result.scrapeResult?.scraped).toBe(false);
  });

  test('carries scrapeResult through to final return', async () => {
    const scrapeResult = { scraped: true, data: { studentName: 'Bob' }, rowCount: 1 };
    const adapter = makeAdapter({
      executeJavaScript: jest.fn()
        .mockResolvedValueOnce(null)           // open-degree-iframe: no iframe
        .mockResolvedValueOnce(false)          // click-student-dropdown: wait
        .mockResolvedValueOnce({ found: false }) // click-student-dropdown: click
        .mockResolvedValueOnce({ success: true, itemCount: 1 }) // wait-for-kendo-list
        .mockResolvedValueOnce({ success: true, clickedText: 'S001 Bob' }) // enter-student-id
        .mockResolvedValueOnce({ found: true, expanded: true, options: [] }) // click-dropdown
        .mockResolvedValueOnce({ clicked: true, selectedOption: { text: 'Latest' }, allOptions: [] }) // select-dropdown
        .mockResolvedValueOnce(true)           // wait-for-program-section
        .mockResolvedValueOnce({ found: true, data: { studentName: 'Bob' }, rowCount: 1 }) // scrape
        .mockResolvedValueOnce({ found: true, rows: [], rowCount: 0 }), // extract-grid
      getURL: jest.fn().mockReturnValue('https://portal.example.com'),
    });
    const result = await runAllSteps(adapter, { studentId: 'S001' });
    expect(result.scrapeResult?.scraped).toBe(true);
    expect(result.loginDetected).toBeUndefined();
  });
});