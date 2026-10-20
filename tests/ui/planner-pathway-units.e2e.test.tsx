/** @jest-environment jsdom */
// @ts-nocheck
import React, { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlannersPage from '@/app/(pages)/planners/page';
import PathwayPage from '@/app/(pages)/pathway/page';
import UnitsPage from '@/app/(pages)/units/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  prefetch: jest.fn(),
};

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/planners',
  useSearchParams: () => mockSearchParams,
}));

const mockPdfSave = jest.fn();

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    setTextColor: jest.fn(),
    text: jest.fn(),
    addPage: jest.fn(),
    save: mockPdfSave,
    lastAutoTable: { finalY: 40 },
  })),
}), { virtual: true });

jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: jest.fn((doc: any) => {
    doc.lastAutoTable = { finalY: 40 };
  }),
}), { virtual: true });

const plannerSummary = {
  id: 'planner-1',
  intake_year: 2024,
  intake_month: 2,
  core_count: 1,
  core_cp: 12.5,
  major_count: 0,
  major_cp: 0,
  elective_count: 1,
  elective_cp: 12.5,
  wil_count: 0,
  wil_cp: 0,
  course: { code: 'BCS', name: 'Bachelor of Computer Science' },
  major: { name: 'Software Development' },
  _count: { units: 2 },
};

const plannerDetails = {
  ...plannerSummary,
  units: [
    {
      id: 'template-unit-1',
      year_level: 1,
      semester: 1,
      category: 'core',
      unit: {
        unit_code: 'COS10009',
        unit_name: 'Introduction to Programming',
        offerings: [{ offered_in: 1 }],
        requisite_groups: [],
      },
    },
  ],
  elective_groups: [
    {
      units: [
        {
          unit: {
            unit_code: 'COS20001',
            unit_name: 'Cloud Systems',
            offerings: [{ offered_in: 2 }],
            requisite_groups: [],
          },
        },
      ],
    },
  ],
  minors: [],
};

const unitsPayload = [
  {
    id: 'u1',
    unit_code: 'COS10009',
    unit_name: 'Introduction to Programming',
    offerings: [1],
    prerequisite: '',
  },
  {
    id: 'u2',
    unit_code: 'COS20001',
    unit_name: 'Cloud Systems',
    offerings: [],
    prerequisite: 'COS10009',
  },
];

const planUnit = (code: string, name: string, category = 'core', overrides: any = {}) => ({
  code,
  name,
  category,
  offeringSemesters: [1, 2],
  allOfferingTerms: [1, 2],
  requisiteGroups: [],
  ...overrides,
});

const pathwayUnits = [
  planUnit('INTRO', 'Intro to Programming'),
  planUnit('ADV', 'Advanced Programming', 'core', {
    requisiteGroups: [[{ type: 'unit', unitCode: 'INTRO', requisiteType: 'prerequisite' }]],
  }),
  planUnit('E1', 'Elective One', 'elective'),
  planUnit('E2', 'Elective Two', 'elective'),
  planUnit('WIL30001', 'Professional Experience', 'wil', {
    offeringSemesters: [],
    allOfferingTerms: [4],
  }),
];

function renderPlanners() {
  return render(<PlannersPage />);
}

function renderUnits() {
  return render(<UnitsPage />);
}

