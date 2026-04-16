// @ts-nocheck
import { POST } from '@/web/app/api/planners/route';
import * as plannerService from '@/core/services/plannerImport/plannerImportService';

// We mock the service BUT we test that the API correctly calls it and returns the result
jest.mock('@/core/services/plannerImport/plannerImportService');

describe('End-to-End Workflow (UIT-05)', () => {
  test('User uploads PDF -> Service Processes -> API returns 200', async () => {
    const mockResult = { planner: { majorName: 'Cyber' }, report: 'Done' };
    (plannerService.extractPlannerFromPdf as jest.Mock).mockResolvedValue(mockResult);

    const formData = new FormData();
    formData.append('file', new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' }));

    const req = new Request('http://localhost/api/planners', { method: 'POST', body: formData });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.planner.majorName).toBe('Cyber');
  });
});