// @ts-nocheck
import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import { spawn } from 'node:child_process';
jest.mock('node:child_process');

test('should handle non-zero exit codes from Python (Line 92-100)', async () => {
  const mockChild = {
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn((e, cb) => cb("Internal error")) },
    on: jest.fn((e, cb) => { if (e === 'close') cb(1); }), 
  };
  (spawn as jest.Mock).mockReturnValue(mockChild);

  await expect(extractPlannerFromPdf(Buffer.from("pdf"))).rejects.toThrow();
});