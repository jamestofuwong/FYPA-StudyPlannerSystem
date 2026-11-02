import * as XLSX from 'xlsx-js-style';
import { buildRunExport } from '../../../core/services/classEstimation/runExportService';
import type { EstimationRunDetail } from '../../../core/db/repositories/estimationRunRepository';

const run: EstimationRunDetail = {
  id: 'r1', createdAt: new Date('2026-11-02'), label: null, course: 'Bachelor of Computer Science',
  targetYear: 2027, targetSemester: 1, loadCap: 4, retentionRate: 0.85, newIntake: 10, source: 'import',
  studentCount: 50, groupCount: 40, commonCoreCount: 0, unitCount: 2, totalHeadcount: 60,
  units: [
    { unitCode: 'COS10022', unitName: 'Data Science', fromNamedPicks: 10, fromElectives: 35.3, fromFreeElectives: 2.9, fromNewIntake: 0, projected: 45, headcount: 45 },
    // Saved before free electives were recorded.
    { unitCode: 'COS10009', unitName: 'Intro', fromNamedPicks: 20, fromElectives: 0, fromNewIntake: 10, projected: 15, headcount: 15 },
  ],
};

test('the projection sheet uses the page headers and splits needed and optional seats', () => {
  const wb = XLSX.read(buildRunExport(run), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Projected Enrolment'], { header: 1 });
  expect(rows[0][0]).toBe('Projected enrolment, Bachelor of Computer Science, Feb/Mar 2027');
  expect(rows[1]).toEqual(['Unit', 'Unit name', 'Needed to graduate', 'Optional', 'New', 'Headcount']);
  expect(rows[2]).toEqual(['COS10022', 'Data Science', 42.4, 2.9, '', 45]);
  expect(rows[3]).toEqual(['COS10009', 'Intro', 20, 'Not recorded', 10, 15]);
});
