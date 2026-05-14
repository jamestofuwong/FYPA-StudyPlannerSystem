// @ts-nocheck
import { GET, POST } from '@/app/api/courses/route';
import * as courseRepository from '@core/db/repositories/courseRepository';
import { NextResponse } from 'next/server';

// 1. Mock the repository so we don't touch the real database
jest.mock('@core/db/repositories/courseRepository');

describe('Courses API Endpoint (UIT-03)', () => {
  
  test('GET should return 200 and a list of courses', async () => {
    const mockCourses = [{ id: '123', name: 'Computer Science', code: 'BCS' }];
    (courseRepository.getAllCourses as jest.Mock).mockResolvedValue(mockCourses);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockCourses);
  });

  test('GET should return 500 when repository fails', async () => {
    (courseRepository.getAllCourses as jest.Mock).mockRejectedValue(new Error("DB Down"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch courses");
  });

  test('GET: should return 500 when database crashes (Negative Test)', async () => {
  (courseRepository.getAllCourses as jest.Mock).mockRejectedValue(new Error("Database connection lost"));

  const response = await GET();
  const data = await response.json();

  expect(response.status).toBe(500);
  expect(data.error).toBe("Failed to fetch courses");
});

  test('POST: should return 500 when database fails to create course', async () => {
  (courseRepository.createCourse as jest.Mock).mockRejectedValue(new Error("Database Error"));
  
  const req = new Request('http://localhost/api/courses', {
    method: 'POST',
    body: JSON.stringify({ name: 'New Course' })
  });

  const response = await POST(req);
  const data = await response.json();

  expect(response.status).toBe(500);
  expect(data.error).toBe("Server error creating course");
});

});