function SeedPathwaySession({ selected = true }: { selected?: boolean }) {
  const session = useStudentSession();
  useEffect(() => {
    if (!selected) return;
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'STU001',
      student: {
        selectedEnrollment: 'Bachelor of Computer Science',
        courseList: [],
      },
    } as never);
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      planners: [
        {
          id: 'planner-1',
          intake_month: 2,
          course: { name: 'Bachelor of Computer Science' },
          major: { name: 'Software Development' },
          minors: [],
          units: pathwayUnits.map((u, index) => ({
            category: u.category,
            year_level: index < 2 ? 1 : 2,
            semester: index % 2 === 0 ? 1 : 2,
            unit: { unit_code: u.code, unit_name: u.name, requisite_groups: [] },
          })),
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderPathway({ selected = true } = {}) {
  return render(
    <ToastProvider>
      <StudentSessionProvider>
        <SeedPathwaySession selected={selected} />
        <PathwayPage />
      </StudentSessionProvider>
    </ToastProvider>
  );
}

function generatedPathway() {
  return {
    semesters: [
      {
        year: 1,
        semester: 1,
        units: [
          { code: 'INTRO', name: 'Intro to Programming', category: 'core' },
          { code: 'E1', name: 'Elective One', category: 'elective' },
        ],
      },
      {
        year: 1,
        semester: 2,
        units: [{ code: 'ADV', name: 'Advanced Programming', category: 'core' }],
      },
    ],
    unschedulableUnits: [{ code: 'WIL30001', name: 'Professional Experience', category: 'wil' }],
    warnings: [{ kind: 'budget_exhausted', unitCodes: ['WIL30001'] }],
  };
}

async function generatePathway() {
  await screen.findByText(/Generate Custom Pathway/i);
  await act(async () => {
    fireEvent.click(screen.getByText(/Generate Custom Pathway/i));
  });
  await screen.findByText('INTRO');
}

describe('planner and study plan e2e happy and failed paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  test('loads planner list, details, template units, and elective groups', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([plannerSummary]) } as Response);
      }
      if (url === '/api/planners/planner-1') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(plannerDetails) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderPlanners();

    expect(await screen.findByText('Bachelor of Computer Science')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bachelor of Computer Science'));
    fireEvent.click((await screen.findAllByText('2024'))[0]);
    fireEvent.click((await screen.findAllByText('Software Development'))[0]);

    expect(await screen.findByText('COS10009')).toBeInTheDocument();
    expect(screen.getByText('Introduction to Programming')).toBeInTheDocument();
    expect(screen.getByText('COS20001')).toBeInTheDocument();
  });

  test('handles planner API failure, invalid planner id, and missing template units', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Planner API unavailable' }) } as Response)
    );

    const apiFailure = renderPlanners();
    expect(await screen.findByText(/No planners found/i)).toBeInTheDocument();
    apiFailure.unmount();

    mockSearchParams = new URLSearchParams('plannerId=missing-planner');
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([plannerSummary]) } as Response);
      }
      if (url === '/api/planners/missing-planner') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const invalid = renderPlanners();
    expect((await screen.findAllByText(/Select a planner from the sidebar/i)).length).toBeGreaterThan(0);
    invalid.unmount();

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([plannerSummary]) } as Response);
      }
      if (url === '/api/planners/planner-1') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...plannerDetails, units: [], elective_groups: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderPlanners();
    expect(await screen.findByText(/No units attached to this planner template/i)).toBeInTheDocument();
  });

  test('edits planner unit type, offered-in dropdown, prerequisite text, saves changes, and deletes planner', async () => {
    const savedBodies: any[] = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([plannerSummary]) } as Response);
      }
      if (url === '/api/planners/planner-1' && init?.method === 'PUT') {
        savedBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      if (url === '/api/planners/planner-1' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      if (url === '/api/planners/planner-1/template-units' && init?.method === 'PUT') {
        savedBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      if (url === '/api/planners/planner-1') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(plannerDetails) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderPlanners();

    expect(await screen.findByText('Bachelor of Computer Science')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bachelor of Computer Science'));
    fireEvent.click((await screen.findAllByText('2024'))[0]);
    fireEvent.click((await screen.findAllByText('Software Development'))[0]);
    expect(await screen.findByText('COS10009')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit Planner/i }));

    const unitCodeInput = await screen.findByDisplayValue('COS10009');
    const unitRow = unitCodeInput.closest('tr') as HTMLElement;
    const [typeSelect, offeredInSelect] = within(unitRow).getAllByRole('combobox');

    fireEvent.change(typeSelect, { target: { value: 'major_core' } });
    fireEvent.change(offeredInSelect, { target: { value: '1,2' } });

    const editableFields = unitRow.querySelectorAll('[contenteditable="true"]');
    const prerequisiteField = editableFields[1] as HTMLElement;
    prerequisiteField.textContent = 'COS10008';
    fireEvent.blur(prerequisiteField);

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await screen.findByRole('dialog', { name: /Changes saved/i });
    expect(savedBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          template_unit_id: 'template-unit-1',
          category: 'major_core',
          offered_in: [1, 2],
          prerequisite: 'COS10008',
        }),
      ])
    );

    fireEvent.click(screen.getByRole('button', { name: /^OK$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Delete Planner/i }));

    const deleteDialog = await screen.findByRole('dialog', { name: /Delete planner/i });
    fireEvent.click(within(deleteDialog).getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/planners/planner-1', expect.objectContaining({ method: 'DELETE' }));
    });
    expect(await screen.findByText(/No planners found/i)).toBeInTheDocument();
  });

  test('planner edit cancel restores values, save failures show errors, and delete failure keeps planner', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/planners') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([plannerSummary]) } as Response);
      }
      if (url === '/api/planners/planner-1/template-units' && init?.method === 'PUT') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Failed to save planner unit' }) } as Response);
      }
      if (url === '/api/planners/planner-1' && init?.method === 'DELETE') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Failed to delete planner.' }) } as Response);
      }
      if (url === '/api/planners/planner-1') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(plannerDetails) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderPlanners();

    expect(await screen.findByText('Bachelor of Computer Science')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bachelor of Computer Science'));
    fireEvent.click((await screen.findAllByText('2024'))[0]);
    fireEvent.click((await screen.findAllByText('Software Development'))[0]);
    expect(await screen.findByText('COS10009')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit Planner/i }));
    const unitCodeInput = await screen.findByDisplayValue('COS10009');
    const unitRow = unitCodeInput.closest('tr') as HTMLElement;
    const [typeSelect] = within(unitRow).getAllByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'wil' } });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.getAllByText('Core').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Edit Planner/i }));
    const editRow = (await screen.findByDisplayValue('COS10009')).closest('tr') as HTMLElement;
    fireEvent.change(within(editRow).getAllByRole('combobox')[0], { target: { value: 'major_core' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    expect(await screen.findByText(/Failed to save planner unit/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Delete Planner/i }));
    const deleteDialog = await screen.findByRole('dialog', { name: /Delete planner/i });
    fireEvent.click(within(deleteDialog).getByRole('button', { name: /^Delete$/i }));
    expect(await screen.findByText(/Failed to delete planner/i)).toBeInTheDocument();
    expect(screen.getAllByText('Software Development').length).toBeGreaterThan(0);
  });
});

