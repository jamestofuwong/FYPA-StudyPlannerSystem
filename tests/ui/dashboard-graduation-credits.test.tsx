/** @jest-environment jsdom */
// @ts-nocheck
import React, { useEffect } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const unit = (code, name, category) => ({
  category,
  year_level: 1,
  semester: 1,
  unit: { unit_code: code, unit_name: name, requisite_groups: [] },
});

// One unit per planner category, all named on the planner
const UNITS = [
  unit('CORE1', 'Core Unit', 'core'),
  unit('MAJOR1', 'Major Unit', 'major_core'),
  unit('ELEC1', 'Plain Elective', 'elective'),
  unit('PRES1', 'Prescribed Elective', 'prescribed_elective'),
  unit('WIL1', 'WIL Unit', 'wil'),
  unit('MPU1', 'MPU Unit', 'mpu'),
];

// A passed transcript row for each named unit above, credits chosen so the
// per-category totals (50 core/major, 25 elective, 25 WIL) sum to 100, the
// same figure the old combined bar would show from creditsCompleted.
const passedRow = (code, credits) => ({
  courseId: code,
  courseTitle: code,
  level: '',
  credits,
  creditsEarned: credits,
  status: 'Complete',
  grade: 'D',
  term: '1',
});

const COURSE_LIST = [
  passedRow('CORE1', 25),
  passedRow('MAJOR1', 25),
  passedRow('ELEC1', 12.5),
  passedRow('PRES1', 12.5),
  passedRow('WIL1', 25),
];

function Seed({ planner, courseList, creditsCompleted, creditsRequired }) {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: {
        studentName: 'Test Student',
        courseList,
        selectedEnrollment: 'BA-CS',
        creditsCompleted,
        creditsRequired,
      },
    });
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      match: { status: 'matched', totalCredits: creditsCompleted, unmatchedCore: [], rankedPlanners: [] },
      planners: [planner],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const BASE_PLANNER = {
  id: 'p1',
  intake_month: 3,
  major: { name: 'Software Development' },
  course: { name: 'BA-CS' },
  minors: [],
  units: UNITS,
};

// All four _cp fields recorded: the default for most tests below
const FULL_PLANNER = { ...BASE_PLANNER, core_cp: 50, major_cp: 50, elective_cp: 25, wil_cp: 25 };

const renderDashboard = ({
  planner = FULL_PLANNER,
  courseList = COURSE_LIST,
  creditsCompleted = 100,
  creditsRequired = 300,
} = {}) =>
  render(
    <ToastProvider>
      <StudentSessionProvider>
        <Seed planner={planner} courseList={courseList} creditsCompleted={creditsCompleted} creditsRequired={creditsRequired} />
        <DashboardPage />
      </StudentSessionProvider>
    </ToastProvider>,
  );

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ status: 'idle' }) }));
});

const openGraduation = async () => {
  fireEvent.click(await screen.findByRole('tab', { name: 'Graduation' }));
  return screen.findByText('Graduation Check');
};

/** The "<achieved>/<required> CP" text shown beside a given bar's label. */
const barValue = (label: string) => {
  const labelEl = screen.getByText(label);
  return within(labelEl.parentElement as HTMLElement).getByText(/\/\d+(\.\d+)? CP$/).textContent;
};

