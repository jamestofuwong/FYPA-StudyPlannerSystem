/** @jest-environment jsdom */
// @ts-nocheck
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DashboardPage from '@/app/(pages)/dashboard/page';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

jest.mock('@/components/providers/ScraperContext', () => ({
  ScraperProvider: ({ children }) => <>{children}</>,
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
  PortalAuthProvider: ({ children }) => <>{children}</>,
  usePortalAuth: () => ({ isLoggedIn: true, isPortalLoading: false, openLoginModal: jest.fn() }),
}));

const unit = (code, name, category, year, semester) => ({
  category,
  year_level: year,
  semester,
  unit: { unit_code: code, unit_name: name, requisite_groups: [] },
});

const PLANNER = {
  id: 'p1',
  intake_month: 3,
  major: { name: 'Software Development' },
  course: { name: 'BA-CS' },
  minors: [
    {
      id: 'm1',
      name: 'Data Analytics',
      units: [
        { unit: { unit_code: 'COS10022', unit_name: 'Introduction to Data Science' } },
        { unit: { unit_code: 'COS20015', unit_name: 'Fundamentals of Data Management' } },
      ],
    },
  ],
  units: [
    unit('COS10009', 'Introduction to Programming', 'core', 1, 1),
    unit('COS20007', 'Object-oriented Programming', 'core', 1, 2),
  ],
};

const GENERATED = {
  semesters: [
    { year: 1, semester: 1, units: [{ code: 'COS10009', name: 'Introduction to Programming', category: 'core' }] },
    { year: 1, semester: 2, units: [{ code: 'COS20007', name: 'Object-oriented Programming', category: 'core' }] },
  ],
  unschedulableUnits: [],
  warnings: [],
};

function Seed({ loaded = true, planners = [PLANNER] }) {
  const session = useStudentSession();
  useEffect(() => {
    if (!loaded) return;
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { studentName: 'Test Student', courseList: [], selectedEnrollment: 'BA-CS' },
    });
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      match: { status: 'matched', totalCredits: 100, unmatchedCore: [], rankedPlanners: [] },
      planners,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const Harness = ({ page = 'dashboard', loaded = true, planners = [PLANNER] }) => (
  <ToastProvider>
    <StudentSessionProvider>
      <Seed loaded={loaded} planners={planners} />
      {page === 'dashboard' ? <DashboardPage /> : <PathwayPage />}
    </StudentSessionProvider>
  </ToastProvider>
);

const push = () => useRouter().push;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: GENERATED,
          units: [],
          // The route resolves the start slot itself, and the page reads it back
          startYear: 1,
          startSemester: 1,
          intakeSemester: 1,
          requirements: [],
          completedUnits: [],
        }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ status: 'idle' }) });
  });
});

const openPathwayTab = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: 'Student Pathway' }));
};

describe('dashboard no longer carries its own planner', () => {
  test('the Extended Study Plan section and its generate button are gone', async () => {
    render(<Harness />);
    await openPathwayTab();

    expect(screen.queryByText('Extended Study Plan')).toBeNull();
    expect(screen.queryByText(/Generate Custom Pathway/i)).toBeNull();
    expect(screen.queryByText(/Regenerate Pathway/i)).toBeNull();
    // The tab and the section title share the name, so look for the card's own content
    expect(screen.getByRole('button', { name: 'Open Student Pathway' })).toBeTruthy();
  });

  test('opening the dashboard never calls the custom planner', async () => {
    render(<Harness />);
    await openPathwayTab();

    const planner = global.fetch.mock.calls.filter((c) => String(c[0]).includes('/api/custom-planner'));
    expect(planner).toHaveLength(0);
  });
});

describe('dashboard to pathway', () => {
  test('Open Student Pathway navigates to the pathway panel', async () => {
    render(<Harness />);
    await openPathwayTab();

    fireEvent.click(screen.getByRole('button', { name: 'Open Student Pathway' }));

    expect(push()).toHaveBeenCalledWith('/pathway');
  });

  test('before any pathway exists it invites the advisor to generate one', async () => {
    render(<Harness />);
    await openPathwayTab();

    expect(screen.getByText(/Generate and edit a custom pathway for this student/i)).toBeTruthy();
    expect(screen.queryByText(/A pathway has been generated for this student/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Open Student Pathway' }).disabled).toBe(false);
  });

  test('it is disabled, with a hint, when the student has no planner to build on', async () => {
    render(<Harness planners={[]} />);
    await openPathwayTab();

    const button = screen.getByRole('button', { name: 'Open Student Pathway' });
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Load a student first to open their pathway/i)).toBeTruthy();

    fireEvent.click(button);
    expect(push()).not.toHaveBeenCalled();
  });
});

describe('pathway to dashboard', () => {
  test('Back to Major Detection navigates to the dashboard panel', async () => {
    render(<Harness page="pathway" />);

    fireEvent.click(await screen.findByRole('button', { name: /Back to Major Detection/i }));

    expect(push()).toHaveBeenCalledWith('/dashboard');
  });
});

describe('a plan generated on the pathway page', () => {
  test('still dims the superseded semesters on the dashboard', async () => {
    const { rerender } = render(<Harness page="pathway" />);

    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });
    await screen.findByText('COS10009');

    rerender(<Harness page="dashboard" />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Unit Plan' }));

    const superseded = await screen.findAllByText('superseded by custom plan');
    expect(superseded.length).toBeGreaterThan(0);
  });

  test('the dashboard says a pathway has been generated', async () => {
    const { rerender } = render(<Harness page="pathway" />);
    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });
    await screen.findByText('COS10009');

    rerender(<Harness page="dashboard" />);
    await openPathwayTab();

    expect(screen.getByText(/A pathway has been generated for this student/i)).toBeTruthy();
  });
});

describe('dashboard tabs and minor cards', () => {
  test('the pathway tab reads "Student Pathway", not "Extended Plan"', async () => {
    render(<Harness />);

    expect(await screen.findByRole('tab', { name: 'Student Pathway' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Extended Plan' })).toBeNull();
  });

  test('minor cards no longer offer to include the minor in a custom plan', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Minors' }));

    await screen.findByText('Data Analytics');
    expect(screen.queryByText(/Include in Custom Plan/i)).toBeNull();
    expect(screen.queryByText(/Remove from Plan/i)).toBeNull();
  });

  test('minor progress is still shown', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Minors' }));

    expect(await screen.findByText('Data Analytics')).toBeTruthy();
    expect(screen.getByText(/0\/2 units · 0% progress/)).toBeTruthy();
    expect(screen.getByText(/2 remaining/)).toBeTruthy();
  });
});
