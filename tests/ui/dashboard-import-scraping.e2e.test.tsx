/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '@/app/(pages)/dashboard/page';
import ImportPage from '@/app/(pages)/import/page';
import ScrapingPage from '@/app/(pages)/scraping/page';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { StudentSessionProvider } from '@/components/providers/StudentSessionContext';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  prefetch: jest.fn(),
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/components/providers/ScraperContext', () => ({
  ScraperProvider: ({ children }: any) => <>{children}</>,
  useScraperContext: () => ({
    isBusy: false,
    studentLoaded: false,
    botStep: '',
    phase: 'ready',
    scrapeResult: null,
    scrapeStudent: jest.fn(),
    fetchStudentSuggestions: jest.fn().mockResolvedValue([]),
    isElectron: true,
  }),
}));

jest.mock('@/components/providers/PortalAuthContext', () => ({
  PortalAuthProvider: ({ children }: any) => <>{children}</>,
  usePortalAuth: () => ({
    isLoggedIn: true,
    isPortalLoading: false,
    openLoginModal: jest.fn(),
  }),
}));

const dashboardStudent = {
  studentName: 'Alex Tan',
  course: 'Bachelor of Computer Science',
  status: 'Active',
  cgpa: 3.4,
  creditsRequired: 300,
  creditsCompleted: 100,
  scheduledCredits: 25,
  gradeLevel: 'Year 2',
  enrollmentDate: '2024-02-01',
  graduationDate: null,
  selectedEnrollment: 'Bachelor of Computer Science',
  courseList: [
    {
      courseId: 'COS10009',
      courseTitle: 'Introduction to Programming',
      level: '1',
      credits: 12.5,
      creditsEarned: 12.5,
      status: 'Complete',
      grade: 'HD',
      term: '2024-S1',
    },
  ],
};

const plannerPayload = {
  id: 'planner-1',
  course: { name: 'Bachelor of Computer Science' },
  major: { name: 'Software Development' },
  intake_year: 2024,
  intake_month: 2,
  units: [
    {
      year_level: 1,
      semester: 1,
      category: 'core',
      unit: { unit_code: 'COS10009', unit_name: 'Introduction to Programming' },
      requisite_groups: [],
    },
    {
      year_level: 1,
      semester: 2,
      category: 'elective',
      unit: { unit_code: 'COS20001', unit_name: 'Cloud Systems' },
      requisite_groups: [],
    },
  ],
};

const alternatePlannerPayload = {
  ...plannerPayload,
  id: 'planner-2',
  major: { name: 'Cybersecurity' },
  units: [
    {
      year_level: 1,
      semester: 1,
      category: 'core',
      unit: { unit_code: 'COS10009', unit_name: 'Introduction to Programming' },
      requisite_groups: [],
    },
    {
      year_level: 2,
      semester: 1,
      category: 'major_core',
      unit: { unit_code: 'CYB20001', unit_name: 'Network Security' },
      requisite_groups: [],
    },
  ],
};

const plannerImportPayload = {
  planner: {
    course_information: {
      course: 'Bachelor of Computer Science',
      major: 'Software Development',
      intake: 'February',
      intake_year: 2024,
      requirements: {
        core: { count: 1, cp: 12.5 },
        major: { count: 1, cp: 12.5 },
        elective: { count: 1, cp: 12.5 },
        wil: { count: 0, cp: 0 },
      },
    },
    categories: {
      core_units: [
        {
          unit_code: 'COS10009',
          unit_name: 'Introduction to Programming',
          year_level: 1,
          semester: 1,
          credit_points: 12.5,
          category: 'core',
          offered_in: [1],
        },
      ],
      major_units: [],
      mpu_group: [],
      elective_groups: {
        prescribed_elective: [],
        elective: [],
      },
      minor_groups: [],
      wil_group: [],
    },
  },
  report: {
    validation_issues: [],
    extracted_units: 1,
    unit_counts: {
      core_units: 1,
      major_units: 0,
    },
  },
};

function renderDashboard() {
  return render(
    <ToastProvider>
      <StudentSessionProvider>
        <DashboardPage />
      </StudentSessionProvider>
    </ToastProvider>
  );
}

function renderImport() {
  return render(
    <ToastProvider>
      <ImportPage />
    </ToastProvider>
  );
}

function renderScraping() {
  return render(<ScrapingPage />);
}

