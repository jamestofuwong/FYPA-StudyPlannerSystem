/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as XLSX from 'xlsx-js-style';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { PLAN_DATA_SHEET_NAME } from '@core/shared/planFile';

// An end-to-end round trip: seeds real session state, clicks the real
// "Download Excel" button, captures the real workbook, then feeds that
// exact workbook into a fresh render's real import path. Only writeFile is
// replaced, to capture its argument instead of triggering a real download
// inside jsdom; every other function is the real, unmocked implementation.
// jest.mock (not jest.spyOn on the static import) is used because page.tsx's
// dynamic `await import(...)` and this file's static `import * as XLSX` are
// not guaranteed to share one mutable object under ts-jest's ESM/CJS
// interop; jest.mock intercepts both.
jest.mock('xlsx-js-style', () => {
  const real = jest.requireActual('xlsx-js-style');
  return { ...real, writeFile: jest.fn() };
});

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

const schedulableUnit = (code: string, name: string, category: string, extra: Record<string, unknown> = {}) => ({
  code, name, category, offeringSemesters: [1, 2] as (1 | 2)[], requisiteGroups: [], ...extra,
});

const plannerRow = () => ({
  id: 'planner-1',
  course: { name: 'Bachelor of Computer Science', code: 'BA-CS' },
  major: { name: 'Artificial Intelligence' },
  intake_month: 9,
  intake_year: 2023,
  minors: [{ id: 'minor-1', name: 'Data Science Minor', units: [] }],
  units: [],
  elective_groups: [],
});

/**
 * Seeds exactly the session state handleExcelDownload reads, by calling the
 * real setters directly, in TWO stages: StudentSessionProvider's own
 * "switching planner discards the plan" effect fires whenever
 * dashboardData changes and resets customPlan and everything built on it,
 * so stage 2 (the rich plan state) must land in a render AFTER stage 1
 * (dashboardData) has already settled, never the same tick.
 */
