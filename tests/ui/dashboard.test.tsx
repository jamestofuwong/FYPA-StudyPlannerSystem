/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DashboardPage from '@/app/(pages)/dashboard/page';
import { PortalAuthProvider, usePortalAuth } from '@/components/providers/PortalAuthContext';
import { ScraperProvider } from '@/components/providers/ScraperContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

process.on('unhandledRejection', (reason) => {
  console.warn('Unhandled Rejection at:', reason);
});

// Mock ScraperContext
jest.mock('@/components/providers/ScraperContext', () => ({
  ScraperProvider: ({ children }: any) => <>{children}</>,
  useScraperContext: () => ({
    isBusy: false,
    studentLoaded: false,
    botStep: '',
    phase: 'ready', 
    scrapeResult: { units: [{ code: 'COS10009' }] },
    scrapeStudent: jest.fn(),
    fetchStudentSuggestions: jest.fn().mockResolvedValue([]), 
    isElectron: true,
  })
}));

// Mock PortalAuthContext - Tell the dashboard we logged in
jest.mock('@/components/providers/PortalAuthContext', () => ({
  PortalAuthProvider: ({ children }: any) => <>{children}</>,
  usePortalAuth: () => ({
    isLoggedIn: true,       
    isPortalLoading: false,
    openLoginModal: jest.fn(),
  })
}));

let intervalSpy: jest.SpyInstance;
const storageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: storageMock });