function dashboardHappyResponse(input: RequestInfo | URL) {
    const url = String(input);

    if (url === '/api/scraper/status') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ sessionStatus: 'logged-in', studentCount: 1 }),
      } as Response);
    }

    if (url.includes('/api/scraper/portal-students/search')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: [{ student_id: 'STU001', name: 'Alex Tan', db_id: 7 }],
        }),
      } as Response);
    }

    if (url.includes('/api/scraper/portal-students')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ students: [{ student_id: 'STU001', name: 'Alex Tan', db_id: 7 }] }),
      } as Response);
    }

    if (url === '/api/scraper/portal-enrollments') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          enrollments: [{ EnrollId: 11, EnrollmentDesc: 'Bachelor of Computer Science' }],
        }),
      } as Response);
    }

    if (url === '/api/scraper/portal-fetch') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, student: dashboardStudent }),
      } as Response);
    }

    if (url === '/api/match') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            status: 'majorDetected',
            totalCredits: 100,
            unmatchedCore: ['COS20001'],
            rankedPlanners: [
              {
                plannerID: 'planner-1',
                majorName: 'Software Development',
                matchPct: 86,
                missingCore: ['COS20001'],
                missingMajorCore: [],
              },
            ],
            primaryMajor: { matchPct: 86 },
          },
        }),
      } as Response);
    }

    if (url === '/api/planners/planner-1') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(plannerPayload),
      } as Response);
    }

    if (url === '/api/export') {
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['ok'])),
        json: () => Promise.resolve({}),
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
}

function mockDashboardHappyFetch() {
  global.fetch = jest.fn(dashboardHappyResponse);
}

async function loadDashboardStudent() {
  renderDashboard();

  const input = await screen.findByPlaceholderText(/Student ID or name/i);
  fireEvent.change(input, { target: { value: 'STU001' } });
  fireEvent.click(screen.getAllByRole('button', { name: /^search$/i }).at(-1)!);

  await waitFor(() => {
    expect(screen.getAllByText('Alex Tan').length).toBeGreaterThan(0);
  });
  await waitFor(() => {
    expect(screen.getByText(/Ranked Planners/i)).toBeInTheDocument();
  });
}

