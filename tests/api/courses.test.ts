import { GET, POST } from '@/app/api/courses/route';
import * as courseRepository from '@core/db/repositories/courseRepository';

jest.mock('@core/db/repositories/courseRepository');

describe('Courses API Endpoint (UIT-03)', () => {
  const getAllCourses = jest.mocked(courseRepository.getAllCourses);
  const createCourse = jest.mocked(courseRepository.createCourse);
  const timestamp = new Date('2026-01-01T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns the repository courses unchanged', async () => {
    const mockCourses = [{
      id: '123',
      name: 'Computer Science',
      code: 'BCS',
      course_type: 'bachelor',
      created_at: timestamp,
      updated_at: timestamp,
    }];
    getAllCourses.mockResolvedValue(mockCourses);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([{
      ...mockCourses[0],
      created_at: timestamp.toISOString(),
      updated_at: timestamp.toISOString(),
    }]);
    expect(getAllCourses).toHaveBeenCalledTimes(1);
  });

  test('GET maps a repository failure to the public error response', async () => {
    getAllCourses.mockRejectedValue(new Error('DB Down'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to fetch courses' });
  });

  test('POST passes the parsed request body to the repository', async () => {
    const created = {
      id: 'new-course',
      name: 'New Course',
      code: null,
      course_type: 'bachelor',
      created_at: timestamp,
      updated_at: timestamp,
    };
    createCourse.mockResolvedValue(created);
    const payload = { name: 'New Course', course_type: 'bachelor' };
    const req = new Request('http://localhost/api/courses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ...created,
      created_at: timestamp.toISOString(),
      updated_at: timestamp.toISOString(),
    });
    expect(createCourse).toHaveBeenCalledWith(payload);
  });

  test('POST maps repository failures to the public error response', async () => {
    createCourse.mockRejectedValue(new Error('Database Error'));
    const req = new Request('http://localhost/api/courses', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Course' }),
    });

    const response = await POST(req);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Server error creating course' });
  });

  test('POST rejects malformed JSON without calling the repository', async () => {
    const req = new Request('http://localhost/api/courses', {
      method: 'POST',
      body: '{invalid',
    });

    const response = await POST(req);

    expect(response.status).toBe(500);
    expect(createCourse).not.toHaveBeenCalled();
  });
});
