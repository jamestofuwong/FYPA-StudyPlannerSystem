/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import jsPDFModule from 'jspdf';
import PathwayPage from '@/app/(pages)/pathway/page';
import DashboardPage from '@/app/(pages)/dashboard/page';
import { StudentSessionProvider } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { buildPlanPayload, type BuildPlanPayloadInput, type PlanPayload } from '@core/shared/planFile';
import { encodePayloadForPdf } from '@core/shared/planFile/pdfPayload';

const jsPDF = (jsPDFModule as any).default || jsPDFModule;

// Full restore round trip through the PDF path: a real PDF built with the
// real jsPDF library and the real encodePayloadForPdf, read back through
// the real import path (content sniffing, extractPayloadFromPdfBytes,
// decodePayloadFromPdf, restoreFromPayload). Only the network boundary is
// mocked: /api/plan-file/read-pdf (jest cannot load pdfjs-dist's ESM build;
// that extraction is proven separately, by a standalone Node script and a
// real Next.js server) and /api/plan-file/resolve plus /api/custom-planner
// (which need a real database), matching how the Excel E2E test mocks the
// same two endpoints.

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
  customWilSlot: 'Semester 2, Year 3',
  customMpuList: [{ code: 'MPU1', name: 'MPU Unit' }],
  startYear: 4,
  startSemester: 1,
};

/** Builds a real PDF the same way handleDirectPdfDownload does: jsPDF + setProperties({keywords: encodePayloadForPdf(payload)}). */
function buildRealPlanPdf(payload: PlanPayload, opts: { withKeywords?: boolean } = { withKeywords: true }): File {
  const doc = new jsPDF();
  doc.text('Bachelor of Computer Science — Study Plan', 10, 10);
  if (opts.withKeywords !== false) {
    doc.setProperties({ keywords: encodePayloadForPdf(payload) });
  }
  const arrayBuffer: ArrayBuffer = doc.output('arraybuffer');
  return new File([arrayBuffer], 'exported_plan.pdf', { type: 'application/pdf' });
}

function mockRestoreFetch(opts: { pdfKeywords?: string | null; resolveSuccess?: boolean; resolveError?: string } = {}) {
  global.fetch = jest.fn((url: string, init?: any) => {
    const u = String(url);
    if (u.includes('/api/plan-file/read-pdf')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, keywords: opts.pdfKeywords ?? null }) });
    }
    if (u.includes('/api/plan-file/resolve')) {
      if (opts.resolveSuccess === false) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false, error: opts.resolveError ?? 'No matching planner.' }) });
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

