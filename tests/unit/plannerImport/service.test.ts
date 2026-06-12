import { extractPlannerFromPdf } from '@core/services/plannerImport/plannerImportService';
import { spawn } from 'node:child_process';

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
    planner: { majorName: 'Computer Science' },
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

  test('returns the parsed result and sanitizes the uploaded filename', async () => {
    (spawn as jest.Mock).mockReturnValueOnce(successfulChild());

    const result = await extractPlannerFromPdf(Buffer.from('pdf'), {
      filename: '../My Planner (Final)',
      useLlm: false,
    });

    expect(result).toEqual(successPayload);
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.stringMatching(/My_Planner__Final_\.pdf$/),
        '--no-llm',
      ]),
      expect.objectContaining({
        env: expect.objectContaining({
          STUDY_PLANNER_OLLAMA_URL: 'http://127.0.0.1:11434',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  });

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

  test('preserves an explicitly configured Ollama URL', async () => {
    const previousUrl = process.env.STUDY_PLANNER_OLLAMA_URL;
    process.env.STUDY_PLANNER_OLLAMA_URL = 'http://localhost:9999';
    (spawn as jest.Mock).mockReturnValueOnce(successfulChild());

    try {
      await extractPlannerFromPdf(Buffer.from('pdf'));

      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            STUDY_PLANNER_OLLAMA_URL: 'http://localhost:9999',
          }),
        }),
      );
    } finally {
      if (previousUrl === undefined) {
        delete process.env.STUDY_PLANNER_OLLAMA_URL;
      } else {
        process.env.STUDY_PLANNER_OLLAMA_URL = previousUrl;
      }
    }
  });

  test('passes model and retry options to the parser process', async () => {
    const options = { useLlm: false, model: 'gpt-4', llmRetries: 3 };

    await expect(extractPlannerFromPdf(Buffer.from(''), options)).rejects.toThrow('Simulated Error');
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['--model', 'gpt-4', '--llm-retries', '3']),
      expect.any(Object),
    );
  });

  test('surfaces a structured parser error', async () => {
    await expect(extractPlannerFromPdf(Buffer.from(''))).rejects.toThrow('Simulated Error');
  });

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

  test('rejects a parser response with an unexpected shape', async () => {
    (spawn as jest.Mock).mockReturnValueOnce({
      stdout: {
        on: (evt: string, cb: (value: Buffer) => void) =>
          evt === 'data' && cb(Buffer.from('{"wrong": "shape"}')),
      },
      stderr: { on: jest.fn() },
      on: (evt: string, cb: (value: number) => void) => evt === 'close' && cb(0),
    });
    await expect(extractPlannerFromPdf(Buffer.from(''))).rejects.toThrow("unexpected payload shape");
  });
});
