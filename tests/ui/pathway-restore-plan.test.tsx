/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx-js-style';
import PathwayPage from '@/app/(pages)/pathway/page';
import DashboardPage from '@/app/(pages)/dashboard/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { buildPlanPayload, payloadToRows, PLAN_DATA_SHEET_NAME, PLAN_DATA_SHEET_NOTE, type BuildPlanPayloadInput, type PlanPayload } from '@core/shared/planFile';

// Full restore round trip: a real .xlsx workbook built with the real
// xlsx-js-style library (not a mock), read back through the real import
// path. Only /api/plan-file/resolve and /api/custom-planner are mocked,
// since those need a real database; everything else (parsing, validation,
// the overlay, and the rendered page) is the real code.

// jsdom's File has no .arrayBuffer() in this environment, unlike a real
// browser/Electron; handleRestoreFile's own use of it is correct for the
// real app, so this polyfills the gap here rather than changing that code.
if (!(File.prototype as any).arrayBuffer) {
  (File.prototype as any).arrayBuffer = function (this: File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(this);
    });
  };
}

const schedulableUnit = (code: string, name: string, category: string) => ({
  code, name, category, offeringSemesters: [1, 2] as (1 | 2)[], requisiteGroups: [],
});

const planner = () => ({
  id: 'planner-1',
  course: { name: 'Bachelor of Computer Science', code: 'BA-CS' },
  major: { name: 'Artificial Intelligence' },
  intake_month: 9,
  intake_year: 2023,
  minors: [{ id: 'minor-1', name: 'Data Science Minor', units: [] }],
  units: [],
  elective_groups: [],
});

