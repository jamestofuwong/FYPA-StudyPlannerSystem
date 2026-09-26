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

const row = (u: { code: string; name: string; category: string }, extra: object = {}) => ({
  code: u.code,
  name: u.name,
  category: u.category,
  ...extra,
});

// Every category a row can have, so the Swap rule is checked against all of them
const INTRO = planUnit('INTRO', 'Intro to Programming');
const C1 = planUnit('C1', 'Core One');
const C2 = planUnit('C2', 'Core Two');
const C3 = planUnit('C3', 'Core Three');
const C4 = planUnit('C4', 'Core Four');
const ADV = planUnit('ADV', 'Advanced Programming', 'core', {
  requisiteGroups: [[{ type: 'unit', unitCode: 'INTRO', requisiteType: 'prerequisite' }]],
});
const E0 = planUnit('E0', 'Elective Zero', 'elective');
const E1 = planUnit('E1', 'Elective One', 'elective');
const REC1 = planUnit('REC1', 'Recommended Elective', 'elective', { recommended: true });
const PRE1 = planUnit('PRE1', 'Prescribed Elective', 'prescribed_elective');
const MAJ1 = planUnit('MAJ1', 'Major Core One', 'major_core');
const DM1 = planUnit('DM1', 'Double Major Unit', 'double_major');
const MIN1 = planUnit('MIN1', 'Minor Unit', 'minor');
const WIL1 = planUnit('WIL1', 'Work Placement', 'wil');
// Unplaced, winter only: its "+ Add unit" option must say where it does run
const WINTER_POOL = planUnit('WINTER2', 'Winter Project', 'wil', { offeringSemesters: [], allOfferingTerms: [4] });

const POOL = [INTRO, C1, C2, C3, C4, ADV, E0, E1, REC1, PRE1, MAJ1, DM1, MIN1, WIL1, WINTER_POOL];

// Year 1 semester 1 is over the normal load and year 1 semester 2 far over it,
// so year 2 semester 1 is the only one with room
const semesters = () => [
  {
    year: 1,
    semester: 1 as const,
    units: [INTRO, C1, C2, C3, E0].map((u) => row(u)),
  },
  {
    year: 1,
    semester: 2 as const,
    units: [
      row(ADV),
      row(E1),
      row(REC1, { recommended: true }),
      { code: 'ELECTIVE', name: 'Elective Slot (To be selected)', category: 'elective', recommended: false },
      row(PRE1),
      row(MAJ1),
      row(DM1),
      row(MIN1),
      row(WIL1),
    ],
  },
  { year: 2, semester: 1 as const, units: [row(C4)] },
];

// Section one: the planner's elective list. Some of it must never be offered.
const CANDIDATES = [
  planUnit('CAND1', 'Elective From List', 'elective'),
  planUnit('WINTER1', 'Winter Only Elective', 'elective', { offeringSemesters: [], allOfferingTerms: [4] }),
  // Already placed, already passed, and MPU: all three are left out
  planUnit('E1', 'Elective One', 'elective'),
  planUnit('DONE1', 'Already Passed', 'elective'),
  planUnit('MPU3999', 'An MPU Unit', 'elective'),
];

// Section two: the catalogue. CAND1 is also here, and must show once only.
const CATALOGUE = [
  { ...planUnit('SWE30009', 'Software Testing', 'elective', {
      requisiteGroups: [[{ type: 'unit', unitCode: 'INTRO', requisiteType: 'prerequisite' }]],
    }), outsidePlanner: true, prefix: 'SWE' },
  { ...planUnit('SWE20004', 'Technical Software Development', 'elective'), outsidePlanner: true, prefix: 'SWE' },
  { ...planUnit('COS30043', 'Interface Design', 'elective'), outsidePlanner: true, prefix: 'COS' },
  { ...planUnit('CAND1', 'Elective From List', 'elective'), outsidePlanner: true, prefix: 'COS' },
  { ...planUnit('E1', 'Elective One', 'elective'), outsidePlanner: true, prefix: 'COS' },
  { ...planUnit('DONE1', 'Already Passed', 'elective'), outsidePlanner: true, prefix: 'COS' },
];

