/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

// A student who finished every core unit and still owes one MPU unit. After the pathway is generated, the Remaining
// MPU Units section is on the page, and the switch hides it. The plan and the exports are untouched by the switch.

const plannerUnits = [
  { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
  { category: 'mpu', year_level: 1, semester: 1, unit: { unit_code: 'MPU1', unit_name: 'MPU Unit' } },
];

function Seed() {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({
      studentId: 'S1',
      student: {
        courseList: [{ courseId: 'CORE1', courseTitle: 'CORE1', credits: 12.5, creditsEarned: 12.5, status: 'Complete', grade: 'HD', term: '2026_MAR_S1' }],
        selectedEnrollment: 'BA-CS',
      } as never,
    });
    session.setDashboardData({
      completedCodes: [],
      mpuCourseList: [],
      planners: [{ id: 'p1', intake_month: 3, major: { name: 'AI' }, course: { name: 'BA-CS' }, minors: [], units: plannerUnits }],
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
  window.localStorage.clear();
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true, data: { semesters: [], unschedulableUnits: [], warnings: [] },
          units: [], intakeSemester: 1, requirements: [], completedUnits: [],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
});

const generate = async () => {
  render(<Harness />);
  await act(async () => { fireEvent.click(await screen.findByText(/Generate Custom Pathway/i)); });
  await screen.findByText(/No further core units required/i);
};

const mpuSection = () => screen.getByText(/^Remaining MPU Units \(\d+\)$/).closest('[class*="planMpu"]') as HTMLElement;

describe('the MPU switch on Student Pathway', () => {
  test('the MPU section is shown by default', async () => {
    await generate();
    expect(mpuSection().style.display).not.toBe('none');
    expect(document.body.textContent).toMatch(/Complete the remaining MPU units below/i);
  });

  test('turning the switch off hides the MPU section and rewords the message that pointed to it', async () => {
    await generate();
    fireEvent.click(screen.getByRole('switch', { name: /show mpu units/i }));

    expect(mpuSection().style.display).toBe('none');
    expect(document.body.textContent).not.toMatch(/Complete the remaining MPU units below/i);
    expect(document.body.textContent).toMatch(/MPU units are hidden: show them/i);
    expect(screen.getByTestId('mpu-hidden-note').textContent).toMatch(/exports still include them/i);
  });

  test('the plan controls and the exports stay available while MPU units are hidden', async () => {
    await generate();
    fireEvent.click(screen.getByRole('switch', { name: /show mpu units/i }));

    expect(screen.getByText(/Download PDF/i)).toBeTruthy();
    expect(screen.getByText(/Download Excel/i)).toBeTruthy();
    expect(screen.getByText(/\+ Add semester/i)).toBeTruthy();
  });

  test('turning it on again brings the section back', async () => {
    await generate();
    const toggle = screen.getByRole('switch', { name: /show mpu units/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(mpuSection().style.display).not.toBe('none');
  });
});
