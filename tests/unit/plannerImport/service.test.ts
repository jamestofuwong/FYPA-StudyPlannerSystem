import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

jest.mock('node:child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    stdout: {
      on: (evt: string, cb: (value: Buffer) => void) =>
        evt === 'data' && cb(Buffer.from('{"error": "Simulated Error"}')),
    },
    stderr: { on: jest.fn() },
    on: (evt: string, cb: (value: number) => void) => evt === 'close' && cb(0),
  })
}));

describe('Planner import process failures', () => {
  const successPayload = {
    planner: { majorName: 'Computer Science', course: 'Café München' },
    report: 'Imported successfully',
  };

  function successfulChild(payload = successPayload) {
    return {
      stdout: {
        on: (evt: string, cb: (value: Buffer) => void) =>
          evt === 'data' && cb(Buffer.from(JSON.stringify(payload))),
      },
      stderr: { on: jest.fn() },
      on: (evt: string, cb: (value: number) => void) => evt === 'close' && cb(0),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Verifies the uploaded PDF is passed through a sanitized temp file and UTF-8 results are decoded.
  test('writes a sanitized temporary PDF, decodes UTF-8 JSON, and cleans up after success', async () => {
    const pdfBuffer = Buffer.from('pdf');
    let tempFile: string | undefined;
    (spawn as jest.Mock).mockImplementationOnce((_executable: string, args: string[]) => {
      tempFile = args[1];
      expect(readFileSync(args[1])).toEqual(pdfBuffer);
      return successfulChild();
    });

    const result = await extractPlannerFromPdf(pdfBuffer, {
      filename: '../My Planner (Final)',
    });

    expect(result).toEqual(successPayload);
    const [executable, args, options] = (spawn as jest.Mock).mock.calls[0];
    expect(executable).toBe(process.env.PYTHON_EXECUTABLE?.trim() || 'python3');
    expect(args).toHaveLength(2);
    expect(args[0]).toMatch(/[\\/]plannerStructureService\.py$/);
    expect(args[1]).toMatch(/My_Planner__Final_\.pdf$/);
    expect(options).toEqual(expect.objectContaining({
      cwd: process.cwd(),
      env: expect.objectContaining({
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    expect(tempFile).toBeDefined();
    expect(existsSync(tempFile!)).toBe(false);
  });

  // Verifies packaged Electron runs the bundled extractor binary.
  test('uses the packaged extractor binary when Electron resourcesPath is available', async () => {
    const processWithResources = process as NodeJS.Process & { resourcesPath?: string };
    const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: 'C:\\app\\resources',
    });
    (spawn as jest.Mock).mockReturnValueOnce(successfulChild());

    try {
      await expect(extractPlannerFromPdf(Buffer.from('pdf'))).resolves.toEqual(successPayload);

      expect(spawn).toHaveBeenCalledWith(
        expect.stringMatching(/plannerStructureService(?:\.exe)?$/),
        [expect.stringMatching(/planner\.pdf$/)],
        expect.any(Object),
      );
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(process, 'resourcesPath', originalDescriptor);
      } else {
        Reflect.deleteProperty(processWithResources, 'resourcesPath');
      }
    }
  });

  // Verifies a structured error returned by the extractor becomes a service error.
  test('surfaces a structured parser error', async () => {
    await expect(extractPlannerFromPdf(Buffer.from(''))).rejects.toThrow('Simulated Error');
  });

  // Verifies empty subprocess output is rejected as missing JSON.
  test('rejects an empty parser response', async () => {
    (spawn as jest.Mock).mockReturnValueOnce({
      stdout: {
        on: (evt: string, cb: (value: Buffer) => void) =>
          evt === 'data' && cb(Buffer.from('  ')),
      },
      stderr: { on: jest.fn() },
      on: (evt: string, cb: (value: number) => void) => evt === 'close' && cb(0),
    });
    await expect(extractPlannerFromPdf(Buffer.from(''))).rejects.toThrow("no JSON output");
  });

  // Verifies JSON without the planner result contract is rejected.
  test('rejects a parser response with an unexpected shape', async () => {
    (spawn as jest.Mock).mockReturnValueOnce({
      stdout: {
        on: (evt: string, cb: (value: Buffer) => void) =>
          evt === 'data' && cb(Buffer.from('{"wrong": "shape"}')),
      },
      stderr: { on: jest.fn() },
      on: (evt: string, cb: (value: number) => void) => evt === 'close' && cb(0),
    });
    await expect(extractPlannerFromPdf(Buffer.from(''))).rejects.toThrow(
      'Planner import returned no valid JSON payload.',
    );
  });
});
