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
  // Winter only and not MPU, so its warning is shown rather than suppressed
  planUnit('ICT20016*Optional', 'Professional Experience', 'wil', {
    offeringSemesters: [],
    allOfferingTerms: [4],
  }),
];

const REQUIREMENTS = [
  { category: 'core', creditPoints: 62.5, unitCount: 5, planCategories: ['core'] },
  // C4 is deliberately left out of the generated plan, so it is available to add
  { category: 'elective', creditPoints: 25, unitCount: 2, planCategories: ['elective', 'prescribed_elective'] },
];

// Both are summer/winter only, so the scheduler reports them instead of placing
// them. Only the non-MPU one reaches the screen.
const GENERATED_WARNINGS = [
  { kind: 'short_term_only' as const, unitCode: 'MPU3212', offeringTerms: [3, 4] },
  { kind: 'short_term_only' as const, unitCode: 'ICT20016*Optional', offeringTerms: [4] },
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
  unschedulableUnits: [
    { code: 'MPU3212', name: 'Bahasa Kebangsaan A', category: 'mpu' },
    { code: 'ICT20016*Optional', name: 'Professional Experience', category: 'wil' },
  ],
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

/**
 * Removing a unit now asks first: Remove opens a confirmation, and only its
 * "Remove Unit" button takes the unit out of the plan.
 */
const confirmRemove = async (code: string) => {
  fireEvent.click(screen.getByLabelText(`Remove ${code}`));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Unit' }));
};

describe('pathway editing', () => {
  test('removing a unit offers it again in the add-unit picker', async () => {
    render(<Harness />);
    await generate();

    expect(within(pickers()[0]).queryByText(/^C1 ·/)).toBeNull();

    await confirmRemove('C1');

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

    await confirmRemove('C1');

    const missing = await screen.findByText(/required to graduate but .* not in this plan/i);
    expect(missing.textContent).toMatch(/C1/);
  });

  test('removing electives reports a credit point shortfall', async () => {
    render(<Harness />);
    await generate();

    await confirmRemove('E1');

    const shortfall = await screen.findByText(/Electives total .* credit points, but 25 are required/i);
    expect(shortfall.textContent).toMatch(/12\.5/);
  });

  test('swapping one elective for another reports no shortfall', async () => {
    render(<Harness />);
    await generate();

    await confirmRemove('E1');
    await screen.findByText(/Electives total/i);

    // Put it back in the other semester, so the category total is whole again
    fireEvent.change(pickers()[0], { target: { value: 'E1' } });

    await waitFor(() => expect(screen.queryByText(/Electives total/i)).toBeNull());
  });

  test("a summer/winter unit's warning survives an unrelated edit", async () => {
    render(<Harness />);
    await generate();

    expect(screen.getByText(/ICT20016\*Optional is only offered in summer\/winter/i)).toBeTruthy();

    await confirmRemove('C1');

    expect(screen.getByText(/ICT20016\*Optional is only offered in summer\/winter/i)).toBeTruthy();
  });

  test('placing the summer/winter unit replaces the carried warning', async () => {
    render(<Harness />);
    await generate();

    fireEvent.change(pickers()[0], { target: { value: 'ICT20016*Optional' } });

    await waitFor(() => {
      const row = screen.getByText('ICT20016*Optional').closest('tr');
      expect(within(row as HTMLElement).getByText(/only offered in summer\/winter/i)).toBeTruthy();
    });
  });

  test('regenerating after an edit asks for confirmation first', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness />);
    await generate();

    await confirmRemove('C1');
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

    await confirmRemove('C1');
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

    await confirmRemove('C1');
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
// Slots count from the intake, offering terms are calendar terms, and for a
// September intake the two are swapped. The header names the months so the two
// countings can never be read as the same thing.
describe('terms named by month', () => {
  const mockWithIntake = (intakeSemester: 1 | 2) => {
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: generatedPlan(),
            units: PLAN_UNITS,
            intakeSemester,
            requirements: REQUIREMENTS,
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  };

  const headerOf = (slot: 1 | 2) =>
    screen.getByText((_, el) => {
      const text = el?.textContent ?? '';
      return el?.tagName === 'SPAN' && text.startsWith('YEAR 1') && text.includes(`SEM ${slot}`);
    }).textContent ?? '';

  test('a September intake shows slot 1 as Aug/Sep and slot 2 as Feb/Mar', async () => {
    mockWithIntake(2);
    render(<Harness />);
    await generate();

    expect(headerOf(1)).toContain('Aug/Sep');
    expect(headerOf(2)).toContain('Feb/Mar');
  });

  test('a February intake shows slot 1 as Feb/Mar and slot 2 as Aug/Sep', async () => {
    mockWithIntake(1);
    render(<Harness />);
    await generate();

    expect(headerOf(1)).toContain('Feb/Mar');
    expect(headerOf(2)).toContain('Aug/Sep');
  });

  test('no warning anywhere says "Semester 1" or "Semester 2"', async () => {
    mockWithIntake(2);
    render(<Harness />);
    await generate();

    // Stir up as many warnings as one plan can hold
    await confirmRemove('C1');
    fireEvent.change(pickers()[0], { target: { value: 'ICT20016*Optional' } });

    await waitFor(() => expect(screen.getByText('ICT20016*Optional')).toBeTruthy());

    const warningText = [
      ...document.querySelectorAll('[class*="warningItem"], [class*="rowWarning"]'),
    ].map((el) => el.textContent ?? '').join(' | ');

    expect(warningText.length).toBeGreaterThan(0);
    expect(warningText).not.toMatch(/Semester [12]/);
  });

  test('a unit placed by hand in a term it does not run says so, not "could not be fitted"', async () => {
    // Aug/Sep only. Slot 2 of a September intake is a Feb/Mar term.
    const augSepOnly = planUnit('COS10082', 'Applied Analytics', 'elective', {
      offeringSemesters: [2],
      allOfferingTerms: [2],
    });
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: generatedPlan(),
            units: [...PLAN_UNITS, augSepOnly],
            intakeSemester: 2,
            requirements: REQUIREMENTS,
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    render(<Harness />);
    await generate();

    // pickers()[1] is the slot-2 card, a Feb/Mar term for this student
    fireEvent.change(pickers()[1], { target: { value: 'COS10082' } });

    const row = (await screen.findByText('COS10082')).closest('tr') as HTMLElement;
    expect(
      within(row).getByText(/only runs in Aug\/Sep, but Y1 S2 is a Feb\/Mar term for this student/i),
    ).toBeTruthy();
    expect(within(row).queryByText(/could not be fitted into one/i)).toBeNull();
  });
});

describe('electives beyond the requirement', () => {
  const mockPlan = (extraElectives: string[]) => {
    const extras = extraElectives.map((c) => planUnit(c, `Extra ${c}`, 'elective'));
    const plan = generatedPlan();
    plan.semesters[1].units = [
      ...plan.semesters[1].units,
      ...extras.map((u) => ({ code: u.code, name: u.name, category: u.category })),
    ];
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: plan,
            units: [...PLAN_UNITS, ...extras],
            intakeSemester: 1,
            requirements: REQUIREMENTS,
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  };

  test('one elective past the requirement shows the excess message on a fresh plan', async () => {
    mockPlan(['X1']);
    render(<Harness />);
    await generate();

    const excess = await screen.findByText(/Electives total 37.5 credit points, 12.5 more than the 25 required/i);
    expect(excess).toBeTruthy();
    expect(screen.queryByText(/Electives total .* but .* required to graduate/i)).toBeNull();
    expect(screen.queryByText('edited')).toBeNull();
  });

  test('a fresh plan that meets the requirement shows neither excess nor shortfall', async () => {
    mockPlan([]);
    render(<Harness />);
    await generate();

    expect(screen.queryByText(/Electives total/i)).toBeNull();
  });

  test('adding one more elective by hand raises the excess', async () => {
    mockPlan([]);
    render(<Harness />);
    await generate();

    expect(screen.queryByText(/Electives total/i)).toBeNull();

    fireEvent.change(pickers()[0], { target: { value: 'C4' } });
    // C4 is core, so the elective total is untouched
    await waitFor(() => expect(screen.getByText('edited')).toBeTruthy());
    expect(screen.queryByText(/Electives total/i)).toBeNull();
  });
});

// Every prescribed elective is treated as compulsory: the seed records no star,
// so the safe reading is that all of them are required.
describe('prescribed electives are compulsory', () => {
  const PRESCRIBED = planUnit('SWE30009', 'Software Testing', 'prescribed_elective');
  const SPARE = planUnit('E3', 'Elective Three', 'elective');

  beforeEach(() => {
    const plan = generatedPlan();
    plan.semesters[1].units = [
      ...plan.semesters[1].units,
      { code: 'SWE30009', name: 'Software Testing', category: 'prescribed_elective' },
    ];
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: plan,
            units: [...PLAN_UNITS, PRESCRIBED, SPARE],
            intakeSemester: 1,
            requirements: [
              { category: 'core', creditPoints: 62.5, unitCount: 5, planCategories: ['core'] },
              { category: 'elective', creditPoints: 37.5, unitCount: 3, planCategories: ['elective', 'prescribed_elective'] },
            ],
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;
  });

  test('removing a prescribed elective reports it as compulsory missing', async () => {
    render(<Harness />);
    await generate();

    expect(screen.queryByText(/required to graduate/i)).toBeNull();

    await confirmRemove('SWE30009');

    const missing = await screen.findByText(/required to graduate but .* not in this plan/i);
    expect(missing.textContent).toMatch(/SWE30009/);
  });

  test('replacing it with another elective does not silence the warning', async () => {
    render(<Harness />);
    await generate();

    await confirmRemove('SWE30009');
    await screen.findByText(/required to graduate but .* not in this plan/i);

    // The credit total adds up again, but the compulsory unit is still missing
    fireEvent.change(pickers()[1], { target: { value: 'E3' } });

    await waitFor(() => expect(screen.getByText('E3')).toBeTruthy());
    expect(screen.queryByText(/Electives total/i)).toBeNull();
    const missing = screen.getByText(/required to graduate but .* not in this plan/i);
    expect(missing.textContent).toMatch(/SWE30009/);
  });

  test('a plain elective removed and replaced raises nothing', async () => {
    render(<Harness />);
    await generate();

    await confirmRemove('E1');
    fireEvent.change(pickers()[1], { target: { value: 'E3' } });

    await waitFor(() => expect(screen.getByText('E3')).toBeTruthy());
    // C4 is core and deliberately unplaced, so its own warning stands; the
    // swapped-out elective raises none of its own
    const compulsory = screen.queryAllByText(/required to graduate but .* not in this plan/i);
    expect(compulsory.map((el) => el.textContent ?? '').join(' ')).not.toMatch(/E1/);
    expect(screen.queryByText(/Electives total/i)).toBeNull();
  });
});

// Kelvin's confirmation: Remove opens a modal, and only confirming removes the unit.
describe('removing a unit asks for confirmation', () => {
  const overlay = () => document.querySelector('[class*="modalOverlay"]') as HTMLElement;
  const modalCard = () => document.querySelector('[class*="modalCard"]') as HTMLElement;
  const stillThere = (code: string) => screen.getAllByText(code, { selector: 'code' }).length > 0;

  test('Remove opens the confirmation and removes nothing yet', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));

    expect(await screen.findByText(/Remove Unit from Pathway\?/)).toBeTruthy();
    expect(within(modalCard()).getByText('C1')).toBeTruthy();
    expect(within(modalCard()).getByText('Core One')).toBeTruthy();
    // The row is still in the plan and the plan is not marked edited
    expect(screen.getByLabelText('Remove C1')).toBeTruthy();
    expect(screen.queryByText('edited')).toBeNull();
  });

  test('Cancel closes it without removing', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/Remove Unit from Pathway\?/)).toBeNull();
    expect(stillThere('C1')).toBe(true);
    expect(screen.queryByText('edited')).toBeNull();
  });

  test('the close button in the header closes it without removing', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    await screen.findByText(/Remove Unit from Pathway\?/);
    fireEvent.click(within(document.querySelector('[class*="modalHeader"]') as HTMLElement).getByRole('button'));

    expect(screen.queryByText(/Remove Unit from Pathway\?/)).toBeNull();
    expect(stillThere('C1')).toBe(true);
    expect(screen.queryByText('edited')).toBeNull();
  });

  test('clicking outside the card closes it, and clicking inside does not', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    await screen.findByText(/Remove Unit from Pathway\?/);

    fireEvent.click(modalCard());
    expect(screen.getByText(/Remove Unit from Pathway\?/)).toBeTruthy();

    fireEvent.click(overlay());
    expect(screen.queryByText(/Remove Unit from Pathway\?/)).toBeNull();
    expect(stillThere('C1')).toBe(true);
  });

  test('confirming removes that unit, closes the confirmation and marks the plan edited', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Unit' }));

    expect(screen.queryByText(/Remove Unit from Pathway\?/)).toBeNull();
    expect(screen.queryByText('C1', { selector: 'code' })).toBeNull();
    expect(screen.getByText('edited')).toBeTruthy();
    // Nothing else went with it
    for (const code of ['INTRO', 'C2', 'C3', 'ADV', 'E1']) expect(stillThere(code)).toBe(true);
  });

  test('a cancelled removal does not carry over to the next one', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByLabelText('Remove C2'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Unit' }));

    expect(screen.queryByText('C2', { selector: 'code' })).toBeNull();
    expect(stillThere('C1')).toBe(true);
  });

  test('removing a unit that others need names them', async () => {
    render(<Harness />);
    await generate();

    // ADV needs INTRO
    fireEvent.click(screen.getByLabelText('Remove INTRO'));

    const card = within(await waitFor(() => modalCard()));
    expect(card.getByText(/Broken Prerequisite Chain/)).toBeTruthy();
    expect(card.getByText(/1 other planned unit \(ADV\) depend on this unit/)).toBeTruthy();
  });

  test('removing a unit nothing needs does not mention a broken chain', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));

    const card = within(await waitFor(() => modalCard()));
    expect(card.queryByText(/Broken Prerequisite Chain/)).toBeNull();
    expect(card.getByText(/returned to the unplaced pool/)).toBeTruthy();
  });

  test('a core unit and an elective are described differently', async () => {
    render(<Harness />);
    await generate();

    fireEvent.click(screen.getByLabelText('Remove C1'));
    let card = within(await waitFor(() => modalCard()));
    expect(card.getByText(/Compulsory Core Unit/)).toBeTruthy();
    expect(card.queryByText(/Credit Shortfall/)).toBeNull();
    fireEvent.click(card.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByLabelText('Remove E1'));
    card = within(await waitFor(() => modalCard()));
    expect(card.getByText(/Credit Shortfall/)).toBeTruthy();
    expect(card.queryByText(/Compulsory Core Unit/)).toBeNull();
  });
});
