import { POST } from '@/app/api/planners/save/route';
import * as plannerRepository from '@core/db/repositories/plannerRepository';

jest.mock('@core/db/repositories/plannerRepository', () => ({
  savePlannerFromImport: jest.fn(),
}));

describe('Planner save API', () => {
  const savePlannerFromImport = jest.mocked(plannerRepository.savePlannerFromImport);
  const planner = {
    file_name: 'planner.pdf',
    course_information: {
      course: 'Computer Science',
      major: 'Software Development',
      intake: 'February',
      intake_year: 2024,
      requirements: { core: { count: 8, cp: 100 } },
    },
    categories: {
      core_units: [],
      major_units: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saves a valid planner and returns its ID', async () => {
    savePlannerFromImport.mockResolvedValue({ id: 'planner-1' } as never);
    const request = new Request('http://localhost/api/planners/save', {
      method: 'POST',
      body: JSON.stringify({ planner }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      plannerId: 'planner-1',
    });
    expect(savePlannerFromImport).toHaveBeenCalledWith(planner);
  });

  test('rejects an invalid planner structure before calling the repository', async () => {
    const request = new Request('http://localhost/api/planners/save', {
      method: 'POST',
      body: JSON.stringify({ planner: { categories: {} } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid planner data structure' });
    expect(savePlannerFromImport).not.toHaveBeenCalled();
  });

  test('maps duplicate planners to conflict', async () => {
    savePlannerFromImport.mockRejectedValue(new Error('DUPLICATE_PLANNER'));
    const request = new Request('http://localhost/api/planners/save', {
      method: 'POST',
      body: JSON.stringify({ planner }),
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'A planner with this course, major, intake year and month already exists',
    });
  });

  test('returns the repository error message for unexpected failures', async () => {
    savePlannerFromImport.mockRejectedValue(new Error('Unexpected DB Failure'));
    const request = new Request('http://localhost/api/planners/save', {
      method: 'POST',
      body: JSON.stringify({ planner }),
    });

    const response = await POST(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unexpected DB Failure' });
  });
});
