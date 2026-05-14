// @ts-nocheck
import { POST } from '@/app/api/planners/route';
import * as plannerRepo from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository', () => ({
  createPlanner: jest.fn().mockResolvedValue({ id: 'new-id', majorName: 'Integration Test' })
}));

describe('Integration: Manual Planner Workflow (UIT-05)', () => {
  test('Flow: API Request -> Controller Logic -> Database Repository', async () => {
    // prepare a JSON payload (Manual entry, not PDF)
    const payload = { majorName: 'Computer Science', year: 2024 };
    
    const req = new Request('http://localhost/api/planners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBe('new-id');
    expect(plannerRepo.createPlanner).toHaveBeenCalledWith(payload);
  });
});