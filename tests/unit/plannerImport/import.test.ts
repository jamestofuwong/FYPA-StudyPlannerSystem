import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import { spawn } from 'node:child_process';

jest.mock('node:child_process');

describe('Planner import process lifecycle', () => {
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

  test('includes parser stderr when the process exits unsuccessfully', async () => {
    const mockChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn((e, cb) => cb("Script error")) },
      on: jest.fn((event, cb) => {
        if (event === 'close') cb(1);
      }),
    };
    (spawn as jest.Mock).mockReturnValue(mockChild);

    await expect(extractPlannerFromPdf(Buffer.from("pdf"))).rejects.toThrow("Script error");
  });
});
