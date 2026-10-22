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
  const importedResult = {
    planner: { majorName: 'Computer Science' },
    report: 'Imported',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getAllPlanners.mockResolvedValue([]);
    createPlanner.mockResolvedValue({ id: '2' } as never);
    extractPlannerFromPdf.mockResolvedValue(importedResult as never);
  });

  // Verifies planner-list repository failures return the stable API error.
  test('GET maps repository failures to a stable public response', async () => {
    getAllPlanners.mockRejectedValueOnce(new Error('DB Down'));
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch planners' });
  });

  // Verifies a valid PDF upload is forwarded with its filename and returns the extractor result.
  test('POST passes the uploaded PDF and filename to the extractor and returns its result', async () => {
    const formData = new FormData();
    formData.append('file', new File(['%PDF'], 'planner.pdf', { type: 'application/pdf' }));

    const response = await POST(new Request('http://localhost/api/planners', {
      method: 'POST',
      body: formData,
    }));

    expect(response.status).toBe(200);
    expect(extractPlannerFromPdf).toHaveBeenCalledWith(
      expect.any(Buffer),
      { filename: 'planner.pdf' },
    );
    await expect(response.json()).resolves.toEqual(importedResult);
  });

  // Verifies extractor failures are returned as an API error response.
  test('POST returns the extractor error when planner import fails', async () => {
    extractPlannerFromPdf.mockRejectedValueOnce(new Error('Extractor failed'));
    const formData = new FormData();
    formData.append('file', new File(['%PDF'], 'planner.pdf', { type: 'application/pdf' }));

    const response = await POST(new Request('http://localhost/api/planners', {
      method: 'POST',
      body: formData,
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Extractor failed' });
  });

  test.each([
    // Verifies a missing file is rejected before extraction.
    {
      name: 'missing file',
      build: () => new FormData(),
      error: "Expected a PDF file in form field 'file'",
    },
    // Verifies a non-PDF upload is rejected before extraction.
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

  // Verifies malformed JSON does not reach planner persistence.
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
