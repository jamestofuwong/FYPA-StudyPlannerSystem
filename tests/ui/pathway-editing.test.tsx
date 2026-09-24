/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import type { SchedulableUnit } from '@core/services/scheduling/customPlannerScheduler';

const planUnit = (
  code: string,
  name: string,
  category = 'core',
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

// INTRO gates ADV, and there are enough core units to reach five in one semester
const PLAN_UNITS: SchedulableUnit[] = [
  planUnit('INTRO', 'Intro to Programming'),
  planUnit('ADV', 'Advanced Programming', 'core', {
    requisiteGroups: [[{ type: 'unit', unitCode: 'INTRO', requisiteType: 'prerequisite' }]],
  }),
  planUnit('C1', 'Core One'),
  planUnit('C2', 'Core Two'),
  planUnit('C3', 'Core Three'),
  planUnit('C4', 'Core Four'),
  planUnit('E1', 'Elective One', 'elective'),
  planUnit('E2', 'Elective Two', 'elective'),
  planUnit('MPU3212', 'Bahasa Kebangsaan A', 'mpu', { offeringSemesters: [], allOfferingTerms: [3, 4] }),
];

const REQUIREMENTS = [
  { category: 'core', creditPoints: 62.5, unitCount: 5, planCategories: ['core'] },
  // C4 is deliberately left out of the generated plan, so it is available to add
  { category: 'elective', creditPoints: 25, unitCount: 2, planCategories: ['elective', 'prescribed_elective'] },
];

// MPU3212 is summer/winter only, so the scheduler reports it instead of placing it
const GENERATED_WARNINGS = [
  { kind: 'short_term_only' as const, unitCode: 'MPU3212', offeringTerms: [3, 4] },
];

const generatedPlan = () => ({
  semesters: [
    {
      year: 1,
      semester: 1 as const,
      units: [
        { code: 'INTRO', name: 'Intro to Programming', category: 'core' },
        { code: 'C1', name: 'Core One', category: 'core' },
        { code: 'C2', name: 'Core Two', category: 'core' },
        { code: 'C3', name: 'Core Three', category: 'core' },
      ],
    },
    {
      year: 1,
      semester: 2 as const,
      units: [
        { code: 'ADV', name: 'Advanced Programming', category: 'core' },
        { code: 'E1', name: 'Elective One', category: 'elective' },
        { code: 'E2', name: 'Elective Two', category: 'elective' },
      ],
    },
  ],
  unschedulableUnits: [{ code: 'MPU3212', name: 'Bahasa Kebangsaan A', category: 'mpu' }],
  warnings: GENERATED_WARNINGS,
});

function Seed({ completedCodes = [] as string[] }) {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { courseList: [], selectedEnrollment: 'BA-CS' } as never,
    });
    session.setDashboardData({
      completedCodes,
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

const Harness = ({
  showPage = true,
  completedCodes = [] as string[],
}: { showPage?: boolean; completedCodes?: string[] }) => (
  <ToastProvider>
    <StudentSessionProvider>
      <Seed completedCodes={completedCodes} />
      {showPage && <PathwayPage />}
    </StudentSessionProvider>
  </ToastProvider>
);

const fetchMock = () => global.fetch as unknown as jest.Mock;

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
          requirements: REQUIREMENTS,
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
  await screen.findByText('INTRO');
}

const pickers = () => screen.getAllByTitle(/Add a unit to this semester|already placed/i);

describe('pathway editing', () => {
  test('removing a unit offers it again in the add-unit picker', async () => {
    render(<Harness />);
    await generate();

    expect(within(pickers()[0]).queryByText(/^C1 ·/)).toBeNull();

    fireEvent.click(screen.getByLabelText('Remove C1'));

    expect(screen.queryByText('C1')).toBeNull();
    expect(within(pickers()[0]).getByText(/^C1 ·/)).toBeTruthy();
    expect(screen.getByText('edited')).toBeTruthy();
  });

  test('moving a unit before its prerequisite marks the row', async () => {
    render(<Harness />);
    await generate();

    const advRow = screen.getByText('ADV').closest('tr') as HTMLElement;
    fireEvent.change(within(advRow).getByTitle('Move to another semester'), { target: { value: '1-1' } });

    expect(await screen.findByText(/ADV needs INTRO, which is not in this plan/i)).toBeTruthy();
  });

  test('a fifth standard unit shows over capacity on the semester header', async () => {
    render(<Harness />);
    await generate();

    fireEvent.change(pickers()[0], { target: { value: 'C4' } });

    expect(await screen.findByText(/over the normal load of 4/i)).toBeTruthy();
  });

  test('removing a core unit reports it as compulsory missing', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));

    const missing = await screen.findByText(/required to graduate but .* not in this plan/i);
    expect(missing.textContent).toMatch(/C1/);
  });

  test('removing electives reports a credit point shortfall', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove E1'));

    const shortfall = await screen.findByText(/Electives total .* credit points, but 25 are required/i);
    expect(shortfall.textContent).toMatch(/12\.5/);
  });

  test('swapping one elective for another reports no shortfall', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove E1'));
    await screen.findByText(/Electives total/i);

    // Put it back in the other semester, so the category total is whole again
    fireEvent.change(pickers()[0], { target: { value: 'E1' } });

    await waitFor(() => expect(screen.queryByText(/Electives total/i)).toBeNull());
  });

  test("a summer/winter unit's warning survives an unrelated edit", async () => {
    render(<Harness />);
    await generate();

    expect(screen.getByText(/MPU3212 is only offered in summer\/winter/i)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Remove C1'));

    expect(screen.getByText(/MPU3212 is only offered in summer\/winter/i)).toBeTruthy();
  });

  test('placing the summer/winter unit replaces the carried warning', async () => {
    render(<Harness />);
    await generate();

    fireEvent.change(pickers()[0], { target: { value: 'MPU3212' } });

    await waitFor(() => {
      const row = screen.getByText('MPU3212').closest('tr');
      expect(within(row as HTMLElement).getByText(/only offered in summer\/winter/i)).toBeTruthy();
    });
  });

  test('regenerating after an edit asks for confirmation first', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    const callsBefore = fetchMock().mock.calls.length;

    await act(async () => { fireEvent.click(screen.getByText(/Regenerate Pathway/i)); });

    expect(confirmSpy).toHaveBeenCalledWith('This will replace your edits with a newly generated plan.');
    expect(fetchMock().mock.calls.length).toBe(callsBefore);
    expect(screen.queryByText('C1')).toBeNull();

    confirmSpy.mockReturnValue(true);
    await act(async () => { fireEvent.click(screen.getByText(/Regenerate Pathway/i)); });
    await waitFor(() => expect(screen.getByText('C1')).toBeTruthy());

    confirmSpy.mockRestore();
  });

  test('edits survive leaving the page and coming back', async () => {
    const { rerender } = render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    expect(screen.queryByText('C1')).toBeNull();

    rerender(<Harness showPage={false} />);
    expect(screen.queryByText('INTRO')).toBeNull();
    rerender(<Harness showPage />);

    await screen.findByText('INTRO');
    expect(screen.queryByText('C1')).toBeNull();
    expect(screen.getByText('edited')).toBeTruthy();
  });

  test('reset restores the generated plan', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    fireEvent.click(screen.getByText(/Reset to generated plan/i));

    await waitFor(() => expect(screen.getByText('C1')).toBeTruthy());
    expect(screen.queryByText('edited')).toBeNull();
  });
});

