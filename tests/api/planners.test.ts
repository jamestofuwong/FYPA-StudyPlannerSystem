// @ts-nocheck
import { POST, GET } from '@/app/api/planners/route';
import * as plannerService from '@core/services/plannerImport/plannerImportService';
import * as plannerRepo from '@core/db/repositories/plannerRepository';

jest.mock('@core/services/plannerImport/plannerImportService');
jest.mock('@core/db/repositories/plannerRepository', () => ({
  createPlanner: jest.fn(),
  getAllPlanners: jest.fn()
}));

describe('Planners API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (plannerRepo.getAllPlanners as jest.Mock).mockResolvedValue([{ id: '1' }]);
    (plannerRepo.createPlanner as jest.Mock).mockResolvedValue({ id: '2' });
  });

  test('GET: returns 500 on repository failure (Covers Line 25)', async () => {
    (plannerRepo.getAllPlanners as jest.Mock).mockRejectedValueOnce(new Error('DB Down'));
    const response = await GET();
    expect(response.status).toBe(500);
  });

  test('POST: parseBoolean helper logic (Covers Lines 11-18)', async () => {
    //test 'true', 'false', and 'invalid' to hit all branches of parseBoolean
    const scenarios = [
      { val: 'true', expected: true },
      { val: 'off', expected: false },
      { val: 'maybe', expected: false }
    ];

    for (const s of scenarios) {
      const formData = new FormData();
      formData.append('file', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
      formData.append('useLlm', s.val);
      
      await POST(new Request('http://lo/api', { method: 'POST', body: formData }));
      
      expect(plannerService.extractPlannerFromPdf).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ useLlm: s.expected })
      );
    }
  });

  test('POST: handles server error in catch block (Covers Lines 66-67)', async () => {
    // Triggers the catch block by passing bad JSON
    const req = new Request('http://lo/api', {
      method: 'POST',
      body: 'invalid-json',
      headers: { 'content-type': 'application/json' }
    });
    const response = await POST(req);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});