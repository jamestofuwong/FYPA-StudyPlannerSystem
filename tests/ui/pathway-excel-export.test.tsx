/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

// The Excel export writes a real file via xlsx-js-style, which jsdom can't
// meaningfully do (no real download). Mocked out so these tests check only
// the wiring: the same pre-flight elective check as the PDF export, and
// that a clean plan actually reaches the library.
const aoaToSheet = jest.fn(() => ({}));
const encodeCell = jest.fn(() => 'A1');
const bookNew = jest.fn(() => ({}));
const bookAppendSheet = jest.fn();
const writeFile = jest.fn();

jest.mock('xlsx-js-style', () => ({
  utils: {
    aoa_to_sheet: (...args: any[]) => aoaToSheet(...args),
    encode_cell: (...args: any[]) => encodeCell(...args),
    book_new: (...args: any[]) => bookNew(...args),
    book_append_sheet: (...args: any[]) => bookAppendSheet(...args),
  },
  writeFile: (...args: any[]) => writeFile(...args),
}));

const schedulableUnit = (code: string, name: string, category: string) => ({
  code, name, category, offeringSemesters: [1, 2], allOfferingTerms: [1, 2], requisiteGroups: [],
});

function Seed({ semUnits }: { semUnits: any[] }) {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({ studentId: 'S1', student: { courseList: [], selectedEnrollment: 'BA-CS' } as never });
    session.setDashboardData({
      completedCodes: [], mpuCourseList: [],
      planners: [{
        id: 'p1', intake_month: 3, major: { name: 'AI' }, course: { name: 'BA-CS' }, minors: [],
        units: semUnits.map((u) => ({ category: u.category, year_level: 1, semester: 1, unit: { unit_code: u.code, unit_name: u.name, requisite_groups: [] } })),
      }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function mockFetch(units: any[]) {
  global.fetch = jest.fn((url: string) => {
    if (String(url).includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { semesters: [{ year: 1, semester: 1, units }], unschedulableUnits: [], warnings: [] },
          units,
          intakeSemester: 1,
          requirements: [],
          completedUnits: [],
        }),
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

beforeEach(() => {
  aoaToSheet.mockClear();
  encodeCell.mockClear();
  bookNew.mockClear();
  bookAppendSheet.mockClear();
  writeFile.mockClear();
});

describe('Excel export wiring', () => {
  test('blocks the export with the same pre-flight message pattern as PDF when an ELECTIVE slot is unselected', async () => {
    const units = [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('ELECTIVE', 'Elective Slot', 'elective')];
    mockFetch(units);

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed semUnits={units} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('CORE1');

    const excelButton = await screen.findByText(/Download Excel/i);
    await act(async () => { fireEvent.click(excelButton); });

    await screen.findByText(/Please select a unit for all elective slots \(1 remaining\) before downloading the Excel file\./i);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('a clean plan (no unselected electives) reaches the library and writes a file', async () => {
    const units = [schedulableUnit('CORE1', 'Core Unit', 'core')];
    mockFetch(units);

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed semUnits={units} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('CORE1');

    const excelButton = await screen.findByText(/Download Excel/i);
    await act(async () => { fireEvent.click(excelButton); });

    await screen.findByText(/Please choose your save location/i);
    // Two sheets now: the readable "Study Plan" table, and the machine-readable
    // "Plan Data" sheet used to restore the plan later.
    expect(bookAppendSheet).toHaveBeenCalledTimes(2);
    const sheetNames = bookAppendSheet.mock.calls.map((call) => call[2]);
    expect(sheetNames).toEqual(['Study Plan', 'Plan Data']);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [, fileName] = writeFile.mock.calls[0];
    expect(fileName).toBe('BA_CS_Study_Plan.xlsx');
  });

  test('a realistic worst-case plan (100 units, well within the scheduler\'s own config caps) still succeeds', async () => {
    const units = Array.from({ length: 100 }, (_, i) => schedulableUnit(`UNIT${String(i).padStart(4, '0')}`, `Unit ${i}`, 'core'));
    mockFetch(units);

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed semUnits={units} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('UNIT0000');

    const excelButton = await screen.findByText(/Download Excel/i);
    await act(async () => { fireEvent.click(excelButton); });

    await screen.findByText(/Please choose your save location/i);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  test('a plan large enough that its arrangement cell would exceed Excel\'s own cell limit is blocked, writing nothing', async () => {
    // Empirically, xlsx-js-style's real XLSX.write throws past 32,767
    // characters per cell; 400+ units in the arrangement reliably exceeds
    // that (see tests/unit/planFile/planFile.test.ts's own measurement).
    const units = Array.from({ length: 450 }, (_, i) => schedulableUnit(`UNIT${String(i).padStart(4, '0')}`, `Unit ${i}`, 'core'));
    mockFetch(units);

    render(
      <ToastProvider>
        <StudentSessionProvider>
          <Seed semUnits={units} />
          <PathwayPage />
        </StudentSessionProvider>
      </ToastProvider>
    );
    await generate('UNIT0000');

    const excelButton = await screen.findByText(/Download Excel/i);
    await act(async () => { fireEvent.click(excelButton); });

    await screen.findByText(/too large to save a restorable Excel file/i);
    expect(writeFile).not.toHaveBeenCalled();
    expect(bookAppendSheet).not.toHaveBeenCalled();
  });
});
