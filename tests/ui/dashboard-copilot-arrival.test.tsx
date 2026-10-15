/** @jest-environment jsdom */
// @ts-nocheck
import React, { useEffect } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import DashboardPage from '@/app/(pages)/dashboard/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ThemeProvider } from '@/styles/themeProvider';

jest.mock('@/components/providers/ScraperContext', () => ({
  ScraperProvider: ({ children }) => <>{children}</>,
  useScraperContext: () => ({ isBusy: false, studentLoaded: false, botStep: '', phase: 'ready', scrapeResult: null, scrapeStudent: jest.fn(), fetchStudentSuggestions: jest.fn().mockResolvedValue([]), isElectron: true }),
}));
jest.mock('@/components/providers/PortalAuthContext', () => ({
  PortalAuthProvider: ({ children }) => <>{children}</>,
  usePortalAuth: () => ({ isLoggedIn: true, isPortalLoading: false, openLoginModal: jest.fn() }),
}));

const PLANNER = { id: 'p1', intake_month: 3, major: { name: 'Software' }, course: { name: 'BA-CS' }, minors: [], units: [] };

let session;
function Seed({ arrival, loaded = true }) {
  session = useStudentSession();
  useEffect(() => {
    if (loaded) {
      session.setStudentLoaded(true);
      session.setScrapedStudent({ studentId: 'S1', student: { studentName: 'Ann Lee', courseList: [], selectedEnrollment: 'BA-CS', enrollmentOptions: [{ text: 'BA-CS' }] } });
      session.setDashboardData({
        completedCodes: [], mpuCourseList: [],
        match: { status: 'matched', totalCredits: 100, unmatchedCore: [], rankedPlanners: [{ plannerID: 'p1', majorName: 'Software', matchPct: 90 }] },
        planners: [PLANNER],
      });
    }
    if (arrival) session.setHandoffArrival(arrival);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const Harness = (props) => (
  <ToastProvider>
    <StudentSessionProvider>
      <Seed {...props} />
      <DashboardPage />
    </StudentSessionProvider>
  </ToastProvider>
);

let scrolled;
beforeEach(() => {
  jest.clearAllMocks();
  scrolled = [];
  Element.prototype.scrollIntoView = function () { scrolled.push(this.id); };
  global.requestAnimationFrame = (cb) => { cb(0); return 0; };
  global.fetch = jest.fn((url) => {
    if (String(url).includes('/api/scraper/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionStatus: 'logged-in', studentCount: 10, status: 'idle' }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
});

const arrival = (over = {}) => ({
  studentId: 'S1', enrollMode: 'latest', section: null,
  dbId: 55, studentName: 'Ann Lee', enrollments: [{ EnrollId: 1, EnrollmentDesc: 'BA-CS' }],
  ...over,
});

describe('opened with prepared data', () => {
  it('fills the search fields from the arrival', async () => {
    render(<Harness arrival={arrival()} />);
    const input = await screen.findByPlaceholderText(/Student ID or name/i);
    await waitFor(() => expect(input.value).toBe('S1'));
    expect(session.handoffArrival).toBeNull();
  });

  it.each([
    ['graduation', 'Graduation'],
    ['units', 'Unit Plan'],
    ['pathway', 'Student Pathway'],
  ])('switches to the %s tab and scrolls to the tab bar', async (section, tabName) => {
    render(<Harness arrival={arrival({ section })} />);
    const tab = await screen.findByRole('tab', { name: tabName });
    await waitFor(() => expect(tab.getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(scrolled).toContain('dash-result-tabs'));
  });

  it('scrolls to an anchor without changing the tab', async () => {
    render(<Harness arrival={arrival({ section: 'ranked-planners' })} />);
    await waitFor(() => expect(scrolled).toContain('dash-ranked-planners'));
    expect((await screen.findByRole('tab', { name: 'Analytics' })).getAttribute('aria-selected')).toBe('true');
  });

  it('stays on the first tab when no section was asked for', async () => {
    render(<Harness arrival={arrival({ section: null })} />);
    expect((await screen.findByRole('tab', { name: 'Analytics' })).getAttribute('aria-selected')).toBe('true');
    expect(scrolled).toEqual([]);
  });
});

describe('opened without prepared data', () => {
  it('searches for the student once the portal is ready, and does not search twice', async () => {
    render(<Harness loaded={false} arrival={arrival({ load: true, dbId: undefined, enrollments: undefined })} />);

    await waitFor(() => {
      const searched = global.fetch.mock.calls.filter((c) => String(c[0]).includes('/api/scraper/portal-students/search'));
      expect(searched).toHaveLength(1);
      expect(String(searched[0][0])).toContain('q=S1');
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const searched = global.fetch.mock.calls.filter((c) => String(c[0]).includes('/api/scraper/portal-students/search'));
    expect(searched).toHaveLength(1);
  });
});

describe('in the Meadow design', () => {
  beforeEach(() => {
    localStorage.setItem('designPreference', 'meadow');
    localStorage.setItem('themePreference', 'light');
  });
  afterEach(() => localStorage.clear());

  it('still switches tab and scrolls to the section', async () => {
    render(<ThemeProvider><Harness arrival={arrival({ section: 'graduation' })} /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset.design).toBe('meadow'));
    const tab = await screen.findByRole('tab', { name: 'Graduation' });
    await waitFor(() => expect(tab.getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(scrolled).toContain('dash-result-tabs'));
  });

  it('still scrolls to the ranked planners anchor', async () => {
    render(<ThemeProvider><Harness arrival={arrival({ section: 'ranked-planners' })} /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset.design).toBe('meadow'));
    await waitFor(() => expect(scrolled).toContain('dash-ranked-planners'));
  });
});
