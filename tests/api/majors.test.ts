// @ts-nocheck
import { GET, PUT, DELETE } from '@/web/app/api/majors/[id]/route';
import * as majorRepository from '@/core/db/repositories/majorRepository';

jest.mock('@/core/db/repositories/majorRepository');

describe('Majors API (Individual)', () => {
  test('GET: should return 404 if major does not exist', async () => {
    (majorRepository.getMajorById as jest.Mock).mockResolvedValue(null);

    // Mock Next.js params
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

});