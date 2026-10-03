/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx-js-style';
import PathwayPage from '@/app/(pages)/pathway/page';
import DashboardPage from '@/app/(pages)/dashboard/page';
import { StudentSessionProvider } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { buildPlanPayload, payloadToRows, PLAN_DATA_SHEET_NAME, PLAN_DATA_SHEET_NOTE, type BuildPlanPayloadInput, type PlanPayload } from '@core/shared/planFile';

// Full restore round trip: a real .xlsx workbook built with the real
// xlsx-js-style library (not a mock), read back through the real import
// path. Only /api/plan-file/resolve and /api/custom-planner are mocked,
// since those need a real database; everything else — parsing, validation,
// the overlay, and the rendered page — is the real code.

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
  startYear: 2023,
  startSemester: 2,
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
  test('the empty state (no student loaded) shows "Import plan from Excel"', async () => {
    render(<Harness />);
    expect(await screen.findByText(/Import plan from Excel/i)).toBeTruthy();
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
    expect(document.body.textContent).toMatch(/Restored from a file exported on/i);
    expect(document.body.textContent).toMatch(/1 item skipped/i);
    expect(document.body.textContent).toMatch(/GHOST1/i);

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
    expect(await screen.findByText(/Import plan from Excel/i)).toBeTruthy();
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
    expect(screen.getByText(/Import plan from Excel/i)).toBeTruthy();
  });

  test('an oversized Plan Data sheet is rejected before parsing', async () => {
    mockRestoreFetch();
    const file = buildRealPlanFile(buildPlanPayload(richPayloadInput), { oversized: true });
    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/larger than a plan export should ever be/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
  });

  test('a non-.xlsx file is rejected outright', async () => {
    mockRestoreFetch();
    render(<Harness />);
    const file = new File(['not a spreadsheet'], 'notes.txt', { type: 'text/plain' });
    await uploadFile(file);

    await screen.findByText(/Please choose a \.xlsx file/i);
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
});