describe('Dashboard Ultimate Coverage Booster', () => {
  let intervalSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    intervalSpy = jest.spyOn(global, 'setInterval');
    
    global.fetch = jest.fn().mockImplementation(() => 
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ status: 'idle' })
      })
    );
  });

  afterEach(async() => {
    if (intervalSpy) intervalSpy.mockRestore();
    await act(async () => {
        jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    if (intervalSpy) intervalSpy.mockRestore();
    jest.clearAllMocks();
  });

  test('triggers search and transitions to results (UIT-04)', async () => {
    let scraperStatus = 'idle';

    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/scraper/start')) {
        scraperStatus = 'done'; 
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (url.includes('/api/scraper/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
              status: scraperStatus, // Return 'idle' first, then 'done' after search
              result: scraperStatus === 'done' ? { studentName: 'Test Student', courseList: [], enrollmentDate: '01/02/2024' } : null
          }),
        });
      }
      // Endpoints for Matching & Data
      if (url.includes('/api/match')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
              success: true, 
              data: { rankedPlanners: [{ plannerID: '1', matchPct: 85 }], primaryMajor: { matchPct: 85 } } 
          }),
        });
      }
      if (url.includes('/api/planners')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            id: '1',
            course: { name: 'Computer Science' },
            major: { name: 'AI' },
            units: [{ year_level: 1, semester: 1, category: 'core', unit: { unit_code: 'COS10009', unit_name: 'Test' } }] 
          }),
        });
      }
      return Promise.reject(new Error(`Unknown API: ${url}`));
    });

    // RENDER
    render(
      <ToastProvider>
        <PortalAuthProvider>
          <ScraperProvider>
            <DashboardPage />
          </ScraperProvider>
        </PortalAuthProvider>
      </ToastProvider>
    );

    // VERIFY LANDING SCREEN after render
    expect(screen.getByText(/Enter a Student ID to begin/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Student ID or name/i);
    fireEvent.change(input, { target: { value: 'BA-CS-2024-0001' } });
    fireEvent.click(screen.getByText('Search'));

    // WAIT FOR RESULTS -prove transition
    await waitFor(() => {
      expect(screen.getByText('Test Student')).toBeInTheDocument();
    }, { timeout: 3000 });

    // TEST UI INTERACTION (Toggle Year)
    const yearHeader = screen.getByText(/YEAR 1/i);
    fireEvent.click(yearHeader); // Toggle closed
    fireEvent.click(yearHeader); // Toggle open

    // TEST CLEAR BUTTON
    const clearBtn = screen.getByText(/Clear/i);
    fireEvent.click(clearBtn);
    
    //VERIFY RETURN TO LANDING SCREEN
    expect(screen.getByText(/Enter a Student ID to begin/i)).toBeInTheDocument();
  });

  test('Dashboard Extension: Enrollment Switching and Custom Pathway (Lines 1381-1510)', async () => {
    // Setup a dedicated fetch mock for this lifecycle
    let status = 'idle';
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/scraper/start')) {
        status = 'done';
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (url.includes('/api/scraper/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            status: status, 
            result: status === 'done' ? { studentName: 'Test', courseList: [], enrollmentDate: '01/01/2024' } : null 
          })
        });
      }
      if (url.includes('/api/match')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            success: true, 
            data: { rankedPlanners: [{ plannerID: '1', matchPct: 85 }], primaryMajor: { matchPct: 85 } } 
          })
        });
      }
      if (url.includes('/api/planners')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            id: '1',
            units: [{ year_level: 1, semester: 1, category: 'core', unit: { unit_code: 'COS1', unit_name: 'U1' } }],
            minors: [{ id: 'm1', name: 'AI Minor', units: [{ unit: { unit_code: 'AI1' } }] }]
          })
        });
      }
      if (url.includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { semesters: [{ year: 1, semester: 2, units: [] }], unschedulableUnits: [] } })
        });
      }
      return Promise.reject(new Error(`Unknown API in Extension: ${url}`));
    });

    render(
      <ToastProvider><PortalAuthProvider><ScraperProvider>
        <DashboardPage />
      </ScraperProvider></PortalAuthProvider></ToastProvider>
    );

    //Perform Search
    const input = screen.getByPlaceholderText(/Student ID or name/i);
    fireEvent.change(input, { target: { value: 'BA-CS-2024-0001' } });
    fireEvent.click(screen.getByText('Search'));

    await waitFor(() => expect(screen.getByText(/Ranked Planners/i)).toBeInTheDocument(), { timeout: 3000 });

    // TEST CUSTOM PATHWAY GENERATION (Targets lines 1381-1510)
    const generateBtn = screen.getByText(/Generate Custom Pathway/i);

    await act(async () => {
      fireEvent.click(generateBtn);
    });

    await screen.findByText(/Extended Study Plan/i, {}, { timeout: 5000 });

    // TEST MINOR INJECTION (Targets logic around line 1450)
    const includeMinorBtn = screen.getByText(/\+ Include in Custom Plan/i);
    await act(async () => {
      fireEvent.click(includeMinorBtn);
    });
    
    // Verify it changed to "Remove"
    expect(screen.getByText(/✕ Remove from Plan/i)).toBeInTheDocument();
  });

  test('Dashboard Coverage: Graduation Eligibility Logic (Lines 1445-1510)', async () => {
    // Generate 24 units to reach exactly 300 CP (24 * 12.5)
    const mockUnits = Array.from({ length: 24 }, (_, i) => ({
      courseId: `UNIT-${i}`,
      status: 'Complete'
    }));

    const plannerUnits = mockUnits.map((u, i) => ({
      year_level: Math.floor(i / 8) + 1,
      semester: (i % 2) + 1,
      category: 'core',
      unit: { unit_code: u.courseId, unit_name: `Unit ${i}` }
    }));

    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/scraper/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            status: 'done', 
            result: { studentName: 'Grad Student', courseList: mockUnits, enrollmentDate: '01/01/2024' } 
          })
        });
      }
      if (url.includes('/api/planners')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: '1', units: plannerUnits })
        });
      }
      if (url.includes('/api/match')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            success: true, 
            data: { 
                rankedPlanners: [{ plannerID: '1', matchPct: 100 }],
                totalCredits: 300, 
                unmatchedCore: []
            } 
          })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    });

    render(
      <ToastProvider><PortalAuthProvider><ScraperProvider>
        <DashboardPage />
      </ScraperProvider></PortalAuthProvider></ToastProvider>
    );

    fireEvent.change(screen.getByPlaceholderText(/Student ID/i), { target: { value: 'GRAD-OK' } });
    fireEvent.click(screen.getByText('Search'));

    // Use a specific matcher to avoid conflict with unit codes
    await waitFor(() => {
      expect(screen.getByText(/✅ ELIGIBLE/)).toBeInTheDocument();
    }, { timeout: 4000 });
    
    // Verify the green color is applied (Targets Line 1460)
    const eligibleLabel = screen.getByText(/✅ ELIGIBLE/);
    expect(eligibleLabel).toHaveStyle('color: var(--accent-green)');
  });

  test('Dashboard: Handles successful XLSX import flow', async () => {
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/import')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            courseList: [{ courseId: 'IMP1', status: 'Complete', creditsEarned: 12.5 }] 
          })
        });
      }
      if (url.includes('/api/match')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { rankedPlanners: [{ plannerID: 'p1', matchPct: 90 }] } })
        });
      }
      if (url.includes('/api/planners')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'p1', units: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'idle' }) });
    });

    render(<ToastProvider><PortalAuthProvider><ScraperProvider><DashboardPage /></ScraperProvider></PortalAuthProvider></ToastProvider>);
    
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));
    
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText('Load'));

    await waitFor(() => {
      expect(screen.getByText(/Export/i)).toBeInTheDocument();
      expect(screen.getByText(/✕ Clear/i)).toBeInTheDocument();
    }, { timeout: 10000 });
  }, 30000);

  test('Dashboard: handles import panel intake inputs (Line 360+)', async () => {
    render(<ToastProvider><PortalAuthProvider><ScraperProvider><DashboardPage /></ScraperProvider></PortalAuthProvider></ToastProvider>);
    
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));
    
    const semSelect = screen.getByDisplayValue('Sem 1');
    fireEvent.change(semSelect, { target: { value: '2' } });
    
    expect(semSelect).toHaveValue('2');
  });

  test('Dashboard manual import uses unit suggestions and prevents duplicate codes', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/scraper/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'idle' }),
        });
      }
      if (url.includes('/api/units')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { unit_code: 'COS10009', unit_name: 'Introduction to Programming' },
          ]),
        });
      }
      if (url.includes('/api/match')) {
        const body = JSON.parse(String(options?.body));
        expect(body.student.completedUnitCodes).toEqual(['COS10009']);
        expect(body.student.intakeYear).toBe(new Date().getFullYear());
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              rankedPlanners: [{ plannerID: 'p1', matchPct: 90 }],
              primaryMajor: { plannerID: 'p1', matchPct: 90 },
            },
          }),
        });
      }
      if (url === '/api/planners/p1') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'p1',
            units: [{
              year_level: 1,
              semester: 1,
              category: 'core',
              unit: { unit_code: 'COS10009', unit_name: 'Introduction to Programming' },
            }],
            minors: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <ToastProvider><PortalAuthProvider><ScraperProvider>
        <DashboardPage />
      </ScraperProvider></PortalAuthProvider></ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Units' }));

    const unitInput = screen.getByPlaceholderText(/BACS2003 or Data Structures/i);
    fireEvent.change(unitInput, { target: { value: 'cos' } });

    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    const suggestion = await screen.findByText('COS10009');
    fireEvent.mouseDown(suggestion.closest('div')!);

    expect(screen.getByText('1 unit')).toBeInTheDocument();

    fireEvent.change(unitInput, { target: { value: 'COS10009' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unit code already added');

    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(screen.getByText(/Ranked Planners/i)).toBeInTheDocument();
      expect(screen.getByText(/COS10009/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  test('Dashboard paste import parses transcript rows and submits normalized progress', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/scraper/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'idle' }),
        });
      }
      if (url.includes('/api/match')) {
        const body = JSON.parse(String(options?.body));
        expect(body.student.completedUnitCodes).toEqual(['COS10003', 'COS30015']);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              rankedPlanners: [{ plannerID: 'p1', matchPct: 75 }],
              primaryMajor: { plannerID: 'p1', matchPct: 75 },
            },
          }),
        });
      }
      if (url === '/api/planners/p1') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 'p1',
            units: [
              {
                year_level: 1,
                semester: 1,
                category: 'core',
                unit: { unit_code: 'COS10003', unit_name: 'Computer and Logic Essentials' },
              },
              {
                year_level: 3,
                semester: 1,
                category: 'major_core',
                unit: { unit_code: 'COS30015', unit_name: 'IT Security' },
              },
            ],
            minors: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <ToastProvider><PortalAuthProvider><ScraperProvider>
        <DashboardPage />
      </ScraperProvider></PortalAuthProvider></ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste Table' }));

    fireEvent.change(screen.getByPlaceholderText(/COS10003/i), {
      target: {
        value: [
          'Course\tCourse Title\tCredits\tEarned\tStatus\tGrade\tTerm',
          'cos10003\tComputer and Logic Essentials\t12.5\t12.5\tComplete\tHD\t2024_FEB_S1',
          'cos30015\tIT Security\t12.5\t0\tCurrent\t\t2026_MAR_S1',
        ].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(screen.getByText(/Ranked Planners/i)).toBeInTheDocument();
      expect(screen.getByText(/12\.5 credits this term/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  test('Dashboard: restores session from sessionStorage on mount', async () => {
    const mockSession = JSON.stringify({
      studentId: 'RESTORED-ID',
      data: { 
        student: { studentName: 'Old Session', courseList: [] },
        // ADD THIS: The UI crashes without this matching object
        match: { 
          totalCredits: 150, 
          unmatchedCore: [],
          rankedPlanners: [{ plannerID: 'p1', matchPct: 90 }] 
        },
        planners: [{ id: 'p1', units: [] }]
      }
    });
    
    storageMock.getItem.mockReturnValue(mockSession);

    await act(async () => {
      render(
        <ToastProvider>
          <PortalAuthProvider>
            <ScraperProvider>
              <DashboardPage />
            </ScraperProvider>
          </PortalAuthProvider>
        </ToastProvider>
      );
    });
    
    const input = await screen.findByDisplayValue('RESTORED-ID');
    expect(input).toBeInTheDocument();
    expect(screen.getByText('Old Session')).toBeInTheDocument();
    
    storageMock.getItem.mockReturnValue(null);
  });

  test('Dashboard: Handles manual planner fetch failure (Line 1357)', async () => {
    const mockSession = JSON.stringify({
      studentId: 'STU-001',
      data: {
        student: { studentName: 'Test Student', courseList: [], enrollmentOptions: [], selectedEnrollment: '' },
        match: {
          totalCredits: 150,
          unmatchedCore: [],
          rankedPlanners: [{ plannerID: 'p1', majorName: 'Test Major', matchPct: 80 }],
        },
        planners: [{
          id: 'p1',
          course: { name: 'Bachelor of CS' },
          major: { name: 'Test Major' },
          intake_year: 2022,
          intake_month: 2,
          units: [],
          minors: [],
        }],
        completedCodes: [],
        intakeYear: 2022,
        studentId: 'STU-001',
        enrollmentMode: 'latest',
        mpuCourseList: [],
      },
    });

    storageMock.getItem.mockReturnValue(mockSession);

    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/scraper/status'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'idle' }) });
      // planner list — success
      if (url === '/api/planners')
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{
            id: 'fail-id',
            course: { name: 'Bachelor of CS' },
            major: { name: 'Fail Major' },
            intake_year: 2023,
            intake_month: 2,
            _count: { units: 28 },
          }]),
        });
      // individual planner fetch — failure
      if (url.match(/\/api\/planners\/.+/))
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await act(async () => {
      render(
        <ToastProvider>
          <PortalAuthProvider>
            <ScraperProvider>
              <DashboardPage />
            </ScraperProvider>
          </PortalAuthProvider>
        </ToastProvider>
      );
    });

    // Session restore puts us in dashboard view immediately
    await waitFor(() =>
      expect(screen.getByText(/Match against a different planner/i)).toBeInTheDocument(),
      { timeout: 3000 }
    );

    fireEvent.click(screen.getByText(/Match against a different planner/i));

    const failItem = await screen.findByText(/Fail Major/i);

    await act(async () => {
      fireEvent.click(failItem);
    });

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(/Failed to fetch planner/i);

    storageMock.getItem.mockReturnValue(null);
  }, 25000);

  test('Dashboard Graduation: Ineligible due to missing core units', async () => {
    // Student has completed nothing — planner has a core unit → INELIGIBLE
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: any) => {
      if (url.includes('/api/scraper/start'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      if (url.includes('/api/scraper/status'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          status: 'done',
          result: { studentName: 'Test Student', courseList: [], enrollmentDate: '01/02/2024' },
        })});
      if (url.includes('/api/match'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          success: true,
          data: { rankedPlanners: [{ plannerID: '1', matchPct: 80 }], primaryMajor: { matchPct: 80 } },
        })});
      if (url.includes('/api/planners'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          id: '1',
          units: [{ year_level: 1, semester: 1, category: 'core', unit: { unit_code: 'CORE1', unit_name: 'Core Unit' } }],
        })});
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<ToastProvider><PortalAuthProvider><ScraperProvider><DashboardPage /></ScraperProvider></PortalAuthProvider></ToastProvider>);

    fireEvent.change(screen.getByPlaceholderText(/Student ID or name/i), { target: { value: 'TEST-001' } });
    fireEvent.click(screen.getByText('Search'));

    await waitFor(() => expect(screen.getByText(/❌ INELIGIBLE/i)).toBeInTheDocument(), { timeout: 5000 });
  });

  test('Dashboard Graduation: Ineligible due to low credits (< 300 CP)', async () => {
    // Only 1 completed core unit = 12.5 CP < 300 → INELIGIBLE, shows credits
    (global.fetch as jest.Mock).mockImplementation((url: string, opts?: any) => {
      if (url.includes('/api/scraper/start'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      if (url.includes('/api/scraper/status'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          status: 'done',
          result: {
            studentName: 'Test Student',
            courseList: [{ courseId: 'CORE1', status: 'Complete' }],
            enrollmentDate: '01/02/2024',
          },
        })});
      if (url.includes('/api/match'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          success: true,
          data: { rankedPlanners: [{ plannerID: '1', matchPct: 80 }], primaryMajor: { matchPct: 80 } },
        })});
      if (url.includes('/api/planners'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({
          id: '1',
          // 24 core units = 300 CP required; only CORE1 is complete = 12.5 CP
          units: Array.from({ length: 24 }, (_, i) => ({
            year_level: Math.floor(i / 4) + 1,
            semester: (i % 2) + 1,
            category: 'core',
            unit: { unit_code: `CORE${i + 1}`, unit_name: `Core Unit ${i + 1}` },
          })),
        })});
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<ToastProvider><PortalAuthProvider><ScraperProvider><DashboardPage /></ScraperProvider></PortalAuthProvider></ToastProvider>);

    fireEvent.change(screen.getByPlaceholderText(/Student ID or name/i), { target: { value: 'TEST-002' } });
    fireEvent.click(screen.getByText('Search'));

    // Component renders: "Credits: 12.5/300 CP"
    await waitFor(() => expect(screen.getByText(/12\.5\/300 CP/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/❌ INELIGIBLE/i)).toBeInTheDocument();
  });
});
