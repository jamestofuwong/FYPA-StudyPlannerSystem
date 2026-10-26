/** @jest-environment jsdom */
// @ts-nocheck
import React, { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DashboardPage from '@/app/(pages)/dashboard/page';
import { PortalAuthProvider, usePortalAuth } from '@/components/providers/PortalAuthContext';
import { ScraperProvider } from '@/components/providers/ScraperContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import PathwayPage from '@/app/(pages)/pathway/page';

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

// The dashboard reads the portal state from /api/scraper/status: logged in, and a student list that has loaded.
const STATUS_LOGGED_IN = (extra = {}) => ({
  ok: true,
  json: () => Promise.resolve({ sessionStatus: 'logged-in', studentCount: 5, status: 'idle', ...extra }),
});

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

// What the dashboard asks the portal routes when an advisor searches for a student: the suggestions, the enrolments and
// the degree audit. `fallback` answers everything else (matching, planners, import and so on).
const portalApi = (student, fallback = () => ok({})) => (url, options) => {
  const u = String(url);
  if (u.includes('/api/scraper/status')) return Promise.resolve(STATUS_LOGGED_IN());
  if (u.includes('/api/scraper/portal-students/search')) {
    return ok({ results: [{ student_id: new URL(u, 'http://x').searchParams.get('q'), name: student.studentName, db_id: 7 }] });
  }
  if (u.includes('/api/scraper/portal-enrollments')) return ok({ enrollments: [{ EnrollId: 11, EnrollmentDesc: 'Bachelor of Computer Science' }] });
  if (u.includes('/api/scraper/portal-fetch')) return ok({ ok: true, student });
  return fallback(u, options);
};

// The search box is enabled once the status poll says that the portal is logged in and its student list has loaded.
const searchFor = async (id) => {
  const input = await screen.findByPlaceholderText(/Student ID or name/i);
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: id } });
  fireEvent.click(screen.getByText('Search'));
};

