import { DELETE, GET, PUT } from '@/app/api/majors/[id]/route';
import * as majorRepository from '@core/db/repositories/majorRepository';
import { NextRequest } from 'next/server';

jest.mock('@core/db/repositories/majorRepository');

describe('Majors API', () => {
  const getMajorById = jest.mocked(majorRepository.getMajorById);
  const updateMajor = jest.mocked(majorRepository.updateMajor);
  const deleteMajor = jest.mocked(majorRepository.deleteMajor);
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  const major = {
    id: '123',
    name: 'Software Development',
    course_id: 'course-1',
    created_at: timestamp,
    updated_at: timestamp,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns 404 with a stable body when the major does not exist', async () => {
    getMajorById.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/majors/non-existent'),
      { params: Promise.resolve({ id: 'non-existent' }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Major not found' });
    expect(getMajorById).toHaveBeenCalledWith('non-existent');
  });

  test('GET returns the requested major', async () => {
    getMajorById.mockResolvedValue(major);

    const response = await GET(
      new NextRequest('http://localhost/api/majors/123'),
      { params: Promise.resolve({ id: '123' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ...major,
      created_at: timestamp.toISOString(),
      updated_at: timestamp.toISOString(),
    });
  });

  test('GET maps repository failures to the public error response', async () => {
    getMajorById.mockRejectedValue(new Error('DB Crash'));

    const response = await GET(
      new NextRequest('http://localhost/api/majors/123'),
      { params: Promise.resolve({ id: '123' }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch major' });
  });

  test('PUT forwards the ID and parsed update to the repository', async () => {
    updateMajor.mockResolvedValue({ ...major, name: 'Cybersecurity' });
    const payload = { name: 'Cybersecurity' };
    const request = new NextRequest('http://localhost/api/majors/123', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(200);
    expect(updateMajor).toHaveBeenCalledWith('123', payload);
    await expect(response.json()).resolves.toMatchObject({
      id: '123',
      name: 'Cybersecurity',
    });
  });

  test('PUT does not call the repository when JSON parsing fails', async () => {
    const request = new NextRequest('http://localhost/api/majors/123', {
      method: 'PUT',
      body: '{invalid',
    });

    const response = await PUT(request, { params: Promise.resolve({ id: '123' }) });

    expect(response.status).toBe(500);
    expect(updateMajor).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: 'Failed to update major' });
  });

  test('DELETE returns success only after the repository completes', async () => {
    deleteMajor.mockResolvedValue(major);

    const response = await DELETE(
      new NextRequest('http://localhost/api/majors/123', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '123' }) },
    );

    expect(deleteMajor).toHaveBeenCalledWith('123');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'Major deleted successfully' });
  });

  test('DELETE maps repository failures to the public error response', async () => {
    deleteMajor.mockRejectedValue(new Error('Delete failed'));

    const response = await DELETE(
      new NextRequest('http://localhost/api/majors/123', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '123' }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to delete major' });
  });
});