describe('dashboard e2e happy and failed paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.push.mockClear();
    URL.createObjectURL = jest.fn(() => 'blob:report');
    URL.revokeObjectURL = jest.fn();
    HTMLAnchorElement.prototype.click = jest.fn();
  });

  test('loads student planner data, shows unit status groups, opens pathway, and exports report', async () => {
    mockDashboardHappyFetch();
    await loadDashboardStudent();

    expect(screen.getByText('Software Development')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Unit Plan/i }));
    expect(await screen.findByText('COS10009')).toBeInTheDocument();
    expect(screen.getByText('COS20001')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Student Pathway/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Open Student Pathway/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/pathway');

    fireEvent.click(screen.getByRole('button', { name: /^Export$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Export \(/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/export', expect.objectContaining({ method: 'POST' }));
    });
    expect(await screen.findByText(/Report exported successfully/i)).toBeInTheDocument();
  });

  test('major detection flow shows student details, ranked planner switching, graduation, unit plan, and pathway entry', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/match') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              status: 'majorDetected',
              totalCredits: 100,
              unmatchedCore: ['COS20001'],
              rankedPlanners: [
                {
                  plannerID: 'planner-1',
                  majorName: 'Software Development',
                  matchPct: 86,
                  missingCore: ['COS20001'],
                  missingMajorCore: [],
                },
                {
                  plannerID: 'planner-2',
                  majorName: 'Cybersecurity',
                  matchPct: 72,
                  missingCore: ['CYB20001'],
                  missingMajorCore: [],
                },
              ],
              primaryMajor: { matchPct: 86 },
            },
          }),
        } as Response);
      }
      if (url === '/api/planners/planner-2') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(alternatePlannerPayload) } as Response);
      }
      return dashboardHappyResponse(input);
    });

    await loadDashboardStudent();

    expect(screen.getAllByText('Alex Tan').length).toBeGreaterThan(0);
    expect(screen.getByText(/Ranked Planners/i)).toBeInTheDocument();
    expect(screen.getByText('Software Development')).toBeInTheDocument();
    expect(screen.getByText('Cybersecurity')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Cybersecurity/i }));
    expect(screen.getByRole('tab', { name: /Cybersecurity/i })).toHaveAttribute('aria-selected', 'true');

    expect(screen.getByRole('tab', { name: /Analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Graduation/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Unit Plan/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Student Pathway/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Graduation/i }));
    expect(await screen.findByText(/Graduation Check/i)).toBeInTheDocument();
    expect(screen.getByText(/graduation requirements/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Unit Plan/i }));
    expect(await screen.findByText('COS10009')).toBeInTheDocument();
    expect(screen.getByText('CYB20001')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Student Pathway/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Open Student Pathway/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/pathway');
  });

  test('shows an error state when dashboard APIs return empty or error responses', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/scraper/status') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionStatus: 'logged-in', studentCount: 1 }) } as Response);
      }
      if (url.includes('/api/scraper/portal-students/search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        } as Response);
      }
      if (url.includes('/api/scraper/portal-students')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ students: [] }) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Portal unavailable' }) } as Response);
    });

    renderDashboard();
    const input = await screen.findByPlaceholderText(/Student ID or name/i);
    fireEvent.change(input, { target: { value: 'UNKNOWN' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText(/Scrape Failed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Select a student from the suggestions/i).length).toBeGreaterThan(0);
  });

  test('requires choosing from multiple student suggestions, then loads the selected student enrollment', async () => {
    const portalFetchBodies: any[] = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/scraper/status') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionStatus: 'logged-in', studentCount: 2 }) } as Response);
      }
      if (url.includes('/api/scraper/portal-students/search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            results: [
              { student_id: 'STU001', name: 'Alex Tan', db_id: 7 },
              { student_id: 'STU002', name: 'Alex Lim', db_id: 8 },
            ],
          }),
        } as Response);
      }
      if (url.includes('/api/scraper/portal-students')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            students: [
              { student_id: 'STU001', name: 'Alex Tan', db_id: 7 },
              { student_id: 'STU002', name: 'Alex Lim', db_id: 8 },
            ],
          }),
        } as Response);
      }
      if (url === '/api/scraper/portal-enrollments') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            enrollments: [
              { EnrollId: 11, EnrollmentDesc: 'Bachelor of Computer Science' },
              { EnrollId: 3, EnrollmentDesc: 'Bachelor of Computer Science - Old' },
            ],
          }),
        } as Response);
      }
      if (url === '/api/scraper/portal-fetch') {
        portalFetchBodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, student: dashboardStudent }) } as Response);
      }
      return dashboardHappyResponse(input);
    });

    renderDashboard();
    const input = await screen.findByPlaceholderText(/Student ID or name/i);
    fireEvent.change(input, { target: { value: 'Alex' } });
    expect(await screen.findByText('Alex Tan')).toBeInTheDocument();
    expect(screen.getByText('Alex Lim')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText('Alex Tan'));
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => {
      expect(portalFetchBodies).toEqual(
        expect.arrayContaining([expect.objectContaining({ dbId: 7, enrollID: 11, studentNumber: 'STU001' })])
      );
    });
    expect(await screen.findByText(/Ranked Planners/i)).toBeInTheDocument();
  });

  test('supports earliest enrollment mode and match-against-different-planner success and failure', async () => {
    const portalFetchBodies: any[] = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/scraper/portal-enrollments') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            enrollments: [
              { EnrollId: 99, EnrollmentDesc: 'Bachelor of Computer Science Latest' },
              { EnrollId: 2, EnrollmentDesc: 'Bachelor of Computer Science Earliest' },
            ],
          }),
        } as Response);
      }
      if (url === '/api/scraper/portal-fetch') {
        portalFetchBodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, student: dashboardStudent }) } as Response);
      }
      if (url === '/api/planners') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { ...plannerPayload, id: 'manual-1', major: { name: 'Data Science' }, _count: { units: 2 } },
          ]),
        } as Response);
      }
      if (url === '/api/planners/manual-1') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...plannerPayload, id: 'manual-1', major: { name: 'Data Science' } }) } as Response);
      }
      if (url === '/api/planners/broken-planner') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Failed to fetch planner.' }) } as Response);
      }
      return dashboardHappyResponse(input);
    });

    renderDashboard();
    fireEvent.change(await screen.findByPlaceholderText(/Student ID or name/i), { target: { value: 'STU001' } });
    fireEvent.change(screen.getByDisplayValue('Latest'), { target: { value: 'earliest' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    await waitFor(() => expect(portalFetchBodies.at(-1)).toEqual(expect.objectContaining({ enrollID: 2 })));

    fireEvent.click(await screen.findByRole('button', { name: /Match against a different planner/i }));
    fireEvent.click(await screen.findByText('Data Science'));
    expect(await screen.findByRole('tab', { name: /Data Science/i })).toHaveAttribute('aria-selected', 'true');

    cleanup();
    await loadDashboardStudent();
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'broken-planner', course: { name: 'Broken Course' }, major: { name: 'Broken Planner' }, _count: { units: 1 } }]) } as Response);
      }
      if (url === '/api/planners/broken-planner') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Failed to fetch planner.' }) } as Response);
      }
      return dashboardHappyResponse(input);
    });
    fireEvent.click(screen.getByRole('button', { name: /Match against a different planner/i }));
    fireEvent.click(await screen.findByText('Broken Planner'));
    expect(await screen.findByText(/Failed to fetch planner/i)).toBeInTheDocument();
  });

  test('handles malformed planner data without crashing', async () => {
    mockDashboardHappyFetch();
    (global.fetch as jest.Mock).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/planners/planner-1') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...plannerPayload, units: null }),
        } as Response);
      }
      return dashboardHappyResponse(input);
    });

    await loadDashboardStudent();
    expect(screen.getByText(/Ranked Planners/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Unit Plan/i }));
    expect(screen.getByRole('tab', { name: /Unit Plan/i })).toHaveAttribute('aria-selected', 'true');
  });

  test('shows useful errors for missing planner data and export API failure', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/scraper/status') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionStatus: 'logged-in', studentCount: 1 }) } as Response);
      }
      if (url.includes('/api/scraper/portal-students/search')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [{ student_id: 'STU001', name: 'Alex Tan', db_id: 7 }] }) } as Response);
      }
      if (url.includes('/api/scraper/portal-students')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ students: [{ student_id: 'STU001', name: 'Alex Tan', db_id: 7 }] }) } as Response);
      }
      if (url === '/api/scraper/portal-enrollments') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ enrollments: [{ EnrollId: 11, EnrollmentDesc: 'Bachelor of Computer Science' }] }) } as Response);
      }
      if (url === '/api/scraper/portal-fetch') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, student: dashboardStudent }) } as Response);
      }
      if (url === '/api/match') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { rankedPlanners: [], primaryMajor: null } }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderDashboard();
    const input = await screen.findByPlaceholderText(/Student ID or name/i);
    fireEvent.change(input, { target: { value: 'STU001' } });
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(await screen.findByText(/No matching planner found/i)).toBeInTheDocument();
    cleanup();

    mockDashboardHappyFetch();
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/export') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Export service unavailable' }),
        } as Response);
      }
      return dashboardHappyResponse(input);
    });

    await loadDashboardStudent();
    fireEvent.click(screen.getByRole('button', { name: /^Export$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Export \(/i }));

    expect(await screen.findByText(/Export service unavailable/i)).toBeInTheDocument();
  });
});

