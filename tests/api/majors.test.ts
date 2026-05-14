// @ts-nocheck
import { GET, PUT, DELETE, POST } from '@/app/api/majors/[id]/route';
import * as majorRepository from '@core/db/repositories/majorRepository';

jest.mock('@core/db/repositories/majorRepository');
jest.mock('@core/db/repositories/plannerRepository', () => ({
  getMajorById: jest.fn(),
  deleteMajor: jest.fn(),
  updateMajor: jest.fn(),
  createPlanner: jest.fn(),
  savePlannerFromImport: jest.fn(), 
}));

import * as majorRepository from '@core/db/repositories/majorRepository';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

describe('Majors API (Individual)', () => {
  test('GET: should return 404 if major does not exist', async () => {
    (majorRepository.getMajorById as jest.Mock).mockResolvedValue(null);

    const params = Promise.resolve({ id: 'non-existent' });
    const response = await GET({} as any, { params });

    expect(response.status).toBe(404);
  });

  test('DELETE: should return 200 on successful deletion', async () => {
    (majorRepository.deleteMajor as jest.Mock).mockResolvedValue(true);

    const params = Promise.resolve({ id: '999' });
    const response = await DELETE({} as any, { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('Major deleted successfully');
  });

  test('PUT: should return 500 when update fails', async () => {
    (majorRepository.updateMajor as jest.Mock).mockRejectedValue(new Error("Update failed"));
    
    const params = Promise.resolve({ id: '123' });
    const req = new Request('http://localhost/api/majors/123', { method: 'PUT', body: JSON.stringify({}) });
    
    const response = await PUT(req, { params });
    expect(response.status).toBe(500);
  });

  test('DELETE: should return 500 when deletion fails', async () => {
    (majorRepository.deleteMajor as jest.Mock).mockRejectedValue(new Error("Delete failed"));
    
    const params = Promise.resolve({ id: '123' });
    const response = await DELETE({} as any, { params });
    expect(response.status).toBe(500);
  });

  test('GET: handles repository exception (Lines 15-17)', async () => {
    (majorRepository.getMajorById as jest.Mock).mockRejectedValue(new Error('DB Crash'));
    const response = await GET({} as any, { params: Promise.resolve({ id: '1' }) });
    expect(response.status).toBe(500);
  });

  test('POST: handles duplicate planner error (Line 53)', async () => {
    const { POST: plannerPOST } = await import('@/app/api/planners/save/route');
    const plannerRepo = jest.requireMock('@core/db/repositories/plannerRepository');
    plannerRepo.savePlannerFromImport.mockReset();
    plannerRepo.savePlannerFromImport.mockRejectedValue(new Error('DUPLICATE_PLANNER'));

    const req = new Request('http://localhost/api/planners/save', {
      method: 'POST',
      body: JSON.stringify({
        planner: {
          course_information: {
            course: 'Computer Science', major: 'Software Development',
            intake: 'February', intake_year: 2024,
            requirements: { core: { count: 8, cp: 100 } },
          },
          categories: { core_units: [], major_units: [] },
        },
      }),
    });

    const res = await plannerPOST(req);
    expect(res.status).toBe(409);
  });

  test('POST: handles unexpected server crash (500)', async () => {
    const { POST: plannerPOST } = await import('@/app/api/planners/save/route');
    const plannerRepo = jest.requireMock('@core/db/repositories/plannerRepository');
    plannerRepo.savePlannerFromImport.mockReset();
    plannerRepo.savePlannerFromImport.mockRejectedValue(new Error('Unexpected DB Failure'));

    const req = new Request('http://localhost/api/planners/save', {
      method: 'POST',
      body: JSON.stringify({
        planner: {
          course_information: {
            course: 'Computer Science', major: 'Software Development',
            intake: 'February', intake_year: 2024,
            requirements: { core: { count: 8, cp: 100 } },
          },
          categories: { core_units: [], major_units: [] },
        },
      }),
    });

    const res = await plannerPOST(req);
    expect(res.status).toBe(500);
  });
});