afterEach(() => {
  cleanup();
});

describe('pathway builder e2e happy and failed paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.push.mockClear();
    mockPdfSave.mockClear();
    window.confirm = jest.fn(() => true);
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/custom-planner') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: generatedPathway(),
            units: pathwayUnits,
            electiveCandidates: [planUnit('E2', 'Elective Two', 'elective')],
            requirements: [{ category: 'elective', creditPoints: 25, unitCount: 2, planCategories: ['elective'] }],
            completedUnits: [],
            intakeSemester: 1,
          }),
        } as Response);
      }
      if (url.startsWith('/api/custom-planner/catalogue')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, units: [], prefixes: [] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
  });

  test('opens pathway from selected planner, moves units, adds elective, and recalculates warnings', async () => {
    renderPathway();
    await generatePathway();

    expect(screen.getByText(/Extended Study Plan/i)).toBeInTheDocument();
    expect(screen.getAllByText(/WIL30001/i).length).toBeGreaterThan(0);

    const advRow = screen.getByText('ADV').closest('tr') as HTMLElement;
    fireEvent.change(within(advRow).getByTitle('Move to another semester'), { target: { value: '1-1' } });
    expect((await screen.findAllByText(/ADV needs INTRO/i)).length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByTitle(/Add a unit to this semester|already placed/i)[0], { target: { value: 'E2' } });
    expect(await screen.findByText('E2')).toBeInTheDocument();
    expect(screen.getByText('edited')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download PDF/i })).toBeInTheDocument();
  });

  test('student pathway can add a semester, reset generated plan, download PDF, and regenerate', async () => {
    renderPathway();
    await generatePathway();

    expect(screen.getByText(/Extended Study Plan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Regenerate Pathway/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add semester/i }));
    expect(await screen.findByText('edited')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset to generated plan/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reset to generated plan/i }));
    await waitFor(() => {
      expect(screen.queryByText('edited')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Download PDF/i }));
    expect(await screen.findByText(/Please choose your save location/i)).toBeInTheDocument();
    expect(mockPdfSave).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Regenerate Pathway/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/custom-planner', expect.objectContaining({ method: 'POST' }));
      expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => url === '/api/custom-planner').length).toBeGreaterThanOrEqual(2);
    });
  });

  test('shows prompt with no selected planner, blocks failed generation, and shows empty elective picker', async () => {
    const prompt = renderPathway({ selected: false });
    expect(await screen.findByText(/No student loaded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Go to Major Detection/i }));
    expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
    prompt.unmount();

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/custom-planner') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Save conflict' }) } as Response);
      }
      if (url.startsWith('/api/custom-planner/catalogue')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Catalogue unavailable' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    const failed = renderPathway();
    await screen.findByText(/Generate Custom Pathway/i);
    fireEvent.click(screen.getByText(/Generate Custom Pathway/i));
    expect(await screen.findByText(/Failed to generate custom pathway/i)).toBeInTheDocument();
    failed.unmount();

    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/custom-planner') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              ...generatedPathway(),
              warnings: [{ kind: 'requirement_shortfall', category: 'elective', have: 12.5, need: 25 }],
            },
            units: pathwayUnits.filter((u) => u.code !== 'E2'),
            electiveCandidates: [],
            requirements: [{ category: 'elective', creditPoints: 25, unitCount: 2, planCategories: ['elective'] }],
            completedUnits: [],
            intakeSemester: 1,
          }),
        } as Response);
      }
      if (url.startsWith('/api/custom-planner/catalogue')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, units: [], prefixes: [] }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderPathway();
    await generatePathway();
    fireEvent.click((await screen.findAllByRole('button', { name: /Choose elective/i }))[0]);
    expect(await screen.findByText(/No units left in this planner's elective list/i)).toBeInTheDocument();
    expect(await screen.findByText(/No units match that search/i)).toBeInTheDocument();
  });
});