describe('Dashboard', () => {
  let intervalSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    intervalSpy = jest.spyOn(global, 'setInterval');
    
    global.fetch = jest.fn().mockImplementation((url) => 
      String(url).includes('/api/scraper/status')
        ? Promise.resolve(STATUS_LOGGED_IN())
        : Promise.resolve({
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
    (global.fetch as jest.Mock).mockImplementation(portalApi(
      { studentName: 'Test Student', courseList: [], enrollmentDate: '01/02/2024' },
      (url) => {
        if (url.includes('/api/match')) {
          return ok({ success: true, data: { rankedPlanners: [{ plannerID: '1', matchPct: 85 }], primaryMajor: { matchPct: 85 } } });
        }
        if (url.includes('/api/planners')) {
          return ok({
            id: '1',
            course: { name: 'Computer Science' },
            major: { name: 'AI' },
            units: [{ year_level: 1, semester: 1, category: 'core', unit: { unit_code: 'COS10009', unit_name: 'Test' } }],
          });
        }
        return Promise.reject(new Error(`Unknown API: ${url}`));
      },
    ));

    render(
      <ToastProvider>
        <PortalAuthProvider>
          <ScraperProvider>
            <StudentSessionProvider><DashboardPage /></StudentSessionProvider>
          </ScraperProvider>
        </PortalAuthProvider>
      </ToastProvider>
    );

    // LANDING SCREEN once the portal status is known
    expect(await screen.findByText(/Enter a Student ID to begin/i)).toBeInTheDocument();

    await searchFor('BA-CS-2024-0001');

    // WAIT FOR RESULTS -prove transition
    await waitFor(() => {
      expect(screen.getAllByText('Test Student').length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    fireEvent.click(screen.getByRole('tab', { name: 'Unit Plan' }));

    // TEST UI INTERACTION (Toggle Year)
    const yearHeader = screen.getByText(/YEAR 1/i);
    fireEvent.click(yearHeader); // Toggle closed
    fireEvent.click(yearHeader); // Toggle open

    // TEST CLEAR BUTTON
    const clearBtn = screen.getByText(/Clear/i);
    fireEvent.click(clearBtn);

    //VERIFY RETURN TO LANDING SCREEN
    expect(await screen.findByText(/Enter a Student ID to begin/i)).toBeInTheDocument();
  });

  test('Dashboard Extension: Enrollment Switching and Custom Pathway', async () => {
    (global.fetch as jest.Mock).mockImplementation(portalApi(
      { studentName: 'Test', courseList: [], enrollmentDate: '01/01/2024' },
      (url) => {
        if (url.includes('/api/match')) {
          return ok({ success: true, data: { rankedPlanners: [{ plannerID: '1', matchPct: 85 }], primaryMajor: { matchPct: 85 } } });
        }
        if (url.includes('/api/planners')) {
          return ok({
            id: '1',
            units: [{ year_level: 1, semester: 1, category: 'core', unit: { unit_code: 'COS1', unit_name: 'U1' } }],
            minors: [{ id: 'm1', name: 'AI Minor', units: [{ unit: { unit_code: 'AI1' } }] }]
          });
        }
        if (url.includes('/api/custom-planner')) {
          return ok({
            success: true,
            data: { semesters: [{ year: 1, semester: 2, units: [] }], unschedulableUnits: [] },
            // the minors that the server says can be added to this plan
            availableMinors: [{
              minorId: 'm1',
              minorName: 'AI Minor',
              neededCount: 1,
              units: [{ code: 'AI1', name: 'AI One' }],
              canFitInRemainingBudget: true,
            }],
          });
        }
        return Promise.reject(new Error(`Unknown API in Extension: ${url}`));
      },
    ));

    render(
      <ToastProvider><PortalAuthProvider><ScraperProvider>
        <StudentSessionProvider><DashboardPage /><PathwayPage /></StudentSessionProvider>
      </ScraperProvider></PortalAuthProvider></ToastProvider>
    );

    //Perform Search
    await searchFor('BA-CS-2024-0001');

    await waitFor(() => expect(screen.getByText(/Ranked Planners/i)).toBeInTheDocument(), { timeout: 3000 });

    // The custom pathway is on the Student Pathway page, which shares the loaded student
    // Generate a custom pathway
    const generateBtn = screen.getByText(/Generate Custom Pathway/i);

    await act(async () => {
      fireEvent.click(generateBtn);
    });

    await screen.findByText(/Extended Study Plan/i, {}, { timeout: 5000 });

    // Add a minor to the plan
    const includeMinorBtn = screen.getByText(/\+ Include in Custom Plan/i);
    await act(async () => {
      fireEvent.click(includeMinorBtn);
    });
    
    // Verify it changed to "Remove"
    expect(screen.getByText(/✕ Remove from Plan/i)).toBeInTheDocument();
  });

  test('Dashboard: graduation eligibility', async () => {
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

    (global.fetch as jest.Mock).mockImplementation(portalApi(
      { studentName: 'Grad Student', courseList: mockUnits, enrollmentDate: '01/01/2024', creditsCompleted: 300, creditsRequired: 300 },
      (url) => {
        if (url.includes('/api/planners')) return ok({ id: '1', units: plannerUnits });
        if (url.includes('/api/match')) {
          return ok({
            success: true,
            data: { rankedPlanners: [{ plannerID: '1', matchPct: 100 }], totalCredits: 300, unmatchedCore: [] },
          });
        }
        return ok({ success: true });
      },
    ));

    render(
      <ToastProvider><PortalAuthProvider><ScraperProvider>
        <StudentSessionProvider><DashboardPage /></StudentSessionProvider>
      </ScraperProvider></PortalAuthProvider></ToastProvider>
    );

    await searchFor('GRAD-OK');

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Graduation' })).toBeInTheDocument(), { timeout: 4000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Graduation' }));

    // Use a specific matcher to avoid conflict with unit codes
    await waitFor(() => {
      expect(screen.getByText('ELIGIBLE')).toBeInTheDocument();
    }, { timeout: 4000 });
    
    // The eligible label is green
    const eligibleLabel = screen.getByText('ELIGIBLE');
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

    render(<ToastProvider><PortalAuthProvider><ScraperProvider><StudentSessionProvider><DashboardPage /></StudentSessionProvider></ScraperProvider></PortalAuthProvider></ToastProvider>);
    
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

  test('Dashboard: handles import panel intake inputs', async () => {
    render(<ToastProvider><PortalAuthProvider><ScraperProvider><StudentSessionProvider><DashboardPage /></StudentSessionProvider></ScraperProvider></PortalAuthProvider></ToastProvider>);
    
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
        <StudentSessionProvider><DashboardPage /></StudentSessionProvider>
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
    }, { timeout: 5000 });
    // the unit is on the planner, so it is listed on the Unit Plan tab
    fireEvent.click(screen.getByRole('tab', { name: 'Unit Plan' }));
    expect((await screen.findAllByText(/COS10009/i)).length).toBeGreaterThan(0);
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
        <StudentSessionProvider><DashboardPage /></StudentSessionProvider>
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

  // REQ-SEC-101: student data lives in memory only. A student that an old build left in sessionStorage must not come back.
  test('Dashboard: does not restore a student from sessionStorage, and does not write one there', async () => {
    storageMock.getItem.mockReturnValue(JSON.stringify({
      studentId: 'RESTORED-ID',
      data: { student: { studentName: 'Old Session', courseList: [] }, match: { totalCredits: 150, unmatchedCore: [], rankedPlanners: [] }, planners: [] },
    }));

    await act(async () => {
      render(
        <ToastProvider>
          <PortalAuthProvider>
            <ScraperProvider>
              <StudentSessionProvider><DashboardPage /></StudentSessionProvider>
            </ScraperProvider>
          </PortalAuthProvider>
        </ToastProvider>
      );
    });

    expect(await screen.findByText(/Enter a Student ID to begin/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('RESTORED-ID')).toBeNull();
    expect(screen.queryByText('Old Session')).toBeNull();
    expect(storageMock.setItem).not.toHaveBeenCalled();

    storageMock.getItem.mockReturnValue(null);
  });

  test('Dashboard: Handles manual planner fetch failure', async () => {
    // A student that is already loaded (in memory, as it is after a search)
    function Seed() {
      const session = useStudentSession();
      useEffect(() => {
        session.setStudentLoaded(true);
        session.setScrapedStudent({
          studentId: 'STU-001',
          student: { studentName: 'Test Student', courseList: [], enrollmentOptions: [], selectedEnrollment: '' },
        });
        session.setDashboardData({
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
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

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
              <StudentSessionProvider><Seed /><DashboardPage /></StudentSessionProvider>
            </ScraperProvider>
          </PortalAuthProvider>
        </ToastProvider>
      );
    });

    // A loaded student puts us in the dashboard view
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
  }, 25000);

  test('Dashboard Graduation: Ineligible due to missing core units', async () => {
    // Student has completed nothing — planner has a core unit → INELIGIBLE
    (global.fetch as jest.Mock).mockImplementation(portalApi(
      { studentName: 'Test Student', courseList: [], enrollmentDate: '01/02/2024' },
      (url: string) => {
        if (url.includes('/api/match')) {
          return ok({ success: true, data: { rankedPlanners: [{ plannerID: '1', matchPct: 80 }], primaryMajor: { matchPct: 80 } } });
        }
        if (url.includes('/api/planners')) {
          return ok({
            id: '1',
            units: [{ year_level: 1, semester: 1, category: 'core', unit: { unit_code: 'CORE1', unit_name: 'Core Unit' } }],
          });
        }
        return ok({});
      },
    ));

    render(<ToastProvider><PortalAuthProvider><ScraperProvider><StudentSessionProvider><DashboardPage /></StudentSessionProvider></ScraperProvider></PortalAuthProvider></ToastProvider>);

    await searchFor('TEST-001');

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Graduation' })).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Graduation' }));

    await waitFor(() => expect(screen.getByText('INELIGIBLE')).toBeInTheDocument(), { timeout: 5000 });
  });

  test('Dashboard Graduation: Ineligible due to low credits (< 300 CP)', async () => {
    // Portal creditsCompleted is 12.5 CP < 300 → INELIGIBLE, shows credits
    (global.fetch as jest.Mock).mockImplementation(portalApi(
      {
        studentName: 'Test Student',
        courseList: [{ courseId: 'CORE1', status: 'Complete' }],
        enrollmentDate: '01/02/2024',
        creditsCompleted: 12.5,
        creditsRequired: 300,
      },
      (url: string) => {
        if (url.includes('/api/match')) {
          return ok({ success: true, data: { rankedPlanners: [{ plannerID: '1', matchPct: 80 }], primaryMajor: { matchPct: 80 } } });
        }
        if (url.includes('/api/planners')) {
          return ok({
            id: '1',
            // 24 core units = 300 CP required; only CORE1 is complete = 12.5 CP
            units: Array.from({ length: 24 }, (_, i) => ({
              year_level: Math.floor(i / 4) + 1,
              semester: (i % 2) + 1,
              category: 'core',
              unit: { unit_code: `CORE${i + 1}`, unit_name: `Core Unit ${i + 1}` },
            })),
          });
        }
        return ok({});
      },
    ));

    render(<ToastProvider><PortalAuthProvider><ScraperProvider><StudentSessionProvider><DashboardPage /></StudentSessionProvider></ScraperProvider></PortalAuthProvider></ToastProvider>);

    await searchFor('TEST-002');

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Graduation' })).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('tab', { name: 'Graduation' }));

    // Component renders: "Credits: 12.5/300 CP"
    await waitFor(() => expect(screen.getByText(/12\.5\/300 CP/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText('INELIGIBLE')).toBeInTheDocument();
  });
});