const richPayloadInput: BuildPlanPayloadInput = {
  exportDate: new Date('2026-08-01T00:00:00.000Z'),
  planner: { courseCode: 'BA-CS', courseName: 'Bachelor of Computer Science', majorName: 'Artificial Intelligence', intakeYear: 2023, intakeMonth: 9 },
  completedUnitCodes: ['DONE1', 'CPUNIT'],
  concededPassUnitCodes: ['CPUNIT'],
  arrangement: [
    { code: 'CORE1', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
    { code: 'RETAKEUNIT', category: 'core', year: 1, semester: 1, position: 1, recommended: false, outsidePlanner: false, retake: true, concededPassRetake: false },
    { code: 'CPUNIT', category: 'core', year: 1, semester: 2, position: 0, recommended: false, outsidePlanner: false, retake: true, concededPassRetake: true },
    { code: 'OUT1', category: 'elective', year: 2, semester: 1, position: 0, recommended: false, outsidePlanner: true, retake: false, concededPassRetake: false },
    { code: 'GHOST1', category: 'core', year: 2, semester: 1, position: 1, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
  ],
  outsidePlannerUnitCodes: ['OUT1'],
  minorNames: ['Data Science Minor'],
  doubleMajorMajorName: null,
  customWilSlot: null,
  customMpuList: [{ code: 'MPU1', name: 'MPU Unit' }],
  // Slot "year of study" / slot semester, the same kind customPlanStart and
  // the /api/custom-planner response use, not the planner's calendar
  // intakeYear (2023, above): e.g. "Year 4 Semester 1", not a calendar year.
  startYear: 4,
  startSemester: 1,
};

function buildRealPlanFile(payload: PlanPayload, opts: { noPlanDataSheet?: boolean; oversized?: boolean } = {}): File {
  const readableWs = XLSX.utils.aoa_to_sheet([['BACHELOR OF COMPUTER SCIENCE']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, readableWs, 'Study Plan');

  if (!opts.noPlanDataSheet) {
    const planDataRows = opts.oversized
      ? [[PLAN_DATA_SHEET_NOTE], ...payloadToRows(payload), ...Array.from({ length: 200 }, (_, i) => [`junk${i}`, 'x'])]
      : [[PLAN_DATA_SHEET_NOTE], ...payloadToRows(payload)];
    const planDataWs = XLSX.utils.aoa_to_sheet(planDataRows);
    XLSX.utils.book_append_sheet(wb, planDataWs, PLAN_DATA_SHEET_NAME);
  }

  const arrayBuffer: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([arrayBuffer], 'exported_plan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function mockRestoreFetch(overrides: { resolveSuccess?: boolean; resolveError?: string } = {}) {
  global.fetch = jest.fn((url: string, init?: any) => {
    const u = String(url);
    if (u.includes('/api/plan-file/resolve')) {
      if (overrides.resolveSuccess === false) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false, error: overrides.resolveError ?? 'No matching planner.' }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          planner: planner(),
          minorIds: ['minor-1'],
          unmatchedMinorNames: [],
          doubleMajorPlannerId: null,
          doubleMajorUnmatched: false,
          outsidePlannerUnits: [schedulableUnit('OUT1', 'Outside Unit', 'elective')],
          unresolvedOutsidePlannerUnitCodes: [],
        }),
      });
    }
    if (u.includes('/api/custom-planner')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { semesters: [], unschedulableUnits: [], warnings: [] },
          units: [
            schedulableUnit('CORE1', 'Core Unit', 'core'),
            schedulableUnit('RETAKEUNIT', 'Retake Unit', 'core'),
            schedulableUnit('CPUNIT', 'Conceded Pass Unit', 'core'),
          ],
          mpuUnits: [],
          electiveCandidates: [],
          completedUnits: [],
          intakeSemester: 2,
          requirements: [],
          allMpuUnits: [],
          availableDoubleMajors: [],
          availableMinors: [],
          breakMilestones: [],
          startYear: 2023,
          startSemester: 2,
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

const Harness = () => (
  <ToastProvider>
    <StudentSessionProvider>
      <PathwayPage />
    </StudentSessionProvider>
  </ToastProvider>
);

async function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe('restoring a plan from an exported Excel file', () => {
  test('the empty state (no student loaded) shows "Import plan (Excel or PDF)"', async () => {
    render(<Harness />);
    expect(await screen.findByText(/Import plan \(Excel or PDF\)/i)).toBeTruthy();
  });

  test('the hint under the import control is a short neutral line, with no mention of the Plan Data sheet, document properties, or ignored edits', async () => {
    render(<Harness />);
    expect(await screen.findByText(/or restore a previously exported plan/i)).toBeTruthy();
    expect(screen.queryByText(/Plan Data/i)).toBeNull();
    expect(screen.queryByText(/document properties/i)).toBeNull();
    expect(screen.queryByText(/ignored/i)).toBeNull();
    // the label itself is unchanged
    expect(screen.getByText(/Import plan \(Excel or PDF\)/i)).toBeTruthy();
  });

  test('a full round trip restores the arrangement, positions, flags, extras, minors, MPU list and the snapshot banner', async () => {
    mockRestoreFetch();
    const payload = buildPlanPayload(richPayloadInput);
    const file = buildRealPlanFile(payload);

    render(<Harness />);
    await uploadFile(file);

    await screen.findByText('CORE1', { selector: 'code' });
    expect(screen.getByText('RETAKEUNIT', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText('CPUNIT', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText('OUT1', { selector: 'code' })).toBeTruthy();

    // RETAKE on RETAKEUNIT, RETAKE (CP) on CPUNIT specifically.
    const retakeRow = screen.getByText('RETAKEUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(retakeRow.textContent).toContain('RETAKE');
    expect(retakeRow.textContent).not.toContain('RETAKE (CP)');
    const cpRow = screen.getByText('CPUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(cpRow.textContent).toContain('RETAKE (CP)');

    // Position order preserved within Y1S1: CORE1 before RETAKEUNIT.
    const y1s1Rows = [...document.querySelectorAll('code')].map((n) => n.textContent);
    expect(y1s1Rows.indexOf('CORE1')).toBeLessThan(y1s1Rows.indexOf('RETAKEUNIT'));

    // Snapshot banner with the export date, and the skipped-item note for GHOST1.
    expect(document.body.textContent).toMatch(/Restored from (a PDF|an Excel) file exported on/i);
    expect(document.body.textContent).toMatch(/1 item skipped/i);
    expect(document.body.textContent).toMatch(/GHOST1/i);
    // The banner also warns the file is unverified against the student's own record.
    expect(document.body.textContent).toMatch(/has not been verified against the student's record/i);
    expect(document.body.textContent).toMatch(/confirm it before relying on it/i);

    // Remaining MPU list restored.
    expect(screen.getByText('MPU1', { selector: 'code' })).toBeTruthy();
  });

  test('"Close restored plan" returns to the empty state', async () => {
    mockRestoreFetch();
    const file = buildRealPlanFile(buildPlanPayload(richPayloadInput));
    render(<Harness />);
    await uploadFile(file);
    await screen.findByText('CORE1', { selector: 'code' });

    await act(async () => {
      fireEvent.click(screen.getByText(/Close restored plan/i));
    });
    expect(await screen.findByText(/Import plan \(Excel or PDF\)/i)).toBeTruthy();
  });

  test('after a restore, the dashboard still shows its normal "no student" state', async () => {
    mockRestoreFetch();
    const file = buildRealPlanFile(buildPlanPayload(richPayloadInput));

    const SharedHarness = () => (
      <ToastProvider>
        <StudentSessionProvider>
          <PathwayPage />
          <div id="dashboard-probe"><DashboardPage /></div>
        </StudentSessionProvider>
      </ToastProvider>
    );

    render(<SharedHarness />);
    await uploadFile(file);
    await screen.findByText('CORE1', { selector: 'code' });

    // The dashboard's own student-search input is still empty/unloaded.
    const dashboardProbe = document.querySelector('#dashboard-probe') as HTMLElement;
    expect(dashboardProbe.textContent).not.toContain('CORE1');
  });

  test('a wrong-planner file is blocked with a clear message, page stays on the empty state', async () => {
    mockRestoreFetch({ resolveSuccess: false, resolveError: 'This file is for Artificial Intelligence, September 2023, which is not in this database.' });
    const file = buildRealPlanFile(buildPlanPayload(richPayloadInput));
    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/not in this database/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
    expect(screen.getByText(/Import plan \(Excel or PDF\)/i)).toBeTruthy();
  });

  test('an oversized Plan Data sheet is rejected before parsing', async () => {
    mockRestoreFetch();
    const file = buildRealPlanFile(buildPlanPayload(richPayloadInput), { oversized: true });
    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/larger than a plan export should ever be/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
  });

  test('a file that is neither a PDF nor a ZIP (.xlsx) is rejected outright, by content not extension', async () => {
    mockRestoreFetch();
    render(<Harness />);
    const file = new File(['not a spreadsheet'], 'notes.txt', { type: 'text/plain' });
    await uploadFile(file);

    await screen.findByText(/not a supported plan export/i);
  });

  test('a file missing the Plan Data sheet is blocked, no plan-only fallback', async () => {
    mockRestoreFetch();
    const file = buildRealPlanFile(buildPlanPayload(richPayloadInput), { noPlanDataSheet: true });
    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/has no "Plan Data" sheet/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
  });

  test('a compulsory unit removed before export still surfaces compulsory_missing, proving completed units are not inferred', async () => {
    global.fetch = jest.fn((url: string) => {
      const u = String(url);
      if (u.includes('/api/plan-file/resolve')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true, planner: planner(), minorIds: [], unmatchedMinorNames: [],
            doubleMajorPlannerId: null, doubleMajorUnmatched: false, outsidePlannerUnits: [], unresolvedOutsidePlannerUnitCodes: [],
          }),
        });
      }
      if (u.includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { semesters: [], unschedulableUnits: [], warnings: [] },
            // MISSING_CORE is a required core unit the planner still names,
            // but it never appears in the arrangement below (the advisor
            // removed it before exporting) and is NOT in completedUnitCodes.
            units: [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('MISSING_CORE', 'Missing Core Unit', 'core')],
            mpuUnits: [], electiveCandidates: [], completedUnits: [],
            intakeSemester: 2,
            requirements: [{ category: 'core', creditPoints: 25, unitCount: 2, planCategories: ['core'] }],
            allMpuUnits: [], availableDoubleMajors: [], availableMinors: [], breakMilestones: [],
            startYear: 2023, startSemester: 2,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    const minimalPayload = buildPlanPayload({
      ...richPayloadInput,
      completedUnitCodes: [],
      concededPassUnitCodes: [],
      arrangement: [
        { code: 'CORE1', category: 'core', year: 1, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
      ],
      outsidePlannerUnitCodes: [],
      minorNames: [],
      customMpuList: [],
    });
    const file = buildRealPlanFile(minimalPayload);
    render(<Harness />);
    await uploadFile(file);

    await screen.findByText('CORE1', { selector: 'code' });
    expect(document.body.textContent).toMatch(/MISSING_CORE.*required to graduate but.*not in this plan/i);
  });

  test('a Plan Data sheet with a huge declared range but few actual cells is rejected before sheet_to_json ever runs', async () => {
    mockRestoreFetch();
    const payload = buildPlanPayload(richPayloadInput);
    const planDataWs = XLSX.utils.aoa_to_sheet([[PLAN_DATA_SHEET_NOTE], ...payloadToRows(payload)]);
    // A real worksheet whose own !ref claims 100,000 rows while only ~15 are
    // actually populated. XLSX.write/read preserve this attribute verbatim,
    // so this is a faithful simulation of a hand-crafted hostile file, not
    // a test artefact.
    (planDataWs as any)['!ref'] = 'A1:B100000';
    const readableWs = XLSX.utils.aoa_to_sheet([['BACHELOR OF COMPUTER SCIENCE']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, readableWs, 'Study Plan');
    XLSX.utils.book_append_sheet(wb, planDataWs, PLAN_DATA_SHEET_NAME);
    const arrayBuffer: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([arrayBuffer], 'hostile.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/larger than a plan export should ever be/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
  });

  test('the readable "Study Plan" sheet is never parsed for data, even when it contains a full payload by mistake', async () => {
    mockRestoreFetch();
    const payload = buildPlanPayload(richPayloadInput);
    // The valid payload sits in the READABLE sheet instead of "Plan Data".
    // If handleRestoreFile ever fell back to parsing the readable sheet,
    // this file would restore successfully. It must not: only the sheet
    // named PLAN_DATA_SHEET_NAME is ever read, so this must still block.
    const misplacedWs = XLSX.utils.aoa_to_sheet([[PLAN_DATA_SHEET_NOTE], ...payloadToRows(payload)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, misplacedWs, 'Study Plan');
    const arrayBuffer: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([arrayBuffer], 'misplaced.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/has no "Plan Data" sheet/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
  });

  // "Regenerate" on a restored session: the payload carries no terms (codes
  // only), so the synthetic courseList built on restore has every row's
  // term blank. generateCustomPlan sends restoredSession's own saved
  // startYear/startSemester explicitly, only when restoredSession is
  // present, so the server's resolveNextStudyTerm (which would otherwise
  // count zero distinct terms and fall back to Year 1 Semester 1) keeps the
  // original's start position instead.
  test('"Regenerate" after a restore keeps the saved start position, not Year 1 Semester 1', async () => {
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    try {
      mockRestoreFetch();
      const payload = buildPlanPayload(richPayloadInput); // startYear: 4, startSemester: 1 (slot kind)
      const file = buildRealPlanFile(payload);

      render(<Harness />);
      await uploadFile(file);
      await screen.findByText('CORE1', { selector: 'code' });

      const fetchMock = global.fetch as jest.Mock;
      const firstGenerateCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/custom-planner'));
      const firstGenerateBody = JSON.parse(firstGenerateCall![1].body);
      // The restore's own generate call sends the original position explicitly.
      expect(firstGenerateBody.startYear).toBe(4);
      expect(firstGenerateBody.startSemester).toBe(1);
      // Every synthetic transcript row still has a blank term, by construction.
      expect(firstGenerateBody.courseList.every((row: any) => row.term === '')).toBe(true);

      fetchMock.mockClear();
      await act(async () => {
        fireEvent.click(await screen.findByText(/Regenerate Pathway/i));
      });

      const regenerateCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/custom-planner'));
      const regenerateBody = JSON.parse(regenerateCall![1].body);
      // Regenerate now sends the SAME saved start position as the restore's
      // own first call, not Year 1 Semester 1.
      expect(regenerateBody.startYear).toBe(4);
      expect(regenerateBody.startSemester).toBe(1);
    } finally {
      window.confirm = originalConfirm;
    }
  });
});

describe('Regenerate keeps the same first-semester slot and calendar-term label as the restore, for both intakes', () => {
  // calendarTermFor(slotSemester, intakeSemester) flips for a September
  // intake (intakeSemester 2) and passes through for a February intake
  // (intakeSemester 1), per customPlannerScheduler.ts. monthsOf(1) =
  // "Feb/Mar", monthsOf(2) = "Aug/Sep".
  test.each([
    { label: 'September intake', intakeMonth: 9, intakeSemester: 2 as const, expectedMonths: 'Aug/Sep' },
    { label: 'February intake', intakeMonth: 2, intakeSemester: 1 as const, expectedMonths: 'Feb/Mar' },
  ])('$label: restored and regenerated plans both show YEAR 4 SEM 1 $expectedMonths', async ({ intakeMonth, intakeSemester, expectedMonths }) => {
    const originalConfirm = window.confirm;
    window.confirm = jest.fn(() => true);
    try {
      const fixturePlanner = () => ({ ...planner(), intake_month: intakeMonth });

      global.fetch = jest.fn((url: string, init?: any) => {
        const u = String(url);
        if (u.includes('/api/plan-file/resolve')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true, planner: fixturePlanner(), minorIds: [], unmatchedMinorNames: [],
              doubleMajorPlannerId: null, doubleMajorUnmatched: false, outsidePlannerUnits: [], unresolvedOutsidePlannerUnitCodes: [],
            }),
          });
        }
        if (u.includes('/api/custom-planner')) {
          // Echoes the request's own startYear/startSemester into the first
          // semester bucket, simulating a real scheduler starting exactly
          // where it was told to. If generateCustomPlan stopped sending the
          // saved position, this mock would fall back to undefined/undefined
          // and the two headings below would stop matching.
          const body = JSON.parse(init.body);
          const startYear = body.startYear ?? 1;
          const startSemester = body.startSemester ?? 1;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: { semesters: [{ year: startYear, semester: startSemester, units: [schedulableUnit('CORE1', 'Core Unit', 'core')] }], unschedulableUnits: [], warnings: [] },
              units: [schedulableUnit('CORE1', 'Core Unit', 'core')],
              mpuUnits: [], electiveCandidates: [], completedUnits: [],
              intakeSemester,
              requirements: [], allMpuUnits: [], availableDoubleMajors: [], availableMinors: [], breakMilestones: [],
              startYear, startSemester,
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }) as unknown as typeof fetch;

      const payload = buildPlanPayload({
        ...richPayloadInput,
        planner: { ...richPayloadInput.planner, intakeMonth },
        arrangement: [
          { code: 'CORE1', category: 'core', year: 4, semester: 1, position: 0, recommended: false, outsidePlanner: false, retake: false, concededPassRetake: false },
        ],
        outsidePlannerUnitCodes: [],
        minorNames: [],
        customMpuList: [],
        startYear: 4,
        startSemester: 1,
      });
      const file = buildRealPlanFile(payload);

      render(<Harness />);
      await uploadFile(file);

      const expectedHeading = new RegExp(`YEAR 4.*SEM 1.*${expectedMonths.replace('/', '\\/')}`);
      await waitFor(() => expect(document.body.textContent).toMatch(expectedHeading));

      await act(async () => {
        fireEvent.click(await screen.findByText(/Regenerate Pathway/i));
      });

      await waitFor(() => expect(document.body.textContent).toMatch(expectedHeading));
    } finally {
      window.confirm = originalConfirm;
    }
  });
});

describe('a normal (non-restored) session is unaffected by the restoredSession start-position fix', () => {
  function NormalSeed() {
    const session = useStudentSession();
    useEffect(() => {
      session.setStudentLoaded(true);
      session.setScrapedStudent({ studentId: 'S1', student: { courseList: [], selectedEnrollment: '' } as any });
      session.setDashboardData({
        completedCodes: [], mpuCourseList: [],
        planners: [{ ...planner(), units: [{ category: 'core', year_level: 1, semester: 1, unit: { unit_code: 'CORE1', unit_name: 'Core Unit', requisite_groups: [] } }] }],
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  const NormalHarness = () => (
    <ToastProvider>
      <StudentSessionProvider>
        <NormalSeed />
        <PathwayPage />
      </StudentSessionProvider>
    </ToastProvider>
  );

  test('the generate request body is exactly the same shape as before this fix: no startYear/startSemester keys at all', async () => {
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes('/api/custom-planner')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { semesters: [{ year: 1, semester: 1, units: [schedulableUnit('CORE1', 'Core Unit', 'core')] }], unschedulableUnits: [], warnings: [] },
            units: [schedulableUnit('CORE1', 'Core Unit', 'core')],
            intakeSemester: 1, requirements: [], completedUnits: [],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    render(<NormalHarness />);
    await act(async () => {
      fireEvent.click(await screen.findByText(/Generate Custom Pathway/i));
    });
    await screen.findByText('CORE1', { selector: 'code' });

    const fetchMock = global.fetch as jest.Mock;
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/custom-planner'));
    const body = JSON.parse(call![1].body);

    // The exact same key set this request has always had: restoredSession
    // is null for a normal session, so the conditional spread adds nothing.
    expect(Object.keys(body).sort()).toEqual([
      'completedUnitCodes', 'concededPassUnitCodes', 'courseList',
      'injectedMinorIds', 'plannerId', 'selectedDoubleMajorId',
    ].sort());
    expect(body).not.toHaveProperty('startYear');
    expect(body).not.toHaveProperty('startSemester');
  });
});
