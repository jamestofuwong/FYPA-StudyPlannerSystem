import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import fs from 'node:fs';
import path from 'node:path';

describe('Planner Import Performance', () => {
  const pdfPath = path.resolve(__dirname, '../integration/plannerImport/fixtures/planner1.pdf');

  // Verifies and times the current Planner Import extraction pipeline on a real planner PDF.
  test('Benchmarks current PDF extraction speed', async () => {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const start = performance.now();
    const result = await extractPlannerFromPdf(pdfBuffer, { filename: path.basename(pdfPath) });
    const elapsedSeconds = (performance.now() - start) / 1000;

    console.log(`--- IMPORT PERFORMANCE REPORT ---`);
    console.log(`Planner PDF extraction: ${elapsedSeconds.toFixed(2)}s`);

    expect(result.planner.course_information.course).toBeTruthy();
  }, 30000);
});
