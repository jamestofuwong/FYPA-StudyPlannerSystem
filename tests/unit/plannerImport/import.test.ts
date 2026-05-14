// @ts-nocheck
import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import { spawn } from 'node:child_process';

jest.mock('node:child_process');

describe('Planner Import Logic Coverage', () => {
  test('should handle Python process error event (Line 83)', async () => {
    const mockChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, cb) => {
        if (event === 'error') cb(new Error("Spawn failed"));
      }),
    };
    (spawn as jest.Mock).mockReturnValue(mockChild);

    await expect(extractPlannerFromPdf(Buffer.from("pdf"))).rejects.toThrow("Spawn failed");
  });

  test('should handle Python non-zero exit code (Line 92-100)', async () => {
    const mockChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn((e, cb) => cb("Script error")) },
      on: jest.fn((event, cb) => {
        if (event === 'close') cb(1); // Exit code 1 triggers lines 93-94
      }),
    };
    (spawn as jest.Mock).mockReturnValue(mockChild);

    await expect(extractPlannerFromPdf(Buffer.from("pdf"))).rejects.toThrow("Script error");
  });
});