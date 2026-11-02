import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import { spawn } from 'node:child_process';

jest.mock('node:child_process');

describe('Planner import process lifecycle', () => {
  // Verifies a child-process startup error is returned to the caller.
  test('rejects when the parser process cannot be started', async () => {
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

  // Verifies UTF-8 stderr is surfaced when the extractor exits unsuccessfully.
  test('includes parser stderr when the process exits unsuccessfully', async () => {
    const mockChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn((_event, callback) => callback(Buffer.from("Script error: Café", "utf8"))) },
      on: jest.fn((event, cb) => {
        if (event === 'close') cb(1);
      }),
    };
    (spawn as jest.Mock).mockReturnValue(mockChild);

    await expect(extractPlannerFromPdf(Buffer.from("pdf"))).rejects.toThrow("Script error: Café");
  });
});