describe('restoring a plan from an exported PDF', () => {
  test('a full round trip restores the arrangement, positions, flags, extras, minors, WIL slot and MPU list', async () => {
    const payload = buildPlanPayload(richPayloadInput);
    const file = buildRealPlanPdf(payload);
    mockRestoreFetch({ pdfKeywords: encodePayloadForPdf(payload) });

    render(<Harness />);
    await uploadFile(file);

    await screen.findByText('CORE1', { selector: 'code' });
    expect(screen.getByText('RETAKEUNIT', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText('CPUNIT', { selector: 'code' })).toBeTruthy();
    expect(screen.getByText('OUT1', { selector: 'code' })).toBeTruthy();

    const retakeRow = screen.getByText('RETAKEUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(retakeRow.textContent).toContain('RETAKE');
    expect(retakeRow.textContent).not.toContain('RETAKE (CP)');
    const cpRow = screen.getByText('CPUNIT', { selector: 'code' }).closest('tr') as HTMLElement;
    expect(cpRow.textContent).toContain('RETAKE (CP)');

    // Position order preserved within Y1S1: CORE1 before RETAKEUNIT.
    const y1s1Rows = [...document.querySelectorAll('code')].map((n) => n.textContent);
    expect(y1s1Rows.indexOf('CORE1')).toBeLessThan(y1s1Rows.indexOf('RETAKEUNIT'));

    // Snapshot banner names the PDF source, carries the export date, and the skipped-item note for GHOST1.
    expect(document.body.textContent).toMatch(/Restored from a PDF file exported on/i);
    expect(document.body.textContent).toMatch(/1 item skipped/i);
    expect(document.body.textContent).toMatch(/GHOST1/i);
    expect(document.body.textContent).toMatch(/has not been verified against the student's record/i);

    // Remaining MPU list and WIL slot restored.
    expect(screen.getByText('MPU1', { selector: 'code' })).toBeTruthy();

    // Shared import report (same shape the Excel path produces).
    expect(screen.getByText(/Close restored plan/i)).toBeTruthy();
  });

  test('"Close restored plan" returns to the empty state', async () => {
    const payload = buildPlanPayload(richPayloadInput);
    const file = buildRealPlanPdf(payload);
    mockRestoreFetch({ pdfKeywords: encodePayloadForPdf(payload) });

    render(<Harness />);
    await uploadFile(file);
    await screen.findByText('CORE1', { selector: 'code' });

    await act(async () => {
      fireEvent.click(screen.getByText(/Close restored plan/i));
    });
    expect(await screen.findByText(/Import plan \(Excel or PDF\)/i)).toBeTruthy();
  });

  test('after a PDF restore, the dashboard still shows its normal "no student" state', async () => {
    const payload = buildPlanPayload(richPayloadInput);
    const file = buildRealPlanPdf(payload);
    mockRestoreFetch({ pdfKeywords: encodePayloadForPdf(payload) });

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

    const dashboardProbe = document.querySelector('#dashboard-probe') as HTMLElement;
    expect(dashboardProbe.textContent).not.toContain('CORE1');
  });

  test('a PDF with no restore data shows the clear message and leaves the page unchanged', async () => {
    const file = buildRealPlanPdf(buildPlanPayload(richPayloadInput), { withKeywords: false });
    mockRestoreFetch({ pdfKeywords: null });

    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/This PDF has no restore data/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
  });

  test('a wrong-planner PDF is blocked with a clear message, page stays on the empty state', async () => {
    const payload = buildPlanPayload(richPayloadInput);
    const file = buildRealPlanPdf(payload);
    mockRestoreFetch({
      pdfKeywords: encodePayloadForPdf(payload),
      resolveSuccess: false,
      resolveError: 'This file is for Artificial Intelligence, September 2023, which is not in this database.',
    });

    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/not in this database/i);
    expect(screen.queryByText('CORE1', { selector: 'code' })).toBeNull();
    expect(screen.getByText(/Import plan \(Excel or PDF\)/i)).toBeTruthy();
  });

  test('an oversize PDF is rejected before any network call', async () => {
    const huge = new Uint8Array(2 * 1024 * 1024 + 1);
    huge.set(new TextEncoder().encode('%PDF-1.4\n'));
    const file = new File([huge], 'huge.pdf', { type: 'application/pdf' });
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<Harness />);
    await uploadFile(file);

    await screen.findByText(/too large to be a plan export/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a PDF renamed .xlsx is still read as a PDF, by content not extension', async () => {
    const payload = buildPlanPayload(richPayloadInput);
    const realPdf = buildRealPlanPdf(payload);
    const buffer = await realPdf.arrayBuffer();
    const renamed = new File([buffer], 'exported_plan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    mockRestoreFetch({ pdfKeywords: encodePayloadForPdf(payload) });

    render(<Harness />);
    await uploadFile(renamed);

    await screen.findByText('CORE1', { selector: 'code' });
  });

  test('a valid plan .xlsx renamed .pdf is still read as Excel, by content not extension', async () => {
    const XLSX = await import('xlsx-js-style');
    const { payloadToRows, PLAN_DATA_SHEET_NAME, PLAN_DATA_SHEET_NOTE } = await import('@core/shared/planFile');
    const payload = buildPlanPayload(richPayloadInput);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['BACHELOR OF COMPUTER SCIENCE']]), 'Study Plan');
    const planDataWs = XLSX.utils.aoa_to_sheet([[PLAN_DATA_SHEET_NOTE], ...payloadToRows(payload)]);
    XLSX.utils.book_append_sheet(wb, planDataWs, PLAN_DATA_SHEET_NAME);
    const arrayBuffer: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const renamed = new File([arrayBuffer], 'exported_plan.pdf', { type: 'application/pdf' });

    const fetchSpy = jest.fn((url: string) => {
      const u = String(url);
      if (u.includes('/api/plan-file/resolve')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, planner: planner(), minorIds: ['minor-1'], unmatchedMinorNames: [], doubleMajorPlannerId: null, doubleMajorUnmatched: false, outsidePlannerUnits: [schedulableUnit('OUT1', 'Outside Unit', 'elective')], unresolvedOutsidePlannerUnitCodes: [] }) });
      }
      if (u.includes('/api/custom-planner')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { semesters: [], unschedulableUnits: [], warnings: [] }, units: [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('RETAKEUNIT', 'Retake Unit', 'core'), schedulableUnit('CPUNIT', 'Conceded Pass Unit', 'core')], mpuUnits: [], electiveCandidates: [], completedUnits: [], intakeSemester: 2, requirements: [], allMpuUnits: [], availableDoubleMajors: [], availableMinors: [], breakMilestones: [], startYear: 2023, startSemester: 2 }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    render(<Harness />);
    await uploadFile(renamed);

    await screen.findByText('CORE1', { selector: 'code' });
    // Content sniffing routed it to the Excel reader (ZIP signature), never hit /api/plan-file/read-pdf.
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes('/api/plan-file/read-pdf'))).toBe(false);
    expect(document.body.textContent).toMatch(/Restored from an Excel file exported on/i);
  });
});
