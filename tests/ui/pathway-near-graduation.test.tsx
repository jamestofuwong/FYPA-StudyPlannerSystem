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

describe('near-graduation student: only MPU/WIL units remain unplanned', () => {
  test('the Extended Study Plan summary box and Generate button are visible before generating, not a blank page', async () => {
    render(<Harness />);

    expect(await screen.findByText(/Extended Study Plan/i)).toBeTruthy();
    expect(document.body.textContent).toMatch(/0\s*unplanned unit/i);
    expect(screen.getByText(/Generate Custom Pathway/i)).toBeTruthy();
  });

  test('a generated plan with zero semesters still renders Add semester and the Download buttons, not a blank page', async () => {
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              semesters: [],
              unschedulableUnits: [{ code: 'WIL1', name: 'WIL Unit', category: 'wil' }],
              warnings: [{ kind: 'short_term_only', unitCode: 'WIL1', offeringTerms: [4] }],
            },
            units: [],
            mpuUnits: [{ code: 'MPU1', name: 'MPU Unit', category: 'mpu', offeringSemesters: [1, 2], allOfferingTerms: [1, 2], requisiteGroups: [] }],
            intakeSemester: 1,
            requirements: [],
            completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    render(<Harness />);
    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });

    expect(await screen.findByText(/No semesters could be generated/i)).toBeTruthy();
    expect(screen.getByText(/\+ Add semester/i)).toBeTruthy();
    expect(screen.getByText(/Download PDF/i)).toBeTruthy();
    expect(screen.getByText(/Download Excel/i)).toBeTruthy();
  });
});
