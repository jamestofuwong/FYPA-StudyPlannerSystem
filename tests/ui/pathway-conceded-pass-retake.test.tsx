/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

// Kelvin confirmed (25 Sept, commit 7a1a33b): a Conceded Pass earns credit
// but cannot satisfy a prerequisite, so when something unpassed still needs
// it, generateCustomPlan (pathway/page.tsx ~309-342) substitutes a fresh
// retake instead of leaving the downstream unit permanently blocked. That
// decision is correct and untouched here; this file only checks that the
// substitution is now visible on screen, distinct from a genuine fail.

const schedulableUnit = (code: string, name: string, category: string) => ({
  code,
  name,
  category,
  offeringSemesters: [1, 2],
  allOfferingTerms: [1, 2],
  requisiteGroups: [],
});

const courseRow = (courseId: string, grade: string, status = 'Complete') => ({
  courseId,
  courseTitle: courseId,
  credits: 12.5,
  creditsEarned: 12.5,
  status,
  grade,
  term: '2023_SEP_S2',
});

function Seed({ courseList, plannerUnits }: { courseList: any[]; plannerUnits: any[] }) {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { courseList, selectedEnrollment: 'BA-CS' } as never,
    });
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      planners: [{
        id: 'p1',
        intake_month: 3,
        major: { name: 'Artificial Intelligence' },
        course: { name: 'BA-CS' },
        minors: [],
        units: plannerUnits,
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function mockGenerate(fetchImpl: (semesters: any[]) => any) {
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(fetchImpl(undefined as any)),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

async function generate(anchorText: string) {
  const button = await screen.findByText(/Generate Custom Pathway/i);
  await act(async () => { fireEvent.click(button); });
  await screen.findByText(anchorText);
}

describe('conceded_pass_retake warning visibility', () => {
  test('a CP-held unit blocking one prerequisite: compact "RETAKE (CP)" tag shows, no full-sentence warning', async () => {
    const plannerUnits = [
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
      {
        category: 'prescribed_elective',
        year_level: 1,
        semester: 2,
        unit: {
          unit_code: 'PE1',
          unit_name: 'Prescribed Elective 1',
          requisite_groups: [{ conditions: [{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'CPUNIT' } }] }],
        },
      },
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CPUNIT', unit_name: 'CP Unit', requisite_groups: [] } },
    ];
    const courseList = [courseRow('CPUNIT', 'CP')];

    mockGenerate(() => ({
      success: true,
      data: {
        semesters: [
          { year: 1, semester: 1, units: [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('CPUNIT', 'CP Unit', 'core')] },
          { year: 1, semester: 2, units: [schedulableUnit('PE1', 'Prescribed Elective 1', 'prescribed_elective')] },
        ],
        unschedulableUnits: [],
        warnings: [],
      },
      units: [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('PE1', 'Prescribed Elective 1', 'prescribed_elective'), schedulableUnit('CPUNIT', 'CP Unit', 'core')],
      intakeSemester: 1,
      requirements: [],
      completedUnits: [],
    }));

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed courseList={courseList} plannerUnits={plannerUnits} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('CORE1');

    // One compact signal on CPUNIT's own row, not a full sentence
    const cpRow = screen.getByText('CPUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(cpRow).not.toBeNull();
    expect(cpRow.textContent).toContain('RETAKE (CP)');

    // The old long describeWarning sentence must not render anywhere at all
    expect(screen.queryByText(/was passed as a Conceded Pass, which cannot satisfy/i)).toBeNull();
  });

  test('a CP-held unit that is NOT a prerequisite for anything remaining: no retake, no warning', async () => {
    const plannerUnits = [
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
      { category: 'wil', year_level: 4, semester: 2, unit: { unit_code: 'CAPSTONE', unit_name: 'Capstone', requisite_groups: [] } },
    ];
    // CPUNIT2 is a Conceded Pass with nothing downstream needing it as a prerequisite
    const courseList = [courseRow('CPUNIT2', 'CP')];

    mockGenerate(() => ({
      success: true,
      data: {
        semesters: [
          { year: 1, semester: 1, units: [schedulableUnit('CORE1', 'Core Unit', 'core')] },
          { year: 4, semester: 2, units: [schedulableUnit('CAPSTONE', 'Capstone', 'wil')] },
        ],
        unschedulableUnits: [],
        warnings: [],
      },
      units: [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('CAPSTONE', 'Capstone', 'wil')],
      intakeSemester: 1,
      requirements: [],
      completedUnits: [],
    }));

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed courseList={courseList} plannerUnits={plannerUnits} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('CORE1');

    // No conceded_pass_retake warning anywhere, and CPUNIT2 itself was never
    // scheduled as a retake (it isn't even a planner unit here), matching
    // Kelvin's confirmed intent: the CP's credit points alone are enough.
    expect(screen.queryByText(/Conceded Pass/i)).toBeNull();
    expect(screen.queryByText('CPUNIT2', { selector: 'code' })).toBeNull();
  });

  test('two unpassed units both needing the same CP unit as a prerequisite: the compact tag still ties to the one retaken unit', async () => {
    const plannerUnits = [
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
      {
        category: 'prescribed_elective',
        year_level: 1,
        semester: 2,
        unit: {
          unit_code: 'PE1',
          unit_name: 'Prescribed Elective 1',
          requisite_groups: [{ conditions: [{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'CPUNIT' } }] }],
        },
      },
      {
        category: 'prescribed_elective',
        year_level: 1,
        semester: 2,
        unit: {
          unit_code: 'PE2',
          unit_name: 'Prescribed Elective 2',
          requisite_groups: [{ conditions: [{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'CPUNIT' } }] }],
        },
      },
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CPUNIT', unit_name: 'CP Unit', requisite_groups: [] } },
    ];
    const courseList = [courseRow('CPUNIT', 'CP')];

    mockGenerate(() => ({
      success: true,
      data: {
        semesters: [
          { year: 1, semester: 1, units: [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('CPUNIT', 'CP Unit', 'core')] },
          { year: 1, semester: 2, units: [schedulableUnit('PE1', 'Prescribed Elective 1', 'prescribed_elective'), schedulableUnit('PE2', 'Prescribed Elective 2', 'prescribed_elective')] },
        ],
        unschedulableUnits: [],
        warnings: [],
      },
      units: [
        schedulableUnit('CORE1', 'Core Unit', 'core'),
        schedulableUnit('PE1', 'Prescribed Elective 1', 'prescribed_elective'),
        schedulableUnit('PE2', 'Prescribed Elective 2', 'prescribed_elective'),
        schedulableUnit('CPUNIT', 'CP Unit', 'core'),
      ],
      intakeSemester: 1,
      requirements: [],
      completedUnits: [],
    }));

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed courseList={courseList} plannerUnits={plannerUnits} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('CORE1');

    // The tag sits on CPUNIT's row (the retaken unit) even though two
    // separate units needed it, not duplicated onto PE1's or PE2's rows,
    // and no full sentence anywhere naming them.
    const cpRow = screen.getByText('CPUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(cpRow.textContent).toContain('RETAKE (CP)');
    const pe1Row = screen.getByText('PE1', { selector: 'code' }).closest('tr') as HTMLElement;
    const pe2Row = screen.getByText('PE2', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(pe1Row.textContent).not.toContain('RETAKE');
    expect(pe2Row.textContent).not.toContain('RETAKE');
    expect(screen.queryByText(/was passed as a Conceded Pass, which cannot satisfy/i)).toBeNull();
  });

  test('the RETAKE badge tooltip distinguishes a Conceded-Pass substitution from a genuine fail', async () => {
    const plannerUnits = [
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
      {
        category: 'prescribed_elective',
        year_level: 1,
        semester: 2,
        unit: {
          unit_code: 'PE1',
          unit_name: 'Prescribed Elective 1',
          requisite_groups: [{ conditions: [{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'CPUNIT' } }] }],
        },
      },
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CPUNIT', unit_name: 'CP Unit', requisite_groups: [] } },
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'FAILUNIT', unit_name: 'Failed Unit', requisite_groups: [] } },
    ];
    // CPUNIT: Conceded Pass, blocking PE1's prerequisite -> retaken for that reason.
    // FAILUNIT: a genuine fail (N), unrelated to any prerequisite -> retaken because it failed.
    const courseList = [courseRow('CPUNIT', 'CP'), courseRow('FAILUNIT', 'N')];

    mockGenerate(() => ({
      success: true,
      data: {
        semesters: [
          {
            year: 1, semester: 1,
            units: [
              schedulableUnit('CORE1', 'Core Unit', 'core'),
              schedulableUnit('CPUNIT', 'CP Unit', 'core'),
              schedulableUnit('FAILUNIT', 'Failed Unit', 'core'),
            ],
          },
          { year: 1, semester: 2, units: [schedulableUnit('PE1', 'Prescribed Elective 1', 'prescribed_elective')] },
        ],
        unschedulableUnits: [],
        warnings: [],
      },
      units: [
        schedulableUnit('CORE1', 'Core Unit', 'core'),
        schedulableUnit('PE1', 'Prescribed Elective 1', 'prescribed_elective'),
        schedulableUnit('CPUNIT', 'CP Unit', 'core'),
        schedulableUnit('FAILUNIT', 'Failed Unit', 'core'),
      ],
      intakeSemester: 1,
      requirements: [],
      completedUnits: [],
    }));

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed courseList={courseList} plannerUnits={plannerUnits} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('CORE1');

    const cpRow = screen.getByText('CPUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    const cpRetakeBadge = Array.from(cpRow.querySelectorAll('span')).find((el) => el.textContent === 'RETAKE (CP)') as HTMLElement;
    expect(cpRetakeBadge).toBeTruthy();
    expect(cpRetakeBadge.title).toBe('Retaken: was a Conceded Pass');

    const failRow = screen.getByText('FAILUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    const failRetakeBadge = Array.from(failRow.querySelectorAll('span')).find((el) => el.textContent === 'RETAKE') as HTMLElement;
    expect(failRetakeBadge).toBeTruthy();
    expect(failRetakeBadge.title).toBe('Previously attempted and failed — this is a repeat attempt.');
  });
});
