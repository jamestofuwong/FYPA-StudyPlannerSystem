/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

// Reproduces the COS30015 / TNE10006 scenario: a prescribed_elective the
// scheduler could not place because its only prerequisite is held as a
// Conceded Pass. On a FRESH (unedited) plan this must surface BOTH:
//  - the scheduler's own requisite_violation (why it's blocked), taken
//    straight from customPlan.warnings
//  - validatePlan's compulsory_missing (that it's still required), computed
//    client-side because the unit is absent from every semester
// without duplicating either message.

const CORE1 = {
  code: 'CORE1',
  name: 'Core Unit',
  category: 'core',
  offeringSemesters: [1, 2],
  allOfferingTerms: [1, 2],
  requisiteGroups: [],
};
const COS30015 = {
  code: 'COS30015',
  name: 'Some Capstone Prep Unit',
  category: 'prescribed_elective',
  offeringSemesters: [1, 2],
  allOfferingTerms: [1, 2],
  requisiteGroups: [[{ unitCode: 'TNE10006', requisiteType: 'prerequisite' }]],
};

const generatedPlan = () => ({
  semesters: [{ year: 1, semester: 1 as const, units: [CORE1] }],
  unschedulableUnits: [{ code: 'COS30015', name: COS30015.name, category: 'prescribed_elective' }],
  warnings: [
    { kind: 'requisite_violation', unitCode: 'COS30015', missing: ['TNE10006'], concededPass: ['TNE10006'] },
  ],
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
        units: [
          { category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } },
          {
            category: 'prescribed_elective',
            year_level: 1,
            semester: 2,
            unit: {
              unit_code: 'COS30015',
              unit_name: COS30015.name,
              requisite_groups: [[{ type: 'unit', requisite_type: 'prerequisite', unit: { unit_code: 'TNE10006' } }]],
            },
          },
        ],
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
          units: [CORE1, COS30015],
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

const REQUISITE_MESSAGE = 'COS30015 needs TNE10006, but a Conceded Pass cannot satisfy a prerequisite';
const COMPULSORY_MESSAGE = 'COS30015 is required to graduate but is not in this plan';

describe('fresh-plan warnings surface both the blocking reason and the missing-unit fact', () => {
  test('requisite_violation (naming the blocking unit and the Conceded Pass reason) is rendered', async () => {
    render(<Harness />);
    await generate();

    expect(screen.getByText(`${REQUISITE_MESSAGE}.`)).toBeInTheDocument();
  });

  test('compulsory_missing for the same unit is also rendered on the fresh plan', async () => {
    render(<Harness />);
    await generate();

    expect(screen.getByText(`${COMPULSORY_MESSAGE}.`)).toBeInTheDocument();
  });

  test('neither message is duplicated, and COS30015 never became a generic ELECTIVE placeholder', async () => {
    render(<Harness />);
    await generate();

    expect(screen.getAllByText(`${REQUISITE_MESSAGE}.`)).toHaveLength(1);
    expect(screen.getAllByText(`${COMPULSORY_MESSAGE}.`)).toHaveLength(1);
    expect(screen.queryByText('ELECTIVE', { selector: 'code' })).toBeNull();
  });
});
