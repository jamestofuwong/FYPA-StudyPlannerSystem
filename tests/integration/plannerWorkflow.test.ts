// @ts-nocheck
import { POST } from '@/web/app/api/planners/route';
import * as plannerRepo from '@/core/db/repositories/plannerRepository';

// We mock the DB client, but we TEST the logic flow from Route -> Repo
jest.mock('@/core/db/repositories/plannerRepository', () => ({
  createPlanner: jest.fn().mockResolvedValue({ id: 'new-id', majorName: 'Integration Test' })
}));

describe('Integration: Manual Planner Workflow (UIT-05)', () => {
  test('Flow: API Request -> Controller Logic -> Database Repository', async () => {
    // 1. Prepare a JSON payload (Manual entry, not PDF)
    const payload = { majorName: 'Computer Science', year: 2024 };
    
    const req = new Request('http://localhost/api/planners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // 2. Execute the API endpoint
    const response = await POST(req);
    const data = await response.json();

    // 3. Assertions: Did the data flow correctly to the repository?
    expect(response.status).toBe(201);
    expect(data.id).toBe('new-id');
    expect(plannerRepo.createPlanner).toHaveBeenCalledWith(payload);
  });
});