// The planner behind these asks for two electives but names only E1; the other is
// an empty slot the route fills from the planner's elective groups.
describe('recommended electives', () => {
  const RECOMMENDED = planUnit('REC1', 'Recommended Elective', 'elective', { recommended: true });

  function mockPlan(withRecommendation: boolean) {
    const pool = [...PLAN_UNITS.filter((u) => u.code !== 'E2'), ...(withRecommendation ? [RECOMMENDED] : [])];
    const plan = generatedPlan();
    plan.semesters[1].units = [
      { code: 'ADV', name: 'Advanced Programming', category: 'core' },
      { code: 'E1', name: 'Elective One', category: 'elective' },
      ...(withRecommendation
        ? [{ code: 'REC1', name: 'Recommended Elective', category: 'elective', recommended: true } as never]
        : []),
    ];

    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: plan,
            units: pool,
            intakeSemester: 1,
            requirements: REQUIREMENTS,
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  }

  test('a filled elective slot is tagged and leaves no elective shortfall', async () => {
    mockPlan(true);
    render(<Harness />);
    await generate();

    const row = screen.getByText('REC1').closest('tr') as HTMLElement;
    expect(within(row).getByText('RECOMMENDED')).toBeTruthy();
    // The named elective was never a recommendation
    expect(within(screen.getByText('E1').closest('tr') as HTMLElement).queryByText('RECOMMENDED')).toBeNull();

    expect(screen.queryByText(/Electives total/i)).toBeNull();
  });

  test('an unfilled elective slot reports the shortfall without any edit', async () => {
    mockPlan(false);
    render(<Harness />);
    await generate();

    const shortfall = await screen.findByText(/Electives total .* credit points, but 25 are required/i);
    expect(shortfall.textContent).toMatch(/12\.5/);
    expect(screen.queryByText('edited')).toBeNull();
  });
});

// GRP1 is a unit the planner offers only as an elective-group candidate, never
// as a named planner unit. Taking an elective that way is normal, so a student
// who passed it has met that part of the requirement.
describe('completed elective-group units', () => {
  function mockPlan(creditTheGroupUnit: boolean) {
    const plan = generatedPlan();
    plan.semesters[1].units = [
      { code: 'ADV', name: 'Advanced Programming', category: 'core' },
      { code: 'E1', name: 'Elective One', category: 'elective' },
    ];

    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: plan,
            units: PLAN_UNITS.filter((u) => u.code !== 'E2'),
            intakeSemester: 1,
            requirements: REQUIREMENTS,
            completedUnits: creditTheGroupUnit
              ? [planUnit('GRP1', 'Group Elective', 'elective')]
              : [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  }

  test('a completed elective-group unit is credited, so a met requirement shows no shortfall', async () => {
    mockPlan(true);
    render(<Harness completedCodes={['GRP1']} />);
    await generate();

    // One elective in the plan plus the one already passed is the two required
    expect(screen.queryByText(/Electives total/i)).toBeNull();
  });

  test('the same plan is short when the completed group unit is not reported', async () => {
    mockPlan(false);
    render(<Harness completedCodes={['GRP1']} />);
    await generate();

    const shortfall = await screen.findByText(/Electives total .* credit points, but 25 are required/i);
    expect(shortfall.textContent).toMatch(/12\.5/);
  });
});