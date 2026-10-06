/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import type { SchedulableUnit } from '@core/services/scheduling/customPlannerScheduler';

// The category-to-colour mapping this file locks in matches the canonical one
// in web/components/planner/CourseListTable.tsx (the Study Planners page),
// which the client named as the correct reference.
const CANONICAL: Record<string, string> = {
  core: 'badgeBlue',
  major_core: 'badgeYellow',
  double_major: 'badgeGreen', // falls through to CourseListTable's default badgeGreen
  minor: 'badgeGreen', // falls through to CourseListTable's default badgeGreen
  prescribed_elective: 'badgeGreen',
  elective: 'badgeGreen',
  wil: 'badgePurple', // falls through to pathway's default; matches canonical already
};

const planUnit = (
  code: string,
  name: string,
  category: string,
  overrides: Partial<SchedulableUnit> = {},
): SchedulableUnit => ({
  code,
  name,
  category,
  offeringSemesters: [1, 2],
  allOfferingTerms: [1, 2],
  requisiteGroups: [],
  ...overrides,
});

const PLAN_UNITS: SchedulableUnit[] = [
  planUnit('CORE1', 'Core Unit', 'core'),
  planUnit('MAJOR1', 'Major Unit', 'major_core'),
  planUnit('DM1', 'Double Major Unit', 'double_major'),
  planUnit('MIN1', 'Minor Unit', 'minor'),
  planUnit('PE1', 'Prescribed Elective Unit', 'prescribed_elective'),
  planUnit('EL1', 'Plain Elective Unit', 'elective'),
  planUnit('WIL1', 'WIL Unit', 'wil'),
];

const row = (u: SchedulableUnit) => ({ code: u.code, name: u.name, category: u.category });

const generatedPlan = () => ({
  semesters: [{ year: 1, semester: 1 as const, units: PLAN_UNITS.map(row) }],
  unschedulableUnits: [],
  warnings: [],
});