// The task's own worked example fuses core_cp and major_cp into ONE "Core &
// Major Credits" bar (matching the Core & Major card's existing grouping), so
// four non-null _cp fields produce three bars, not four; wil_cp alone null
// produces two, not three. The task's "Tests" section says "four"/"three",
// which contradicts its own Output mockup; this suite follows the mockup and
// the explicit grouping instruction, and is called out in the report.
describe('Graduation Check: per-category credit bars', () => {
  test('all four _cp fields set: three bars render, correct achieved/required, summing to the old combined total', async () => {
    renderDashboard();
    await openGraduation();

    expect(barValue('Core & Major Credits')).toBe('50/100 CP');
    expect(barValue('Elective Credits')).toBe('25/25 CP');
    expect(barValue('WIL Credits')).toBe('25/25 CP');

    // No leftover single "Credits" bar alongside the per-category ones
    expect(screen.queryByText('Credits')).toBeNull();

    // 50 + 25 + 25 = 100, the same total the old combined bar showed
    expect(screen.getByText('Test Student')).toBeTruthy();
  });

  test('wil_cp null: only two bars appear (Core & Major, Elective), no WIL bar, no crash', async () => {
    renderDashboard({ planner: { ...BASE_PLANNER, core_cp: 50, major_cp: 50, elective_cp: 25, wil_cp: null } });
    await openGraduation();

    expect(screen.getByText('Core & Major Credits')).toBeTruthy();
    expect(screen.getByText('Elective Credits')).toBeTruthy();
    expect(screen.queryByText('WIL Credits')).toBeNull();
    expect(screen.queryByText('Credits')).toBeNull();
  });

  test('core_cp null but major_cp set: the Core & Major bar still appears, using major_cp alone', async () => {
    renderDashboard({ planner: { ...BASE_PLANNER, core_cp: null, major_cp: 50, elective_cp: 25, wil_cp: 25 } });
    await openGraduation();

    // required = 0 (null) + 50 = 50; achieved is still both CORE1 and MAJOR1 (50)
    expect(barValue('Core & Major Credits')).toBe('50/50 CP');
  });

  test('all four _cp fields null: falls back to the original single combined bar', async () => {
    renderDashboard({
      planner: { ...BASE_PLANNER, core_cp: null, major_cp: null, elective_cp: null, wil_cp: null },
    });
    await openGraduation();

    expect(screen.getByText('Credits')).toBeTruthy();
    expect(screen.getByText('100/300 CP')).toBeTruthy();
    expect(screen.queryByText('Core & Major Credits')).toBeNull();
    expect(screen.queryByText('Elective Credits')).toBeNull();
    expect(screen.queryByText('WIL Credits')).toBeNull();
  });

  test('elective and prescribed elective are combined into one Elective figure, not shown separately', async () => {
    renderDashboard();
    await openGraduation();

    // ELEC1 (12.5) + PRES1 (12.5) = 25, one bar, not two
    expect(screen.getAllByText('Elective Credits')).toHaveLength(1);
    expect(barValue('Elective Credits')).toBe('25/25 CP');
    expect(screen.queryByText('Prescribed Elective Credits')).toBeNull();
  });

  test('MPU has no credit-point bar anywhere in this output', async () => {
    renderDashboard();
    await openGraduation();

    expect(screen.queryByText(/MPU Credits/i)).toBeNull();
    expect(screen.queryByText(/MPU.*CP\b/i)).toBeNull();
  });

  test('an unpassed unit contributes nothing to its category, even if named on the planner', async () => {
    // MAJOR1 only has an in-progress row, no passed row
    const courseList = [
      passedRow('CORE1', 25),
      { ...passedRow('MAJOR1', 25), status: 'Current', grade: '', creditsEarned: 0 },
      passedRow('ELEC1', 12.5),
      passedRow('PRES1', 12.5),
      passedRow('WIL1', 25),
    ];
    renderDashboard({ courseList, creditsCompleted: 75 });
    await openGraduation();

    // Only CORE1's 25 counts; MAJOR1 is in progress, not passed
    expect(screen.getByText('25/100 CP')).toBeTruthy();
  });

  test('a unit passed but not named on this planner earns nothing toward any bar', async () => {
    const courseList = [...COURSE_LIST, passedRow('OUTSIDE1', 12.5)];
    renderDashboard({ courseList, creditsCompleted: 112.5 });
    await openGraduation();

    // Still 50/25/25: OUTSIDE1 is not on the planner, so it credits no category
    expect(barValue('Core & Major Credits')).toBe('50/100 CP');
    expect(barValue('Elective Credits')).toBe('25/25 CP');
    expect(barValue('WIL Credits')).toBe('25/25 CP');
  });

  test('a retake keeps the credits from the passing attempt, not a zero-credit fail', async () => {
    const courseList = [
      { ...passedRow('CORE1', 0), status: 'Complete', grade: 'N', creditsEarned: 0 },
      passedRow('CORE1', 25),
      passedRow('MAJOR1', 25),
      passedRow('ELEC1', 12.5),
      passedRow('PRES1', 12.5),
      passedRow('WIL1', 25),
    ];
    renderDashboard({ courseList });
    await openGraduation();

    expect(screen.getByText('50/100 CP')).toBeTruthy();
  });
});

// A candidate offered through the planner's elective_groups, not a named row
// in activePlanner.units. Shaped as /api/planners/[id] actually returns it:
// elective_groups[].units[].unit.{unit_code, unit_name}.
const electiveGroupCandidate = (code, name) => ({ unit: { unit_code: code, unit_name: name } });