describe('student import e2e happy and failed paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:planner');
    URL.revokeObjectURL = jest.fn();
  });

  test('imports a valid planner PDF, shows progress/completion, and saves it', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(plannerImportPayload),
        } as Response);
      }
      if (url === '/api/planners/save') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ plannerId: 'planner-1' }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const { container } = renderImport();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['pdf'], 'planner.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByDisplayValue('planner.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Upload$/i }));
    expect(await screen.findByText(/Planner parsed successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/Extracted Summary/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Save/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/planners/save', expect.objectContaining({ method: 'POST' }));
    });
    expect(await screen.findByText(/Planner saved to database successfully/i)).toBeInTheDocument();
  });

  test('rejects invalid file type, surfaces validation issues, duplicate save, and import API errors', async () => {
    const { container, unmount } = renderImport();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['text'], 'student.csv', { type: 'text/csv' })] },
    });

    expect(await screen.findByText(/Please choose a PDF planner file/i)).toBeInTheDocument();
    unmount();

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ...plannerImportPayload,
            report: {
              validation_issues: ['Missing required course information'],
              unit_counts: { core_units: 1, major_units: 0 },
            },
          }),
        } as Response);
      }
      if (url === '/api/planners/save') {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Duplicate planner already exists' }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const view = renderImport();
    const validInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(validInput, {
      target: { files: [new File(['pdf'], 'planner.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^Upload$/i }));

    await waitFor(() => expect(screen.getAllByText(/Review Required/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Missing required course information/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Save/i }));
    expect(await screen.findByText(/Duplicate planner already exists/i)).toBeInTheDocument();

    view.unmount();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Import API unavailable' }),
      } as Response)
    );

    const failed = renderImport();
    const failedInput = failed.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(failedInput, {
      target: { files: [new File(['pdf'], 'broken.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^Upload$/i }));
    expect(await screen.findByText(/Import API unavailable/i)).toBeInTheDocument();
  });
});

describe('scraping portal e2e happy and failed paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('logs in, searches, fetches enrollments, loads a degree audit, and logs out', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/scraper/status') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sessionStatus: 'logged-in',
            sessionError: null,
            studentCount: 1,
            manualMode: false,
            manualStep: 0,
            manualStepError: null,
          }),
        } as Response);
      }
      if (url === '/api/scraper/portal-students') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ students: [{ student_id: 'STU001', name: 'Alex Tan', db_id: 7 }] }),
        } as Response);
      }
      if (url.startsWith('/api/scraper/portal-students/search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ student_id: 'STU001', name: 'Alex Tan', db_id: 7 }] }),
        } as Response);
      }
      if (url === '/api/scraper/portal-enrollments') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ enrollments: [{ EnrollId: 11, EnrollmentDesc: 'Bachelor of Computer Science' }] }),
        } as Response);
      }
      if (url === '/api/scraper/portal-fetch') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, student: dashboardStudent }),
        } as Response);
      }
      if (url === '/api/scraper/logout') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    });

    renderScraping();
    await waitFor(() => expect(screen.getAllByText(/Connected/i).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getAllByText(/Alex Tan/i).length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByRole('button', { name: /Select/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Bachelor of Computer Science/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/scraper/portal-fetch',
        expect.objectContaining({ method: 'POST' })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /^Logout$/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/scraper/logout', { method: 'POST' });
    });
    expect(screen.getByRole('button', { name: /Login to Portal/i })).toBeInTheDocument();
  });

  test('handles invalid login, empty search, fetch failure, and logout failure without breaking UI', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/scraper/status') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sessionStatus: 'login-error',
            sessionError: 'Invalid credentials',
            studentCount: 0,
            manualMode: false,
            manualStep: 0,
            manualStepError: null,
          }),
        } as Response);
      }
      if (url === '/api/scraper/login') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) } as Response);
    });

    const { unmount } = renderScraping();
    await waitFor(() => expect(screen.getAllByText(/Login failed/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Invalid credentials/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Login to Portal/i }));
    expect(await screen.findByText(/Waiting for SSO/i)).toBeInTheDocument();
    unmount();

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/scraper/status') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sessionStatus: 'logged-in',
            sessionError: null,
            studentCount: 1,
            manualMode: false,
            manualStep: 0,
            manualStepError: null,
          }),
        } as Response);
      }
      if (url === '/api/scraper/portal-students') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ students: [{ student_id: 'STU001', name: 'Alex Tan', db_id: 7 }] }) } as Response);
      }
      if (url === '/api/scraper/portal-enrollments') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ enrollments: [{ EnrollId: 11, EnrollmentDesc: 'Bachelor of Computer Science' }] }) } as Response);
      }
      if (url === '/api/scraper/portal-fetch') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: false, error: 'Portal timeout' }) } as Response);
      }
      if (url === '/api/scraper/logout') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Logout failed' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderScraping();
    await waitFor(() => expect(screen.getAllByText(/Connected/i).length).toBeGreaterThan(0));
    const filter = await screen.findByPlaceholderText(/Filter by name or ID/i);
    fireEvent.change(filter, { target: { value: 'Nobody' } });
    expect(screen.queryByRole('button', { name: /Select/i })).not.toBeInTheDocument();

    fireEvent.change(filter, { target: { value: '' } });
    fireEvent.click(await screen.findByRole('button', { name: /Select/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Bachelor of Computer Science/i }));
    expect(await screen.findByText(/Portal timeout/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Logout$/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/scraper/logout', { method: 'POST' });
    });
    expect(screen.getAllByText(/Connected/i).length).toBeGreaterThan(0);
  });
});