function RichSeedStage1() {
  const session = useStudentSession();
  useEffect(() => {
    session.setStudentLoaded(true);
    session.setScrapedStudent({ studentId: 'S1', student: { courseList: [], selectedEnrollment: '' } as any });
    session.setDashboardData({ completedCodes: [], mpuCourseList: [], planners: [plannerRow()] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function RichSeedStage2() {
  const session = useStudentSession();
  useEffect(() => {
    session.setCustomPlan({
      semesters: [
        { year: 1, semester: 1, units: [
          { code: 'CORE1', name: 'Core Unit', category: 'core' },
          { code: 'RETAKEUNIT', name: 'Retake Unit', category: 'core' },
        ] },
        { year: 1, semester: 2, units: [
          { code: 'CPUNIT', name: 'Conceded Pass Unit', category: 'core' },
          { code: 'REC1', name: 'Recommended Unit', category: 'elective', recommended: true },
        ] },
        { year: 2, semester: 1, units: [
          { code: 'OUT1', name: 'Outside Unit', category: 'elective', outsidePlanner: true },
        ] },
      ],
      unschedulableUnits: [],
      warnings: [],
    });
    session.setPlanExtraUnits([schedulableUnit('OUT1', 'Outside Unit', 'elective')]);
    session.setInjectedMinors(new Set(['minor-1']));
    session.setAvailableMinors([{ minorId: 'minor-1', minorName: 'Data Science Minor', units: [] }]);
    session.setSelectedDoubleMajorId('sibling-planner-1');
    session.setAvailableDoubleMajors([{ plannerId: 'sibling-planner-1', majorName: 'Software Development', units: [] }]);
    session.setCustomWilSlot('2-1');
    session.setCustomMpuList([{ code: 'MPU1', name: 'MPU Unit' }]);
    session.setRetakeUnitCodes(new Set(['RETAKEUNIT', 'CPUNIT']));
    session.setConcededPassRetakeWarnings([{ kind: 'conceded_pass_retake', unitCode: 'CPUNIT', blockedUnitCodes: [] }]);
    session.setPlanIntakeSemester(2);
    session.setCustomPlanStart({ year: 1, semester: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function RichSeed({ stage2 }: { stage2: boolean }) {
  return (
    <>
      <RichSeedStage1 />
      {stage2 && <RichSeedStage2 />}
    </>
  );
}

const ExportHarness = ({ stage2 }: { stage2: boolean }) => (
  <ToastProvider>
    <StudentSessionProvider>
      <RichSeed stage2={stage2} />
      <PathwayPage />
    </StudentSessionProvider>
  </ToastProvider>
);

const ImportHarness = () => (
  <ToastProvider>
    <StudentSessionProvider>
      <PathwayPage />
    </StudentSessionProvider>
  </ToastProvider>
);

function mockImportFetch() {
  global.fetch = jest.fn((url: string) => {
    const u = String(url);
    if (u.includes('/api/plan-file/resolve')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          planner: plannerRow(),
          minorIds: ['minor-1'],
          unmatchedMinorNames: [],
          doubleMajorPlannerId: 'sibling-planner-1',
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
          electiveCandidates: [schedulableUnit('REC1', 'Recommended Unit', 'elective')],
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

async function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

async function renderExportHarness() {
  const { rerender } = render(<ExportHarness stage2={false} />);
  // Let the provider's planner-switch effect (dashboardData just changed)
  // settle on its own render pass before the rich plan state lands.
  await act(async () => {});
  rerender(<ExportHarness stage2={true} />);
}

describe('Part 4: true end-to-end export -> import round trip', () => {
  test('a workbook captured from the real handleExcelDownload restores correctly through the real import', async () => {
    await renderExportHarness();

    const writeFileMock = XLSX.writeFile as jest.Mock;
    writeFileMock.mockClear();
    const excelButton = await screen.findByText(/Download Excel/i);
    await act(async () => {
      fireEvent.click(excelButton);
    });
    await screen.findByText(/Please choose your save location/i);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [capturedWb] = writeFileMock.mock.calls[0];
    expect(capturedWb.SheetNames).toEqual(['Study Plan', PLAN_DATA_SHEET_NAME]);

    // Re-serialise the exact captured workbook into a real file, as if the
    // advisor saved it and is now uploading it on a cleared session.
    const arrayBuffer: ArrayBuffer = XLSX.write(capturedWb, { type: 'array', bookType: 'xlsx' });
    const file = new File([arrayBuffer], 'exported_plan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    mockImportFetch();
    render(<ImportHarness />);
    await uploadFile(file);

    await screen.findByText('CORE1', { selector: 'code' });

    // Arrangement, including position order, survives: CORE1 before RETAKEUNIT in Y1S1.
    const allCodes = [...document.querySelectorAll('code')].map((n) => n.textContent);
    expect(allCodes.indexOf('CORE1')).toBeLessThan(allCodes.indexOf('RETAKEUNIT'));

    // Retake and Conceded-Pass-retake flags survive on the correct units.
    const retakeRow = screen.getByText('RETAKEUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(retakeRow.textContent).toContain('RETAKE');
    expect(retakeRow.textContent).not.toContain('RETAKE (CP)');
    const cpRow = screen.getByText('CPUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(cpRow.textContent).toContain('RETAKE (CP)');

    // Outside-planner and recommended units survive with their flags intact
    // (outsidePlanner renders its own "outside the planner" tag, recommended
    // its own "Not named by the planner" tag, confirming the flag round-tripped, not just the unit code).
    expect(screen.getByText('OUT1', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText('REC1', { selector: 'code' })).toBeTruthy();

    // WIL slot and MPU list survive.
    expect(screen.getByText('MPU1', { selector: 'code' })).toBeTruthy();

    // Minor name and double-major name resolved correctly: the resolve
    // call received NAMES (never the minor/sibling-planner UUIDs the page
    // holds internally), and the regenerate call received the resolved ids.
    const fetchMock = global.fetch as jest.Mock;
    const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/plan-file/resolve'));
    const resolveBody = JSON.parse(resolveCall![1].body);
    expect(resolveBody.minorNames).toEqual(['Data Science Minor']);
    expect(resolveBody.doubleMajorMajorName).toBe('Software Development');

    const generateCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/custom-planner'));
    const generateBody = JSON.parse(generateCall![1].body);
    expect(generateBody.injectedMinorIds).toEqual(['minor-1']);
    expect(generateBody.selectedDoubleMajorId).toBe('sibling-planner-1');
    expect(generateBody.startYear).toBe(1);
    expect(generateBody.startSemester).toBe(1);
  });

  test('MUTATION CHECK: if export emitted minor ids instead of names, the resolve call would carry the id, and this test would fail', async () => {
    await renderExportHarness();
    const writeFileMock = XLSX.writeFile as jest.Mock;
    writeFileMock.mockClear();
    await act(async () => {
      fireEvent.click(await screen.findByText(/Download Excel/i));
    });
    await screen.findByText(/Please choose your save location/i);
    const [capturedWb] = writeFileMock.mock.calls[0];

    const planDataWs = capturedWb.Sheets[PLAN_DATA_SHEET_NAME];
    const planDataRows: string[][] = XLSX.utils.sheet_to_json(planDataWs, { header: 1, raw: false });
    const minorNamesRow = planDataRows.find((row) => row[0] === 'minorNames');
    // This is what the real export actually wrote: a real minor NAME, never
    // the 'minor-1' id the page holds in injectedMinors/availableMinors.
    expect(minorNamesRow![1]).toBe(JSON.stringify(['Data Science Minor']));
    expect(minorNamesRow![1]).not.toContain('minor-1');
  });
});
