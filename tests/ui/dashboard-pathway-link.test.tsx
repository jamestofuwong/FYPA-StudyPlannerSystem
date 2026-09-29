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

function Seed({ loaded = true, planners = [PLANNER], enrollment = 'BA-CS' }) {
  const session = useStudentSession();
  useEffect(() => {
    if (!loaded) return;
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { studentName: 'Test Student', courseList: [], selectedEnrollment: enrollment },
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

const Harness = ({ page = 'dashboard', loaded = true, planners = [PLANNER], enrollment = 'BA-CS' }) => (
  <ToastProvider>
    <StudentSessionProvider>
      <Seed loaded={loaded} planners={planners} enrollment={enrollment} />
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

  test('the loaded pathway keeps its own Back button and shows no empty state', async () => {
    render(<Harness page="pathway" />);

    expect(await screen.findByRole('button', { name: /Back to Major Detection/i })).toBeTruthy();
    expect(screen.queryByText('No student loaded')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Go to Major Detection' })).toBeNull();
  });
});

describe('the empty pathway states lead back to Major Detection', () => {
  test('with no student loaded, a Go to Major Detection button goes to the dashboard panel', async () => {
    render(<Harness page="pathway" loaded={false} />);

    expect(await screen.findByText('No student loaded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Major Detection' }));

    expect(push()).toHaveBeenCalledTimes(1);
    expect(push()).toHaveBeenCalledWith('/dashboard');
  });

  test('with an MPU enrollment, the same button appears and does the same thing', async () => {
    render(<Harness page="pathway" enrollment="Mata Pelajaran Umum" />);

    expect(await screen.findByText('No pathway for an MPU enrollment')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Major Detection' }));

    expect(push()).toHaveBeenCalledTimes(1);
    expect(push()).toHaveBeenCalledWith('/dashboard');
  });

  test('a student with no planner selected is the no-student state, with the same button', async () => {
    render(<Harness page="pathway" planners={[]} />);

    expect(await screen.findByText('No student loaded')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to Major Detection' })).toBeTruthy();
  });

  test('each empty state offers exactly one button, and it is not the loaded Back button', async () => {
    const { unmount } = render(<Harness page="pathway" loaded={false} />);
    await screen.findByText('No student loaded');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Back to Major Detection/i })).toBeNull();
    unmount();

    render(<Harness page="pathway" enrollment="Mata Pelajaran Umum" />);
    await screen.findByText('No pathway for an MPU enrollment');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('it goes to the same panel the dashboard button is the counterpart of, through panelToPath', async () => {
    // The pathway button from the dashboard pushes /pathway; this one pushes the
    // dashboard panel through the same helper, so the two paths cannot drift apart
    const { panelToPath } = jest.requireActual('@/lib/navigation');
    render(<Harness page="pathway" loaded={false} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Go to Major Detection' }));

    expect(push()).toHaveBeenCalledWith(panelToPath('dashboard'));
    expect(push()).not.toHaveBeenCalledWith(panelToPath('pathway'));
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

describe('dashboard tabs', () => {
  test('the pathway tab reads "Student Pathway", not "Extended Plan"', async () => {
    render(<Harness />);

    expect(await screen.findByRole('tab', { name: 'Student Pathway' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Extended Plan' })).toBeNull();
  });

  // The planner in this fixture has a minor, so hasMinors would have been true
  test('there is no Minors tab, even for a planner that has minors', async () => {
    render(<Harness />);
    await screen.findByRole('tab', { name: 'Analytics' });

    expect(screen.queryByRole('tab', { name: 'Minors' })).toBeNull();
    expect(screen.queryByText('Minors', { selector: '[role="tab"]' })).toBeNull();
  });

  test('exactly four tabs remain, in order', async () => {
    render(<Harness />);
    await screen.findByRole('tab', { name: 'Analytics' });

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Analytics',
      'Graduation',
      'Unit Plan',
      'Student Pathway',
    ]);
  });

  test('no minor card, progress line or include control appears on any tab', async () => {
    render(<Harness />);

    // 'Minors' is listed so that a tab that came back would be opened and caught
    for (const name of ['Analytics', 'Graduation', 'Unit Plan', 'Minors', 'Student Pathway']) {
      const tab = await screen.findByRole('tab', { name: 'Analytics' }).then(() => screen.queryByRole('tab', { name }));
      if (tab) fireEvent.click(tab);

      expect(screen.queryByText('Data Analytics')).toBeNull();
      expect(screen.queryByText(/Minors & Specializations/i)).toBeNull();
      expect(screen.queryByText(/units · \d+% progress/i)).toBeNull();
      expect(screen.queryByText(/Include in Custom Plan/i)).toBeNull();
      expect(screen.queryByText(/Remove from Plan/i)).toBeNull();
      expect(screen.queryByText(/free elective slots remain/i)).toBeNull();
    }
  });

  test('the remaining tabs still render and switch', async () => {
    render(<Harness />);
    const tab = async (name: string) => screen.findByRole('tab', { name });

    // Analytics is the default
    expect((await tab('Analytics')).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('Not Yet Taken')).toBeTruthy();

    fireEvent.click(await tab('Graduation'));
    expect((await tab('Graduation')).getAttribute('aria-selected')).toBe('true');
    expect((await tab('Analytics')).getAttribute('aria-selected')).toBe('false');
    expect(await screen.findByText('Graduation Check')).toBeTruthy();
    expect(screen.queryByText('Not Yet Taken')).toBeNull();

    fireEvent.click(await tab('Unit Plan'));
    expect((await tab('Unit Plan')).getAttribute('aria-selected')).toBe('true');
    expect((await screen.findAllByText(/YEAR 1 · SEM 1/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Graduation Check')).toBeNull();

    fireEvent.click(await tab('Student Pathway'));
    expect((await tab('Student Pathway')).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('button', { name: 'Open Student Pathway' })).toBeTruthy();
    expect(screen.queryByText(/YEAR 1 · SEM 1/)).toBeNull();

    // And back again
    fireEvent.click(await tab('Analytics'));
    expect(await screen.findByText('Not Yet Taken')).toBeTruthy();
  });
});