function Seed() {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { courseList: [], selectedEnrollment: 'BA-CS' } as never,
    });
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      planners: [{
        id: 'p1',
        intake_month: 3,
        major: { name: 'Software Development' },
        course: { name: 'BA-CS' },
        minors: [],
        units: PLAN_UNITS.map((u) => ({
          category: u.category,
          year_level: 1,
          semester: 1,
          unit: { unit_code: u.code, unit_name: u.name, requisite_groups: [] },
        })),
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const Harness = () => (
  <ToastProvider>
    <StudentSessionProvider>
      <Seed />
      <PathwayPage />
    </StudentSessionProvider>
  </ToastProvider>
);

beforeEach(() => {
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: generatedPlan(),
          units: PLAN_UNITS,
          intakeSemester: 1,
          requirements: [],
          completedUnits: [],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

async function generate() {
  const button = await screen.findByText(/Generate Custom Pathway/i);
  await act(async () => { fireEvent.click(button); });
  await screen.findByText('CORE1');
}

/** The colour class (or, for badgePurple, the inline colour) a unit's row badge carries. */
function badgeColourOf(code: string): string {
  const row = screen.getByText(code, { selector: 'code' }).closest('tr') as HTMLElement;
  const badge = row.querySelector('[class*="badge"]') as HTMLElement;
  if (badge.className.includes('badgePurple')) return 'badgePurple';
  for (const cls of ['badgeBlue', 'badgeOrange', 'badgeYellow', 'badgeRed', 'badgeGreen']) {
    if (badge.className.includes(cls)) return cls;
  }
  // badgePurple carries no class name at all, only an inline colour (see Badge in Primitives.tsx)
  if (badge.style.color === 'var(--accent-purple)') return 'badgePurple';
  return `unrecognised: className="${badge.className}" style.color="${badge.style.color}"`;
}

describe('pathway page category badges match the CourseListTable.tsx canonical mapping', () => {
  test.each(Object.entries(CANONICAL))('%s renders as %s', async (code, expected) => {
    render(<Harness />);
    await generate();

    const planUnitCode = PLAN_UNITS.find((u) => u.category === code)!.code;
    expect(badgeColourOf(planUnitCode)).toBe(expected);
  });

  test('core and mpu are no longer swapped: core is blue, not red', async () => {
    render(<Harness />);
    await generate();

    expect(badgeColourOf('CORE1')).toBe('badgeBlue');
    expect(badgeColourOf('CORE1')).not.toBe('badgeRed');
  });

  // MPU units are filtered out of the main semester table before reaching this
  // badge switch at all (see "Remaining MPU Units" instead), so there is no row
  // to assert on here. The mpu branch in the switch was still corrected to match
  // canonical (badgeRed) for when/if that filtering ever changes; see the report
  // for the one MPU badge that IS currently visible on this page and was left
  // untouched as out of the stated scope.
  test('an MPU-category unit never reaches the main semester table', async () => {
    render(<Harness />);
    await generate();

    expect(screen.queryByText('MPU1', { selector: 'code' })).toBeNull();
  });

  test('isExtraUnit and the ELECTIVE placeholder keep their own colours, untouched by this fix', async () => {
    const planWithExtras = () => ({
      semesters: [{
        year: 1,
        semester: 1 as const,
        units: [
          { code: 'OUT1', name: 'Outside Unit', category: 'elective', outsidePlanner: true },
          { code: 'ELECTIVE', name: 'Elective Slot (To be selected)', category: 'elective' },
        ],
      }],
      unschedulableUnits: [],
      warnings: [],
    });
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: planWithExtras(),
            units: [planUnit('OUT1', 'Outside Unit', 'elective', { outsidePlanner: true })],
            intakeSemester: 1,
            requirements: [],
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    render(<Harness />);
    await act(async () => { fireEvent.click(await screen.findByText(/Generate Custom Pathway/i)); });
    await screen.findByText('OUT1');

    // ELECTIVE's row badge stays badgePurple regardless of category; would be
    // badgeGreen if the elective branch were checked before the code==='ELECTIVE'
    // branch, which would be a regression of this fix, not a feature of it
    const electiveRow = screen.getByText('ELECTIVE', { selector: 'code' }).closest('tr') as HTMLElement;
    const electiveBadge = electiveRow.querySelector('[class*="badge"]') as HTMLElement;
    expect(electiveBadge.className.includes('badgeGreen')).toBe(false);
  });

  // This is a separate, static badge in the "Remaining MPU Units" table, not
  // the per-row switch above (MPU rows never reach that switch, see the test
  // above), so this is the only MPU badge actually visible on the page.
  test('the Remaining MPU Units table badge renders badgeRed, matching canonical', async () => {
    const CORE_UNIT = planUnit('CORE1', 'Core Unit', 'core');
    const planWithMpu = () => ({
      semesters: [{ year: 1, semester: 1 as const, units: [CORE_UNIT] }],
      unschedulableUnits: [],
      warnings: [],
    });
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: planWithMpu(),
            units: [CORE_UNIT],
            intakeSemester: 1,
            requirements: [],
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    function SeedWithMpu() {
      const session = useStudentSession();
      useEffect(() => {
        session.setStudentLoaded(true);
        session.setScrapedStudent({
          studentId: 'S1',
          student: { courseList: [], selectedEnrollment: 'BA-CS' } as never,
        });
        session.setDashboardData({
          completedCodes: [],
          mpuCourseList: [],
          planners: [{
            id: 'p1',
            intake_month: 3,
            major: { name: 'Software Development' },
            course: { name: 'BA-CS' },
            minors: [],
            units: [
              { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
              { category: 'mpu', year_level: 1, semester: 1, unit: { unit_code: 'MPU101', unit_name: 'General Studies' } },
            ],
          }],
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <SeedWithMpu />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await act(async () => { fireEvent.click(await screen.findByText(/Generate Custom Pathway/i)); });
    await screen.findByText('CORE1');

    const mpuRow = screen.getByText('MPU101', { selector: 'code' }).closest('tr') as HTMLElement;
    const mpuBadge = mpuRow.querySelector('[class*="badge"]') as HTMLElement;
    expect(mpuBadge.className.includes('badgeRed')).toBe(true);
    expect(mpuBadge.className.includes('badgeBlue')).toBe(false);
  });
});
