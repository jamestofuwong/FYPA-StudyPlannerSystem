/** @jest-environment jsdom */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as XLSX from 'xlsx-js-style';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { decodePayloadFromPdf, PDF_PAYLOAD_PREFIX, PDF_PAYLOAD_LIMITS } from '@core/shared/planFile/pdfPayload';
import { rowsToPayload, PLAN_DATA_SHEET_NAME } from '@core/shared/planFile';

// Real xlsx-js-style, only writeFile replaced, to capture the workbook
// instead of triggering a real browser download inside jsdom.
jest.mock('xlsx-js-style', () => {
  const real = jest.requireActual('xlsx-js-style');
  return { ...real, writeFile: jest.fn() };
});

// jsPDF's save is an own property added inside its constructor, not on the
// prototype, so it can't be jest.spyOn'd directly; the constructor is
// wrapped instead. __esModule: true is required on the returned object:
// without it, the handler's dynamic `await import('jspdf')` double-wraps
// the mock and mod.default comes back as an object, not a function.
let capturedKeywordsCalls: any[] = [];
let capturedSaveCount = 0;
jest.mock('jspdf', () => {
  const actual = jest.requireActual('jspdf');
  const RealJsPDF = actual.default;
  function PatchedJsPDF(this: any, ...args: any[]) {
    const instance = new RealJsPDF(...args);
    const realSetProperties = instance.setProperties.bind(instance);
    instance.setProperties = (props: any) => {
      capturedKeywordsCalls.push(props);
      return realSetProperties(props);
    };
    instance.save = (..._args: any[]) => {
      capturedSaveCount++;
    };
    return instance;
  }
  PatchedJsPDF.prototype = RealJsPDF.prototype;
  Object.setPrototypeOf(PatchedJsPDF, RealJsPDF);
  return { ...actual, __esModule: true, default: PatchedJsPDF };
});

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
        id: 'p1', intake_month: 9, major: { name: 'AI' }, course: { name: 'BA-CS', code: 'BA-CS' }, minors: [],
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
          units, intakeSemester: 1, requirements: [], completedUnits: [],
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
  capturedKeywordsCalls = [];
  capturedSaveCount = 0;
});

describe('the PDF export embeds the restore payload', () => {
  test('the real handler calls setProperties with keywords beginning with the PDF payload prefix', async () => {
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

    const pdfButton = await screen.findByText(/Download PDF/i);
    await act(async () => { fireEvent.click(pdfButton); });
    await screen.findByText(/Please choose your save location in the dialog to save your PDF\./i);

    expect(capturedSaveCount).toBe(1);
    const keywordsCall = capturedKeywordsCalls.find((c) => typeof c.keywords === 'string');
    expect(keywordsCall).toBeDefined();
    expect(keywordsCall.keywords.startsWith(PDF_PAYLOAD_PREFIX)).toBe(true);
  });

  test('decoding the embedded keywords gives the same payload the Excel export would build for the same state, apart from exportDate', async () => {
    const units = [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('CORE2', 'Second Unit', 'core')];
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

    const pdfButton = await screen.findByText(/Download PDF/i);
    await act(async () => { fireEvent.click(pdfButton); });
    await screen.findByText(/Please choose your save location in the dialog to save your PDF\./i);

    const keywordsCall = capturedKeywordsCalls.find((c) => typeof c.keywords === 'string');
    const result = decodePayloadFromPdf(keywordsCall.keywords);
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.payload.arrangement.map((u) => u.code)).toEqual(['CORE1', 'CORE2']);
    expect(result.payload.planner.courseCode).toBe('BA-CS');
    // The payload shape matches what Excel would build for identical state:
    // same fields exist and are populated the same way, exportDate aside.
    const { exportDate, ...rest } = result.payload;
    expect(Object.keys(rest).sort()).toEqual([
      'arrangement', 'completedUnitCodes', 'concededPassUnitCodes', 'customMpuList', 'customWilSlot',
      'doubleMajorMajorName', 'formatVersion', 'marker', 'minorNames', 'outsidePlannerUnitCodes',
      'planner', 'startSemester', 'startYear',
    ].sort());
  });

  test('a placeholder (unselected ELECTIVE) still blocks the PDF export', async () => {
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

    const pdfButton = await screen.findByText(/Download PDF/i);
    await act(async () => { fireEvent.click(pdfButton); });

    await screen.findByText(/Please select a unit for all elective slots \(1 remaining\) before downloading the PDF\./i);
    expect(capturedSaveCount).toBe(0);
  });

  test('an oversize plan still exports a plain PDF, with an omission toast and no keywords set', async () => {
    // 450 units reliably exceeds PDF_PAYLOAD_LIMITS.maxEncodedLength, same
    // measurement basis as the Excel cell-limit test.
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

    const pdfButton = await screen.findByText(/Download PDF/i);
    await act(async () => { fireEvent.click(pdfButton); });

    await screen.findByText(/restore data was omitted because this plan is too large/i);
    // The save toast's own wording is untouched, and the export still happens.
    await screen.findByText(/Please choose your save location in the dialog to save your PDF\./i);
    expect(capturedSaveCount).toBe(1);
    const keywordsCall = capturedKeywordsCalls.find((c) => typeof c.keywords === 'string');
    expect(keywordsCall).toBeUndefined();
  }, 15000);

  test('both exports produce the same payload for the same state, apart from exportDate — proof the extraction did not let them drift', async () => {
    const units = [schedulableUnit('CORE1', 'Core Unit', 'core'), schedulableUnit('CORE2', 'Second Unit', 'core')];
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

    const pdfButton = await screen.findByText(/Download PDF/i);
    await act(async () => { fireEvent.click(pdfButton); });
    await screen.findByText(/Please choose your save location in the dialog to save your PDF\./i);
    const keywordsCall = capturedKeywordsCalls.find((c) => typeof c.keywords === 'string');
    const pdfResult = decodePayloadFromPdf(keywordsCall.keywords);
    expect('error' in pdfResult).toBe(false);
    if ('error' in pdfResult) return;

    const writeFileMock = XLSX.writeFile as jest.Mock;
    const excelButton = await screen.findByText(/Download Excel/i);
    await act(async () => { fireEvent.click(excelButton); });
    await screen.findByText(/Please choose your save location in the dialog to save your Excel file\./i);
    const [capturedWb] = writeFileMock.mock.calls[0];
    const planDataRows: string[][] = XLSX.utils.sheet_to_json(capturedWb.Sheets[PLAN_DATA_SHEET_NAME], { header: 1, raw: false });
    const excelResult = rowsToPayload(planDataRows.slice(1));
    expect('error' in excelResult).toBe(false);
    if ('error' in excelResult) return;

    const { exportDate: pdfExportDate, ...pdfRest } = pdfResult.payload;
    const { exportDate: excelExportDate, ...excelRest } = excelResult.payload;
    expect(pdfRest).toEqual(excelRest);
  });
});
