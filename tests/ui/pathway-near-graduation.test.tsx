/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

// Real transcript (grid (1).xlsx): a near-graduation student with every
// core/major/elective unit already complete, leaving only MPU and a
// short-term-only WIL unit outstanding. isReqUnit (pathway/page.tsx ~817)
// excludes both categories, so totalUnplanned was 0 for this shape, and the
// whole Extended Study Plan section (including the Generate button and, once
// generated, Add semester/Download) used to disappear with no error at all.

const courseRow = (courseId: string, status = 'Complete') => ({
  courseId,
  courseTitle: courseId,
  credits: 12.5,
  creditsEarned: status === 'Complete' ? 12.5 : 0,
  status,
  grade: status === 'Complete' ? 'HD' : '',
  term: '2026_MAR_S1',
});

const plannerUnits = [
  { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
  { category: 'mpu', year_level: 1, semester: 1, unit: { unit_code: 'MPU1', unit_name: 'MPU Unit' } },
  { category: 'wil', year_level: 4, semester: 2, unit: { unit_code: 'WIL1', unit_name: 'WIL Unit', requisite_groups: [] } },
];

function Seed() {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: { courseList: [courseRow('CORE1')], selectedEnrollment: 'BA-CS' } as never,
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

const Harness = () => (
  <ToastProvider>
    <StudentSessionProvider>
      <Seed />
      <PathwayPage />
    </StudentSessionProvider>
  </ToastProvider>
);

function mockGenerate(data: any) {
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data,
          units: [],
          intakeSemester: 1,
          requirements: [],
          completedUnits: [],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

describe('near-graduation student: only MPU/WIL units remain unplanned', () => {
  test('the Extended Study Plan summary box and Generate button are visible before generating, not a blank page', async () => {
    render(<Harness />);

    expect(await screen.findByText(/Extended Study Plan/i)).toBeTruthy();
    expect(document.body.textContent).toMatch(/0\s*unplanned unit/i);
    expect(screen.getByText(/Generate Custom Pathway/i)).toBeTruthy();
  });

  test('a generated plan with zero semesters still renders Add semester and the Download buttons, not a blank page', async () => {
    mockGenerate({
      semesters: [],
      unschedulableUnits: [{ code: 'WIL1', name: 'WIL Unit', category: 'wil' }],
      warnings: [{ kind: 'short_term_only', unitCode: 'WIL1', offeringTerms: [4] }],
    });

    render(<Harness />);
    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });

    // This exact shape is Case A (see the "ready-to-graduate" describe block
    // below for the message itself) — here we only check the page isn't blank.
    expect(await screen.findByText(/\+ Add semester/i)).toBeTruthy();
    expect(screen.getByText(/Download PDF/i)).toBeTruthy();
    expect(screen.getByText(/Download Excel/i)).toBeTruthy();
  });
});

describe('ready-to-graduate message replaces the generic failure message', () => {
  // Same shape as grid (1).xlsx: CORE1 complete, MPU1 still outstanding, and
  // the only unschedulable item is WIL1 (short-term-only, tracked separately
  // via the "Remaining MPU/WIL" tables, not a genuine scheduling failure).
  test('0 unplanned units with MPU remaining: shows "no further core units required, complete MPU" not the failure message', async () => {
    mockGenerate({
      semesters: [],
      unschedulableUnits: [{ code: 'WIL1', name: 'WIL Unit', category: 'wil' }],
      warnings: [{ kind: 'short_term_only', unitCode: 'WIL1', offeringTerms: [4] }],
    });

    render(<Harness />);
    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });

    expect(await screen.findByText(/No further core units required/i)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Complete the remaining MPU units below/i);
    expect(screen.queryByText(/No semesters could be generated/i)).toBeNull();

    // Case A still leaves the manual editing controls visible and usable.
    expect(screen.getByText(/\+ Add semester/i)).toBeTruthy();
    expect(screen.getByText(/Download PDF/i)).toBeTruthy();
    expect(screen.getByText(/Download Excel/i)).toBeTruthy();
  });

  test('0 unplanned units and 0 remaining MPU units: shows the fully-complete variant', async () => {
    // CORE1 and MPU1 both complete this time, so nothing at all remains.
    function FullySeed() {
      const session = useStudentSession();
      useEffect(() => {
        session.setStudentLoaded(true);
        session.setScrapedStudent({
          studentId: 'S1',
          student: { courseList: [courseRow('CORE1'), courseRow('MPU1')], selectedEnrollment: 'BA-CS' } as never,
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

    mockGenerate({
      semesters: [],
      unschedulableUnits: [{ code: 'WIL1', name: 'WIL Unit', category: 'wil' }],
      warnings: [{ kind: 'short_term_only', unitCode: 'WIL1', offeringTerms: [4] }],
    });

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <FullySeed />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });

    expect(await screen.findByText(/This student has completed all requirements/i)).toBeTruthy();
    expect(screen.queryByText(/Complete the remaining MPU units below/i)).toBeNull();
    expect(screen.queryByText(/No semesters could be generated/i)).toBeNull();
  });

  test('a genuine generation failure (real required-category unit unschedulable) still shows the original failure message', async () => {
    // PE1 (prescribed_elective, a required category) is blocked, not MPU/WIL.
    const failingPlannerUnits = [
      { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
      { category: 'prescribed_elective', year_level: 1, semester: 1, unit: { unit_code: 'PE1', unit_name: 'Blocked Elective', requisite_groups: [] } },
    ];

    function FailingSeed() {
      const session = useStudentSession();
      useEffect(() => {
        session.setStudentLoaded(true);
        session.setScrapedStudent({
          studentId: 'S1',
          student: { courseList: [courseRow('CORE1')], selectedEnrollment: 'BA-CS' } as never,
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
            units: failingPlannerUnits,
          }],
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }

    mockGenerate({
      semesters: [],
      unschedulableUnits: [{ code: 'PE1', name: 'Blocked Elective', category: 'prescribed_elective' }],
      warnings: [{ kind: 'requisite_violation', unitCode: 'PE1', missing: ['SOME_PREREQ'] }],
    });

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <FailingSeed />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });

    expect(await screen.findByText(/No semesters could be generated/i)).toBeTruthy();
    expect(screen.queryByText(/No further core units required/i)).toBeNull();
    expect(screen.queryByText(/This student has completed all requirements/i)).toBeNull();
  });
});
