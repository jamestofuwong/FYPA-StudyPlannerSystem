/** @jest-environment jsdom */
// @ts-nocheck
import React, { useEffect } from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import DashboardPage from '@/app/(pages)/dashboard/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

jest.mock('@/components/providers/ScraperContext', () => ({
  ScraperProvider: ({ children }) => <>{children}</>,
  useScraperContext: () => ({
    isBusy: false, studentLoaded: false, botStep: '', phase: 'ready', scrapeResult: null,
    scrapeStudent: jest.fn(), fetchStudentSuggestions: jest.fn().mockResolvedValue([]), isElectron: true,
  }),
}));

jest.mock('@/components/providers/PortalAuthContext', () => ({
  PortalAuthProvider: ({ children }) => <>{children}</>,
  usePortalAuth: () => ({ isLoggedIn: true, isPortalLoading: false, openLoginModal: jest.fn() }),
}));

const unit = (code, name, category, semester) => ({
  category, year_level: 1, semester, unit: { unit_code: code, unit_name: name, requisite_groups: [] },
});

const UNITS = [
  unit('CORE1', 'Core Unit', 'core', 1),
  unit('MAJOR1', 'Major Core Unit', 'major_core', 2),
  unit('ELEC1', 'Plain Elective', 'elective', 1),
  unit('MPU1001', 'An MPU Unit', 'mpu', 1),
  unit('MPU2002', 'Another MPU Unit', 'mpu', 2),
];

// One MPU unit is being taken now, one is outside the planner.
const COURSES = [
  { courseId: 'MPU3333', courseTitle: 'Current MPU', status: 'Current', grade: '', term: '2026_MAR_S1', credits: 0 },
  { courseId: 'COS10000', courseTitle: 'Current Core', status: 'Current', grade: '', term: '2026_MAR_S1', credits: 12.5 },
];

function Seed() {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({ studentId: 'S1', student: { studentName: 'Test Student', courseList: COURSES, selectedEnrollment: 'BA-CS' } });
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      match: { status: 'matched', totalCredits: 100, unmatchedCore: [], rankedPlanners: [] },
      planners: [{ id: 'p1', intake_month: 3, major: { name: 'Software Development' }, course: { name: 'BA-CS' }, minors: [], units: UNITS }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const renderDashboard = () =>
  render(
    <ToastProvider>
      <StudentSessionProvider>
        <Seed />
        <DashboardPage />
      </StudentSessionProvider>
    </ToastProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ status: 'idle' }) }));
});

const notYetTaken = async () => (await screen.findByText('Not Yet Taken')).closest('[class*="insightCard"]') as HTMLElement;
const enrolled = async () => (await screen.findByText('Currently Enrolled')).closest('[class*="insightCard"]') as HTMLElement;

describe('the MPU switch on Major Detection', () => {
  test('MPU units are shown until the switch is turned off', async () => {
    renderDashboard();
    const card = within(await notYetTaken());
    expect(card.getByText('MPU 2')).toBeTruthy();
    expect(card.getByText('MPU1001', { selector: 'code' })).toBeTruthy();
    expect(within(await enrolled()).getByText('MPU3333', { selector: 'code' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /show mpu units/i }).getAttribute('aria-checked')).toBe('true');
  });

  test('turning it off hides MPU units and the MPU pill, and the remaining count drops', async () => {
    renderDashboard();
    await notYetTaken();
    expect(within(await notYetTaken()).getByText('5')).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: /show mpu units/i }));

    const card = within(await notYetTaken());
    expect(card.queryByText(/^MPU \d+$/)).toBeNull();
    expect(card.queryByText('MPU1001', { selector: 'code' })).toBeNull();
    expect(card.queryByText('MPU2002', { selector: 'code' })).toBeNull();
    expect(card.getByText('CORE1', { selector: 'code' })).toBeTruthy();
    expect(card.getByText('3')).toBeTruthy();
    expect(card.getByText(/MPU hidden/)).toBeTruthy();
    expect(within(await enrolled()).queryByText('MPU3333', { selector: 'code' })).toBeNull();
    expect(within(await enrolled()).getByText('COS10000', { selector: 'code' })).toBeTruthy();
    expect(screen.getByTestId('mpu-hidden-note').textContent).toMatch(/do not change/);
  });

  test('the Unit Plan tab leaves out MPU units outside the planner, and the semester headers that only held MPU units', async () => {
    renderDashboard();
    await notYetTaken();
    fireEvent.click(screen.getByRole('tab', { name: 'Unit Plan' }));
    expect(screen.getByText('MPU3333', { selector: 'code' })).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: /show mpu units/i }));
    expect(screen.queryByText('MPU3333', { selector: 'code' })).toBeNull();
    // Year 1 semester 1 still holds CORE1 and ELEC1, so only the MPU count disappears from it
    expect(screen.getByText('2 units')).toBeTruthy();
  });

  test('turning it back on shows them again', async () => {
    renderDashboard();
    await notYetTaken();
    const toggle = screen.getByRole('switch', { name: /show mpu units/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(within(await notYetTaken()).getByText('MPU 2')).toBeTruthy();
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  test('the choice is remembered in the browser and applies to the next student', async () => {
    const first = renderDashboard();
    await notYetTaken();
    fireEvent.click(screen.getByRole('switch', { name: /show mpu units/i }));
    expect(window.localStorage.getItem('showMpuUnits')).toBe('false');
    first.unmount();

    renderDashboard();
    await notYetTaken();
    expect(await screen.findByRole('switch', { name: /show mpu units/i })).toBeTruthy();
    expect(within(await notYetTaken()).queryByText(/^MPU \d+$/)).toBeNull();
    expect(screen.getByRole('switch', { name: /show mpu units/i }).getAttribute('aria-checked')).toBe('false');
  });

  test('a browser that blocks storage still shows the units and the switch still works', async () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      renderDashboard();
      expect(within(await notYetTaken()).getByText('MPU 2')).toBeTruthy();
      fireEvent.click(screen.getByRole('switch', { name: /show mpu units/i }));
      expect(within(await notYetTaken()).queryByText(/^MPU \d+$/)).toBeNull();
    } finally {
      spy.mockRestore();
      set.mockRestore();
    }
  });
});
