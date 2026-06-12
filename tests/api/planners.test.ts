import { POST, GET } from '@/app/api/planners/route';
import * as plannerService from '@core/services/plannerImport/plannerImportService';
import * as plannerRepo from '@core/db/repositories/plannerRepository';

jest.mock('@core/services/plannerImport/plannerImportService');
jest.mock('@core/db/repositories/plannerRepository', () => ({
  createPlanner: jest.fn(),
  getAllPlanners: jest.fn()
}));

describe('Planners API', () => {
  const extractPlannerFromPdf = jest.mocked(plannerService.extractPlannerFromPdf);
  const getAllPlanners = jest.mocked(plannerRepo.getAllPlanners);
  const createPlanner = jest.mocked(plannerRepo.createPlanner);

  beforeEach(() => {
    jest.clearAllMocks();
    getAllPlanners.mockResolvedValue([]);
    createPlanner.mockResolvedValue({ id: '2' } as never);
    extractPlannerFromPdf.mockResolvedValue({
      planner: { majorName: 'Computer Science' },
      report: 'Imported',
    } as never);
  });

  test('GET maps repository failures to a stable public response', async () => {
    getAllPlanners.mockRejectedValueOnce(new Error('DB Down'));
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch planners' });
  });

  test.each([
    { value: 'true', expected: true },
    { value: ' YES ', expected: true },
    { value: 'off', expected: false },
    { value: 'maybe', expected: false },
  ])('POST parses useLlm="$value" as $expected', async ({ value, expected }) => {
      const formData = new FormData();
      formData.append('file', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
      formData.append('useLlm', value);

      const response = await POST(new Request('http://localhost/api/planners', {
        method: 'POST',
        body: formData,
      }));

      expect(response.status).toBe(200);
      expect(extractPlannerFromPdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ filename: 'a.pdf', useLlm: expected }),
      );
  });

  test.each([
    { retries: '4', expected: 4 },
    { retries: 'invalid', expected: undefined },
  ])('POST parses llmRetries="$retries" as $expected', async ({ retries, expected }) => {
    const formData = new FormData();
    formData.append('file', new File(['%PDF'], 'planner.pdf', { type: 'application/pdf' }));
    formData.append('llmRetries', retries);
    formData.append('model', ' local-model ');

    const response = await POST(new Request('http://localhost/api/planners', {
      method: 'POST',
      body: formData,
    }));

    expect(response.status).toBe(200);
    expect(extractPlannerFromPdf).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: 'planner.pdf',
        model: ' local-model ',
        llmRetries: expected,
      }),
    );
  });

  test.each([
    {
      name: 'missing file',
      build: () => new FormData(),
      error: "Expected a PDF file in form field 'file'",
    },
    {
      name: 'non-PDF extension',
      build: () => {
        const formData = new FormData();
        formData.append('file', new File(['text'], 'notes.txt', { type: 'text/plain' }));
        return formData;
      },
      error: 'Only PDF uploads are supported',
    },
  ])('POST rejects $name before invoking the parser', async ({ build, error }) => {
    const response = await POST(new Request('http://localhost/api/planners', {
      method: 'POST',
      body: build(),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(extractPlannerFromPdf).not.toHaveBeenCalled();
  });

  test('POST does not call the repository when JSON parsing fails', async () => {
    const req = new Request('http://lo/api', {
      method: 'POST',
      body: 'invalid-json',
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(req);

    expect(response.status).toBe(500);
    expect(createPlanner).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });
});
