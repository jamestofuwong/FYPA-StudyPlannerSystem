import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import fs from 'node:fs';
import path from 'node:path';

describe('Planner Import Performance (LLM vs Manual)', () => {
  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock content');

  test('Benchmark: Manual vs LLM Extraction Speed', async () => {
    //Test Manual Speed
    const startManual = performance.now();
    await extractPlannerFromPdf(mockPdfBuffer, { useLlm: false, filename: 'test.pdf' }).catch(() => {});
    const endManual = performance.now();
    const manualTime = (endManual - startManual) / 1000;

    //Test LLM Speed
    const startLlm = performance.now();
    await extractPlannerFromPdf(mockPdfBuffer, { useLlm: true, filename: 'test.pdf' }).catch(() => {});
    const endLlm = performance.now();
    const llmTime = (endLlm - startLlm) / 1000;

    console.log(`--- IMPORT PERFORMANCE REPORT ---`);
    console.log(`Manual Extraction: ${manualTime.toFixed(2)}s`);
    console.log(`LLM-Enhanced Extraction: ${llmTime.toFixed(2)}s`);
    console.log(`Difference: ${(llmTime / manualTime).toFixed(1)}x slower with LLM`);
    
    // Performance assertion, manual should always be faster than LLM
    expect(manualTime).toBeLessThan(llmTime);
  }, 30000);
});