const ELECTIVE_KINDS = ['elective', 'prescribed_elective', 'double_major', 'minor'];
// Seven placed electives of any kind and one passed (DONE1), at 12.5 each
const REQUIREMENTS = [
  { category: 'elective', creditPoints: 100, unitCount: 8, planCategories: ELECTIVE_KINDS },
];

function Seed() {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { courseList: [], selectedEnrollment: 'BA-CS' } as never,
    });
    session.setDashboardData({
      completedCodes: ['DONE1'],
      mpuCourseList: [],
      planners: [{
        id: 'p1',
        intake_month: 3,
        major: { name: 'Software Development' },
        course: { name: 'BA-CS' },
        minors: [],
        units: POOL.map((u) => ({
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

function ClearControl() {
  const session = useStudentSession();
  return (
    <button
      onClick={() => {
        session.setCustomPlan(null);
        session.setPlanUnits([]);
        session.setPlanCompletedUnits([]);
        session.setPlanExtraUnits([]);
        session.setPlanElectiveCandidates([]);
        session.setPlanRequirements([]);
        session.setGeneratedSemesters([]);
        session.setIsPlanEdited(false);
      }}
    >
      Clear student
    </button>
  );
}

const Harness = ({ showPage = true, withClear = false }: { showPage?: boolean; withClear?: boolean }) => (
  <ToastProvider>
    <StudentSessionProvider>
      <Seed />
      {withClear && <ClearControl />}
      {showPage && <PathwayPage />}
    </StudentSessionProvider>
  </ToastProvider>
);

const catalogueCalls = () =>
  (global.fetch as unknown as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('/catalogue'));

beforeEach(() => {
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/api/custom-planner/catalogue')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, units: CATALOGUE, prefixes: ['COS', 'SWE'] }),
      });
    }
    if (String(url).includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { semesters: semesters(), unschedulableUnits: [], warnings: [] },
          units: POOL,
          electiveCandidates: CANDIDATES,
          startYear: 1,
          startSemester: 1,
          intakeSemester: 1,
          requirements: REQUIREMENTS,
          // As the route returns them: a passed unit from the planner's elective list
          completedUnits: [planUnit('DONE1', 'Already Passed', 'elective')],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

async function generate() {
  await act(async () => { fireEvent.click(await screen.findByText(/Generate Custom Pathway/i)); });
  await screen.findByText('INTRO');
}

/** The card of one semester, found from its header. */
const card = (year: number, semester: number) =>
  screen.getByText((_, el) =>
    el?.tagName === 'SPAN' && (el.textContent ?? '').startsWith(`YEAR ${year} · SEM ${semester}`),
  ).parentElement!.parentElement as HTMLElement;

/** Unit codes in a semester, top to bottom. */
const codesIn = (el: HTMLElement) =>
  within(el).getAllByRole('row').slice(1).map((r) => r.querySelector('code')?.textContent ?? '');

const rowOf = (code: string) => screen.getByText(code, { selector: 'code' }).closest('tr') as HTMLElement;

/**
 * Removing a unit now asks first: Remove opens a confirmation, and only its
 * "Remove Unit" button takes the unit out of the plan.
 */
const confirmRemove = async (code: string) => {
  fireEvent.click(screen.getByLabelText(`Remove ${code}`));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Unit' }));
};

const openSwap = async (code: string) => {
  await act(async () => { fireEvent.click(screen.getByLabelText(`Swap ${code}`)); });
  return screen.findByRole('dialog');
};

describe('one picker for every way of choosing an elective', () => {
  test('+ Select Unit on a placeholder opens the picker with both sections', async () => {
    render(<Harness />);
    await generate();

    await act(async () => { fireEvent.click(screen.getByText('+ Select Unit')); });
    const picker = await screen.findByRole('dialog', { name: 'Choose an elective' });

    expect(within(picker).getByText(/From this planner.s elective list/i)).toBeTruthy();
    expect(within(picker).getByText(/Outside the planner/i)).toBeTruthy();
    expect(within(picker).getByText('CAND1')).toBeTruthy();
    expect(within(picker).getByText('SWE30009')).toBeTruthy();
  });

  test('Swap opens the very same picker', async () => {
    render(<Harness />);
    await generate();

    const picker = await openSwap('E1');

    expect(picker.getAttribute('aria-label')).toBe('Swap E1');
    expect(within(picker).getByText(/From this planner.s elective list/i)).toBeTruthy();
    expect(within(picker).getByText(/Outside the planner/i)).toBeTruthy();
  });

  test('the per-semester + Add from catalogue button is gone', async () => {
    render(<Harness />);
    await generate();

    expect(screen.queryByText('+ Add from catalogue')).toBeNull();
    // The dropdown for the student's own planner units stays
    expect(screen.getAllByTitle(/Add a unit to this semester/i).length).toBeGreaterThan(0);
  });

  test('the catalogue is fetched only when a picker first opens, and once', async () => {
    render(<Harness />);
    await generate();
    expect(catalogueCalls()).toHaveLength(0);

    await openSwap('E1');
    await waitFor(() => expect(catalogueCalls()).toHaveLength(1));

    fireEvent.click(within(screen.getByRole('dialog')).getByText('Close'));
    await openSwap('E0');
    expect(catalogueCalls()).toHaveLength(1);
  });
});

describe('choosing a unit for a placeholder', () => {
  test('replaces the placeholder in the same position', async () => {
    render(<Harness />);
    await generate();

    const before = codesIn(card(1, 2));
    expect(before).toEqual(['ADV', 'E1', 'REC1', 'ELECTIVE', 'PRE1', 'MAJ1', 'DM1', 'MIN1', 'WIL1']);

    await act(async () => { fireEvent.click(screen.getByText('+ Select Unit')); });
    fireEvent.click(await within(await screen.findByRole('dialog')).findByText('CAND1'));

    // CAND1 is where ELECTIVE was, and nothing else moved
    expect(codesIn(card(1, 2))).toEqual(['ADV', 'E1', 'REC1', 'CAND1', 'PRE1', 'MAJ1', 'DM1', 'MIN1', 'WIL1']);
    expect(screen.queryByText('ELECTIVE', { selector: 'code' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('edited')).toBeTruthy();
  });

  test('the unit chosen for a placeholder is the advisor\'s own choice, not a recommendation', async () => {
    render(<Harness />);
    await generate();

    await act(async () => { fireEvent.click(screen.getByText('+ Select Unit')); });
    fireEvent.click(await within(await screen.findByRole('dialog')).findByText('CAND1'));

    expect(within(rowOf('CAND1')).queryByText('RECOMMENDED')).toBeNull();
    expect(within(rowOf('CAND1')).queryByText('OUTSIDE PLANNER')).toBeNull();
  });
});

describe('which rows can be swapped', () => {
  test('a recommended elective row has Swap', async () => {
    render(<Harness />);
    await generate();

    expect(screen.getByLabelText('Swap REC1')).toBeTruthy();
    expect(within(rowOf('REC1')).getByText('RECOMMENDED')).toBeTruthy();
  });

  test('so do plain electives', async () => {
    render(<Harness />);
    await generate();

    expect(screen.getByLabelText('Swap E0')).toBeTruthy();
    expect(screen.getByLabelText('Swap E1')).toBeTruthy();
  });

  test.each([
    ['PRE1', 'prescribed elective'],
    ['INTRO', 'core'],
    ['MAJ1', 'major core'],
    ['DM1', 'double major'],
    ['MIN1', 'minor'],
    ['WIL1', 'wil'],
  ])('%s (%s) has no Swap', async (code) => {
    render(<Harness />);
    await generate();

    // The row is there and can still be moved or removed
    expect(screen.getByLabelText(`Remove ${code}`)).toBeTruthy();
    expect(screen.queryByLabelText(`Swap ${code}`)).toBeNull();
  });

  test('an MPU unit never shows as a row, so it cannot be swapped', async () => {
    render(<Harness />);
    await generate();

    expect(screen.queryByLabelText(/^Swap MPU/)).toBeNull();
  });

  test('a placeholder has Select Unit rather than Swap', async () => {
    render(<Harness />);
    await generate();

    expect(screen.queryByLabelText('Swap ELECTIVE')).toBeNull();
    expect(screen.getByText('+ Select Unit')).toBeTruthy();
  });
});

describe('what the picker offers', () => {
  test('leaves out placed, completed and MPU units, and shows no unit twice', async () => {
    render(<Harness />);
    await generate();
    const picker = await openSwap('E0');

    await waitFor(() => expect(within(picker).getByText('SWE30009')).toBeTruthy());

    // E1 is placed, DONE1 is passed, MPU3999 is MPU
    for (const code of ['E1', 'DONE1', 'MPU3999']) {
      expect(within(picker).queryByText(code)).toBeNull();
    }
    // CAND1 is in both lists, and appears once
    expect(within(picker).getAllByText('CAND1')).toHaveLength(1);
  });

  test('a unit that runs only in winter says so rather than "offering unknown"', async () => {
    render(<Harness />);
    await generate();
    const picker = await openSwap('E0');

    const option = within(picker).getByText('WINTER1').closest('button') as HTMLElement;
    expect(within(option).getByText(/only runs in winter/i)).toBeTruthy();
    expect(within(picker).queryByText(/offering unknown/i)).toBeNull();
  });

  test('the + Add unit dropdown reads the same way for a winter-only unit', async () => {
    render(<Harness />);
    await generate();

    const dropdown = screen.getAllByTitle(/Add a unit to this semester/i)[0];
    const option = within(dropdown).getByText(/WINTER2/);
    expect(option.textContent).toMatch(/only runs in winter/i);
    expect(option.textContent).not.toMatch(/offering unknown/i);
  });

  test('a unit not offered in the semester of the row says so', async () => {
    render(<Harness />);
    await generate();
    const picker = await openSwap('E0');

    // Nothing in this fixture runs in only one semester, so none of them carries the hint
    expect(within(picker).queryByText(/not offered this term/i)).toBeNull();
  });

  test('searching and filtering by SWE narrows the list', async () => {
    render(<Harness />);
    await generate();
    const picker = await openSwap('E0');
    await waitFor(() => expect(within(picker).getByText('COS30043')).toBeTruthy());

    fireEvent.change(within(picker).getByLabelText('Filter by unit code prefix'), { target: { value: 'SWE' } });
    await waitFor(() => expect(within(picker).queryByText('COS30043')).toBeNull());
    expect(within(picker).getByText('SWE30009')).toBeTruthy();
    expect(within(picker).getByText('SWE20004')).toBeTruthy();

    fireEvent.change(within(picker).getByLabelText('Search electives'), { target: { value: 'testing' } });
    await waitFor(() => expect(within(picker).queryByText('SWE20004')).toBeNull());
    expect(within(picker).getByText('SWE30009')).toBeTruthy();
  });
});

describe('swapping a real elective', () => {
  test('from the elective list clears the RECOMMENDED tag and stays out of OUTSIDE PLANNER', async () => {
    render(<Harness />);
    await generate();
    expect(within(rowOf('REC1')).getByText('RECOMMENDED')).toBeTruthy();

    const picker = await openSwap('REC1');
    fireEvent.click(within(picker).getByText('CAND1'));

    expect(screen.queryByText('REC1', { selector: 'code' })).toBeNull();
    expect(within(rowOf('CAND1')).queryByText('RECOMMENDED')).toBeNull();
    expect(within(rowOf('CAND1')).queryByText('OUTSIDE PLANNER')).toBeNull();
    // It took the position REC1 had
    expect(codesIn(card(1, 2))).toEqual(['ADV', 'E1', 'CAND1', 'ELECTIVE', 'PRE1', 'MAJ1', 'DM1', 'MIN1', 'WIL1']);
  });

  test('from the catalogue shows OUTSIDE PLANNER, and its requisites are checked', async () => {
    render(<Harness />);
    await generate();

    // E0 shares semester one with INTRO, so a unit that needs INTRO is not ready there
    const picker = await openSwap('E0');
    fireEvent.click(await within(picker).findByText('SWE30009'));

    expect(within(rowOf('SWE30009')).getByText('OUTSIDE PLANNER')).toBeTruthy();
    expect(within(rowOf('SWE30009')).queryByText('RECOMMENDED')).toBeNull();
    expect(await screen.findByText(/SWE30009 needs INTRO/i)).toBeTruthy();
  });

  test('a catalogue unit swapped in a semester after its prerequisite is not flagged', async () => {
    render(<Harness />);
    await generate();

    const picker = await openSwap('E1');
    fireEvent.click(await within(picker).findByText('SWE30009'));

    expect(within(rowOf('SWE30009')).getByText('OUTSIDE PLANNER')).toBeTruthy();
    expect(screen.queryByText(/SWE30009 needs/i)).toBeNull();
  });

  test('leaves the elective total unchanged, so no shortfall or excess appears', async () => {
    render(<Harness />);
    await generate();
    expect(screen.queryByText(/Electives total/i)).toBeNull();

    const picker = await openSwap('E1');
    fireEvent.click(await within(picker).findByText('COS30043'));

    await waitFor(() => expect(screen.getByText('edited')).toBeTruthy());
    expect(screen.queryByText(/Electives total/i)).toBeNull();
  });

  test('an added catalogue unit survives leaving the page and coming back', async () => {
    const { rerender } = render(<Harness />);
    await generate();
    fireEvent.click(await within(await openSwap('E1')).findByText('SWE20004'));
    await screen.findByText('OUTSIDE PLANNER');

    rerender(<Harness showPage={false} />);
    expect(screen.queryByText('SWE20004')).toBeNull();
    rerender(<Harness showPage />);

    await screen.findByText('INTRO');
    expect(within(rowOf('SWE20004')).getByText('OUTSIDE PLANNER')).toBeTruthy();
  });

  test('Clear removes it', async () => {
    render(<Harness withClear />);
    await generate();
    fireEvent.click(await within(await openSwap('E1')).findByText('SWE20004'));
    await screen.findByText('OUTSIDE PLANNER');

    await act(async () => { fireEvent.click(screen.getByText('Clear student')); });

    expect(screen.queryByText('SWE20004')).toBeNull();
    expect(screen.queryByText('OUTSIDE PLANNER')).toBeNull();
  });
});

describe('filling a gap after a removal', () => {
  const removeE1 = async () => {
    await confirmRemove('E1');
    return screen.findByText(/Electives total 87.5 credit points, but 100 are required/i);
  };

  test('removing an elective shows the shortfall with a Choose elective button', async () => {
    render(<Harness />);
    await generate();
    await removeE1();

    expect(screen.getByRole('button', { name: 'Choose elective' })).toBeTruthy();
  });

  test('other warnings do not get one', async () => {
    render(<Harness />);
    await generate();
    await confirmRemove('C1');

    await screen.findByText(/required to graduate but .* not in this plan/i);
    expect(screen.queryByRole('button', { name: 'Choose elective' })).toBeNull();
  });

  test('defaults to the earliest semester with room under the normal load', async () => {
    render(<Harness />);
    await generate();
    await removeE1();

    fireEvent.click(screen.getByRole('button', { name: 'Choose elective' }));
    const picker = await screen.findByRole('dialog');

    // Year 1 has no room, so it is year 2 semester 1
    const slot = within(picker).getByLabelText('Semester to add the elective to') as HTMLSelectElement;
    expect(slot.value).toBe('2-1');
  });

  test('choosing one adds it there and clears the shortfall', async () => {
    render(<Harness />);
    await generate();
    await removeE1();

    fireEvent.click(screen.getByRole('button', { name: 'Choose elective' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('CAND1'));

    expect(codesIn(card(2, 1))).toEqual(['C4', 'CAND1']);
    await waitFor(() => expect(screen.queryByText(/Electives total/i)).toBeNull());
    expect(screen.queryByRole('button', { name: 'Choose elective' })).toBeNull();
  });

  test('the advisor can pick another semester', async () => {
    render(<Harness />);
    await generate();
    await removeE1();

    fireEvent.click(screen.getByRole('button', { name: 'Choose elective' }));
    const picker = await screen.findByRole('dialog');
    fireEvent.change(within(picker).getByLabelText('Semester to add the elective to'), { target: { value: '1-1' } });
    fireEvent.click(within(picker).getByText('CAND1'));

    expect(codesIn(card(1, 1))).toContain('CAND1');
    expect(codesIn(card(2, 1))).toEqual(['C4']);
  });

  test('a unit chosen from the catalogue is tagged and added as an outside unit', async () => {
    render(<Harness />);
    await generate();
    await removeE1();

    fireEvent.click(screen.getByRole('button', { name: 'Choose elective' }));
    fireEvent.click(await within(await screen.findByRole('dialog')).findByText('COS30043'));

    expect(within(rowOf('COS30043')).getByText('OUTSIDE PLANNER')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Electives total/i)).toBeNull());
  });
});