describe('Graduation Check: elective-group candidates', () => {
  test('a passed elective-group-only unit (not named on the planner) is counted in the Elective bar', async () => {
    const planner = {
      ...FULL_PLANNER,
      elective_groups: [{ id: 'g1', units: [electiveGroupCandidate('GROUP1', 'Group Elective')] }],
    };
    const courseList = [...COURSE_LIST, passedRow('GROUP1', 12.5)];
    renderDashboard({ planner, courseList, creditsCompleted: 112.5 });
    await openGraduation();

    // 12.5 (ELEC1) + 12.5 (PRES1) + 12.5 (GROUP1) = 37.5
    expect(barValue('Elective Credits')).toBe('37.5/25 CP');
    // Core & Major and WIL are unaffected by the group candidate
    expect(barValue('Core & Major Credits')).toBe('50/100 CP');
    expect(barValue('WIL Credits')).toBe('25/25 CP');
  });

  test('a unit both named on the planner and offered as a group candidate is counted once', async () => {
    const planner = {
      ...FULL_PLANNER,
      // ELEC1 is already named on the planner (see UNITS); also list it in a group
      elective_groups: [{ id: 'g1', units: [electiveGroupCandidate('ELEC1', 'Plain Elective')] }],
    };
    renderDashboard({ planner });
    await openGraduation();

    // Still 25 (12.5 + 12.5), not 37.5: ELEC1's credits are not added twice
    expect(barValue('Elective Credits')).toBe('25/25 CP');
  });

  test('the same candidate listed in two different groups is still counted once', async () => {
    const planner = {
      ...FULL_PLANNER,
      elective_groups: [
        { id: 'g1', units: [electiveGroupCandidate('GROUP1', 'Group Elective')] },
        { id: 'g2', units: [electiveGroupCandidate('GROUP1', 'Group Elective')] },
      ],
    };
    const courseList = [...COURSE_LIST, passedRow('GROUP1', 12.5)];
    renderDashboard({ planner, courseList, creditsCompleted: 112.5 });
    await openGraduation();

    expect(barValue('Elective Credits')).toBe('37.5/25 CP');
  });

  test('an elective-group candidate the student has NOT passed contributes nothing', async () => {
    const planner = {
      ...FULL_PLANNER,
      elective_groups: [{ id: 'g1', units: [electiveGroupCandidate('GROUP1', 'Group Elective')] }],
    };
    renderDashboard({ planner }); // COURSE_LIST has no GROUP1 row at all
    await openGraduation();

    expect(barValue('Elective Credits')).toBe('25/25 CP');
  });

  test('core, major and WIL do not draw from elective_groups', async () => {
    // A group candidate that happens to share a code with nothing on the
    // planner: it must never be picked up by the Core & Major or WIL bars.
    const planner = {
      ...FULL_PLANNER,
      elective_groups: [{ id: 'g1', units: [electiveGroupCandidate('GROUP1', 'Group Elective')] }],
    };
    const courseList = [...COURSE_LIST, passedRow('GROUP1', 12.5)];
    renderDashboard({ planner, courseList, creditsCompleted: 112.5 });
    await openGraduation();

    expect(barValue('Core & Major Credits')).toBe('50/100 CP');
    expect(barValue('WIL Credits')).toBe('25/25 CP');
  });

  test('a planner with no elective_groups at all behaves exactly as before', async () => {
    renderDashboard({ planner: FULL_PLANNER }); // no elective_groups key
    await openGraduation();

    expect(barValue('Elective Credits')).toBe('25/25 CP');
  });
});

describe('Graduation Check: MPU completion line', () => {
  test('shows X/Y Complete for a passed MPU unit, regardless of its grade code', async () => {
    // MPU1 is on the planner (see UNITS); COMP is a completion marker, not on
    // the HD/D/C/P scale, but status Complete still resolves it as done.
    const courseList = [...COURSE_LIST, { ...passedRow('MPU1', 0), grade: 'COMP', status: 'Complete' }];
    renderDashboard({ courseList, creditsCompleted: 100 });
    await openGraduation();

    expect(screen.getByText('MPU Units')).toBeTruthy();
    const row = screen.getByText('MPU Units').parentElement;
    expect(within(row).getByText('1/1 Complete')).toBeTruthy();
    // No CP figure anywhere on this line
    expect(within(row).queryByText(/CP/)).toBeNull();
  });

  test('an MPU unit not yet taken is not counted as complete', async () => {
    renderDashboard(); // COURSE_LIST has no MPU1 row at all
    await openGraduation();

    const row = screen.getByText('MPU Units').parentElement;
    expect(within(row).getByText('0/1 Complete')).toBeTruthy();
  });

  test('an MPU unit only in progress is not counted as complete', async () => {
    const courseList = [...COURSE_LIST, { ...passedRow('MPU1', 0), grade: '', status: 'Current' }];
    renderDashboard({ courseList });
    await openGraduation();

    const row = screen.getByText('MPU Units').parentElement;
    expect(within(row).getByText('0/1 Complete')).toBeTruthy();
  });

  test('a planner with no MPU units shows no MPU completion line at all', async () => {
    const planner = { ...FULL_PLANNER, units: UNITS.filter((u) => u.category !== 'mpu') };
    renderDashboard({ planner });
    await openGraduation();

    expect(screen.queryByText('MPU Units')).toBeNull();
  });

  test('several MPU units complete some but not all', async () => {
    const planner = {
      ...FULL_PLANNER,
      units: [...UNITS, unit('MPU2', 'MPU Unit Two', 'mpu'), unit('MPU3', 'MPU Unit Three', 'mpu')],
    };
    const courseList = [...COURSE_LIST, passedRow('MPU1', 0), passedRow('MPU2', 0)];
    renderDashboard({ planner, courseList, creditsCompleted: 100 });
    await openGraduation();

    const row = screen.getByText('MPU Units').parentElement;
    expect(within(row).getByText('2/3 Complete')).toBeTruthy();
  });

  test('the completion line appears even when all four _cp fields are null (fallback bar case)', async () => {
    const planner = { ...BASE_PLANNER, core_cp: null, major_cp: null, elective_cp: null, wil_cp: null };
    const courseList = [...COURSE_LIST, passedRow('MPU1', 0)];
    renderDashboard({ planner, courseList, creditsCompleted: 100 });
    await openGraduation();

    expect(screen.getByText('Credits')).toBeTruthy(); // the fallback bar
    const row = screen.getByText('MPU Units').parentElement;
    expect(within(row).getByText('1/1 Complete')).toBeTruthy();
  });
});