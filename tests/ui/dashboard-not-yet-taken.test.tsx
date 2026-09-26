/** @jest-environment jsdom */
// @ts-nocheck
import React, { useEffect } from 'react';
import { render, screen, within } from '@testing-library/react';
import DashboardPage from '@/app/(pages)/dashboard/page';
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

const unit = (code, name, category, semester) => ({
  category,
  year_level: 1,
  semester,
  unit: { unit_code: code, unit_name: name, requisite_groups: [] },
});

// One unit in each of the six planner categories, in slots that tell the terms apart
const SIX = [
  unit('CORE1', 'Core Unit', 'core', 1),
  unit('MAJOR1', 'Major Core Unit', 'major_core', 2),
  unit('ELEC1', 'Plain Elective', 'elective', 1),
  unit('PRES1', 'Prescribed Elective', 'prescribed_elective', 2),
  unit('MPU1001', 'An MPU Unit', 'mpu', 1),
  unit('WIL1001', 'Work Placement', 'wil', 1),
];

function Seed({ intakeMonth, units, courseList }) {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { studentName: 'Test Student', courseList, selectedEnrollment: 'BA-CS' },
    });
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      match: { status: 'matched', totalCredits: 100, unmatchedCore: [], rankedPlanners: [] },
      planners: [{
        id: 'p1',
        intake_month: intakeMonth,
        major: { name: 'Software Development' },
        course: { name: 'BA-CS' },
        minors: [],
        units,
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const renderDashboard = ({ intakeMonth = 3, units = SIX, courseList = [] } = {}) =>
  render(
    <ToastProvider>
      <StudentSessionProvider>
        <Seed intakeMonth={intakeMonth} units={units} courseList={courseList} />
        <DashboardPage />
      </StudentSessionProvider>
    </ToastProvider>,
  );

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ status: 'idle' }) }));
});

/** The Not Yet Taken card, found from its label. */
const card = async () =>
  (await screen.findByText('Not Yet Taken')).closest('[class*="insightCard"]') as HTMLElement;

/** The term shown beside a unit in the list. */
const termOf = async (code: string) => {
  const row = within(await card()).getByText(code, { selector: 'code' }).closest('[class*="insightRow"]') as HTMLElement;
  return row.querySelector('[class*="insightRowMeta"]')?.textContent;
};

describe('Not Yet Taken counts every category', () => {
  test('core includes major core, elective includes prescribed elective, and MPU and WIL count alone', async () => {
    renderDashboard();
    const c = within(await card());

    expect(c.getByText('Core 2')).toBeTruthy();
    expect(c.getByText('Elective 2')).toBeTruthy();
    expect(c.getByText('MPU 1')).toBeTruthy();
    expect(c.getByText('WIL 1')).toBeTruthy();
    expect(c.getByText('6')).toBeTruthy();
  });

  test('MPU and WIL are no longer folded into Elective', async () => {
    // Before: everything that was not core counted as an elective, so six units
    // with one core read Elective 5
    renderDashboard();

    expect(within(await card()).queryByText('Elective 5')).toBeNull();
  });

  test('the four pills add up to the units remaining', async () => {
    renderDashboard();
    const pills = within(await card()).getAllByText(/^(Core|Elective|MPU|WIL) \d+$/);

    const total = pills.reduce((sum, el) => sum + Number(el.textContent!.split(' ')[1]), 0);
    expect(pills).toHaveLength(4);
    expect(total).toBe(6);
  });

  test('a unit the student has passed is not counted in any pill', async () => {
    renderDashboard({ courseList: [{ courseId: 'WIL1001', grade: 'HD', status: 'Complete' }, { courseId: 'CORE1', grade: 'D', status: 'Complete' }] });
    const c = within(await card());

    expect(c.getByText('Core 1')).toBeTruthy();
    expect(c.getByText('WIL 0')).toBeTruthy();
    expect(c.queryByText('WIL1001', { selector: 'code' })).toBeNull();
    expect(c.getByText('4')).toBeTruthy();
  });

  test('a card with only core units shows zero for the others', async () => {
    renderDashboard({ units: [SIX[0], SIX[1]] });
    const c = within(await card());

    expect(c.getByText('Core 2')).toBeTruthy();
    expect(c.getByText('Elective 0')).toBeTruthy();
    expect(c.getByText('MPU 0')).toBeTruthy();
    expect(c.getByText('WIL 0')).toBeTruthy();
  });
});

describe('Not Yet Taken names the calendar term, not the planner slot', () => {
  test('a September intake shows slot 1 as Aug/Sep and slot 2 as Feb/Mar', async () => {
    renderDashboard({ intakeMonth: 9 });

    expect(await termOf('CORE1')).toBe('Aug/Sep');
    expect(await termOf('MAJOR1')).toBe('Feb/Mar');
  });

  test('a September intake never shows "Sem 1"', async () => {
    renderDashboard({ intakeMonth: 9 });

    expect(within(await card()).queryByText(/^Sem \d/)).toBeNull();
  });

  test('a February intake shows slot 1 as Feb/Mar and slot 2 as Aug/Sep', async () => {
    renderDashboard({ intakeMonth: 3 });

    expect(await termOf('CORE1')).toBe('Feb/Mar');
    expect(await termOf('MAJOR1')).toBe('Aug/Sep');
  });

  test('the boundary months follow the shared rule: July counts as the second intake', async () => {
    renderDashboard({ intakeMonth: 7 });
    expect(await termOf('CORE1')).toBe('Aug/Sep');
  });

  test('a planner that never recorded an intake month is read as Feb/Mar, as everywhere else', async () => {
    renderDashboard({ intakeMonth: null });
    expect(await termOf('CORE1')).toBe('Feb/Mar');
  });

  // Slots 3 and 4 are summer and winter already; treating them as semester slots
  // would turn summer into Semester 1 for a September intake
  test.each([[3, 'summer'], [4, 'winter']])('slot %i reads %s, whichever the intake', async (slot, label) => {
    const units = [unit('WIL1001', 'Work Placement', 'wil', slot)];

    renderDashboard({ intakeMonth: 9, units });
    expect(await termOf('WIL1001')).toBe(label);
  });

  test('the same slot-3 unit reads summer for a February intake too', async () => {
    renderDashboard({ intakeMonth: 3, units: [unit('WIL1001', 'Work Placement', 'wil', 3)] });
    expect(await termOf('WIL1001')).toBe('summer');
  });
});