describe('units e2e happy and failed paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads units table, filters units, opens offerings modal, previews sync, and confirms', async () => {
    const syncBodies: any[] = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/units' && !init?.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(unitsPayload) } as Response);
      }
      if (url === '/api/units/offerings/sync' && !init) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            yearRangeStr: '2022-2024',
            totalPlannersScanned: 3,
            diffs: [
              {
                unit_id: 'u2',
                unit_code: 'COS20001',
                unit_name: 'Cloud Systems',
                current_offerings: [],
                proposed_offerings: [2],
                status: 'new',
              },
            ],
          }),
        } as Response);
      }
      if (url === '/api/units/offerings/sync' && init?.method === 'POST') {
        syncBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(unitsPayload) } as Response);
    });

    renderUnits();
    expect((await screen.findAllByText('COS10009')).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText(/Filter unit code or title/i), { target: { value: 'Cloud' } });
    expect(screen.getAllByText('COS20001').length).toBeGreaterThan(0);
    expect(screen.queryByText('Introduction to Programming')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Unit Offerings/i }));
    expect(await screen.findByText(/Unit Offerings Manager/i)).toBeInTheDocument();
    expect(screen.getByText(/Unclassified Units/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Auto-Detect from Planners/i }));
    expect(await screen.findByText(/Auto-Detect Offerings Review/i)).toBeInTheDocument();
    expect(screen.getAllByText('COS20001').length).toBeGreaterThan(0);

    const syncRow = screen.getAllByText('COS20001').at(-1)?.closest('tr') as HTMLElement;
    const sem1Checkbox = within(syncRow).getByLabelText(/Sem 1/i);
    const sem2Checkbox = within(syncRow).getByLabelText(/Sem 2/i);
    fireEvent.click(sem1Checkbox);
    fireEvent.click(sem2Checkbox);

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Overwrite/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/units/offerings/sync', expect.objectContaining({ method: 'POST' }));
    });
    expect(syncBodies.at(-1)).toEqual({
      updates: [expect.objectContaining({ unit_id: 'u2', offerings: [1] })],
    });
  });

  test('unit offerings manager adds and deletes unit offerings', async () => {
    const offeringBodies: any[] = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/units' && !init?.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(unitsPayload) } as Response);
      }
      if (url === '/api/units/offerings' && (init?.method === 'POST' || init?.method === 'DELETE')) {
        offeringBodies.push({ method: init.method, body: JSON.parse(String(init.body)) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(unitsPayload) } as Response);
    });

    renderUnits();
    expect((await screen.findAllByText('COS10009')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Unit Offerings/i }));
    expect(await screen.findByText(/Unit Offerings Manager/i)).toBeInTheDocument();

    const sem1Section = screen.getByText(/Semester 1 Offerings/i).closest('div')?.parentElement as HTMLElement;
    fireEvent.click(within(sem1Section).getByRole('button', { name: /Add Unit/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Search unit code or name to add to Semester 1/i), {
      target: { value: 'Cloud' },
    });
    const cloudDropdownOption = (await screen.findAllByText('Cloud Systems'))
      .find((node) => node.className === 'dropdownItemTitle') as HTMLElement;
    fireEvent.click(cloudDropdownOption.closest('div[class*="dropdownItem"]') as HTMLElement);

    await waitFor(() => {
      expect(offeringBodies).toEqual(
        expect.arrayContaining([
          { method: 'POST', body: { unit_id: 'u2', term: 1 } },
        ])
      );
    });

    fireEvent.click(screen.getByTitle(/Remove from Semester 1/i));

    await waitFor(() => {
      expect(offeringBodies).toEqual(
        expect.arrayContaining([
          { method: 'DELETE', body: { unit_id: 'u1', term: 1 } },
        ])
      );
    });
  });

  test('adds a unit, saves it, edits it from the action column, and links to study planners', async () => {
    const unitSaveBodies: any[] = [];
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/units' && init?.method === 'POST') {
        unitSaveBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
      }
      if (url === '/api/units' && !init?.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(unitsPayload) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderUnits();
    expect((await screen.findAllByText('COS10009')).length).toBeGreaterThan(0);

    const viewPlannersLink = screen.getByRole('link', { name: /View Planners/i });
    expect(viewPlannersLink).toHaveAttribute('href', '/planners');

    fireEvent.click(screen.getByRole('button', { name: /Add Unit/i }));
    expect(await screen.findByText(/Add New Unit/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/COS20007/i), { target: { value: 'SWE40001' } });
    fireEvent.change(screen.getByPlaceholderText(/Object-Oriented Programming/i), { target: { value: 'Software Architecture' } });
    fireEvent.change(screen.getByPlaceholderText(/COS10009/i), { target: { value: 'COS10009' } });
    fireEvent.click(screen.getByLabelText(/Summer Term/i));
    fireEvent.click(screen.getByRole('button', { name: /Save Unit/i }));

    await waitFor(() => {
      expect(unitSaveBodies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            unit_code: 'SWE40001',
            unit_name: 'Software Architecture',
            prerequisite: 'COS10009',
            offerings: [1, 2, 3],
          }),
        ])
      );
    });

    const unitRow = screen.getAllByText('COS10009')
      .map((node) => node.closest('tr') as HTMLElement | null)
      .find((row) => row?.textContent?.includes('Introduction to Programming')) as HTMLElement;
    fireEvent.click(within(unitRow).getByRole('button', { name: /Edit/i }));
    expect(await screen.findByText(/Edit Unit: COS10009/i)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Introduction to Programming'), {
      target: { value: 'Programming Fundamentals' },
    });
    fireEvent.change(screen.getByPlaceholderText(/COS10009/i), { target: { value: 'MTH10006' } });
    fireEvent.click(screen.getByLabelText(/Semester 2/i));
    fireEvent.click(screen.getByRole('button', { name: /Save Unit/i }));

    await waitFor(() => {
      expect(unitSaveBodies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            unit_code: 'COS10009',
            unit_name: 'Programming Fundamentals',
            prerequisite: 'MTH10006',
            offerings: [1, 2],
          }),
        ])
      );
    });
  });

  test('handles units API failure, empty search, missing offerings, and sync API failure', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Units API unavailable' }) } as Response)
    );

    const apiFailure = renderUnits();
    expect(await screen.findByText(/No units in catalog/i)).toBeInTheDocument();
    apiFailure.unmount();

    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/units' && !init?.method) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'u3', unit_code: 'SWE30001', unit_name: 'Software Project' }]),
        } as Response);
      }
      if (url === '/api/units/offerings/sync') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Sync API unavailable' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response);
    });

    renderUnits();
    expect(await screen.findByText('SWE30001')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText(/Filter unit code or title/i), { target: { value: 'NO_MATCH' } });
    expect(screen.getByText(/No units match "NO_MATCH"/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Filter unit code or title/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Unit Offerings/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Auto-Detect from Planners/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/units/offerings/sync');
    });
    expect(screen.queryByText(/Auto-Detect Offerings Review/i)).not.toBeInTheDocument();
  });

  test('validates unit save fields and surfaces unit save API failure', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/units' && init?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Unit save failed' }) } as Response);
      }
      if (url === '/api/units' && !init?.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(unitsPayload) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderUnits();
    expect((await screen.findAllByText('COS10009')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Add Unit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Unit/i }));
    expect(await screen.findByText(/Unit code is required/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/COS20007/i), { target: { value: 'SWE40002' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Unit/i }));
    expect(await screen.findByText(/Unit name is required/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Object-Oriented Programming/i), { target: { value: 'Advanced Architecture' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Unit/i }));
    expect(await screen.findByText(/Unit save failed/i)).toBeInTheDocument();
  });

  test('shows no-difference auto-detect state and overwrite failure error', async () => {
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/units' && !init?.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(unitsPayload) } as Response);
      }
      if (url === '/api/units/offerings/sync' && init?.method === 'POST') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Overwrite failed' }) } as Response);
      }
      if (url === '/api/units/offerings/sync') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            yearRangeStr: '2022-2024',
            totalPlannersScanned: 3,
            diffs: [
              {
                unit_id: 'u1',
                unit_code: 'COS10009',
                unit_name: 'Introduction to Programming',
                current_offerings: [1],
                proposed_offerings: [1],
                status: 'unchanged',
              },
            ],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });

    renderUnits();
    expect((await screen.findAllByText('COS10009')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Unit Offerings/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Auto-Detect from Planners/i }));
    expect(await screen.findByText(/No differences found/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Show changed & new units only/i));
    const row = (await screen.findAllByText('COS10009')).at(-1)?.closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByLabelText(/Sem 2/i));
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Overwrite/i }));
    expect(await screen.findByText(/Overwrite failed/i)).toBeInTheDocument();
  });
});
