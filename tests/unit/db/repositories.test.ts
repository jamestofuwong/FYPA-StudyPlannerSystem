import * as courseRepo from '@core/db/repositories/courseRepository';
import * as majorRepo from '@core/db/repositories/majorRepository';
import { prisma } from '@core/db/client';

// Single, consistent mock for the entire DB client
jest.mock('@core/db/client', () => ({
  prisma: {
    course: { 
      findMany: jest.fn(), 
      findUnique: jest.fn(), 
      create: jest.fn(), 
      update: jest.fn(), 
      delete: jest.fn() 
    },
    major: { 
      findMany: jest.fn(), 
      findUnique: jest.fn(), 
      create: jest.fn(), 
      update: jest.fn(), 
      delete: jest.fn() 
    }
  }
}));

describe('Database Repositories (UIT-02)', () => {
  const courseFindMany = jest.mocked(prisma.course.findMany);
  const courseFindUnique = jest.mocked(prisma.course.findUnique);
  const courseCreate = jest.mocked(prisma.course.create);
  const courseUpdate = jest.mocked(prisma.course.update);
  const courseDelete = jest.mocked(prisma.course.delete);
  const majorFindMany = jest.mocked(prisma.major.findMany);
  const majorFindUnique = jest.mocked(prisma.major.findUnique);
  const majorCreate = jest.mocked(prisma.major.create);
  const majorUpdate = jest.mocked(prisma.major.update);
  const majorDelete = jest.mocked(prisma.major.delete);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Course Repository', () => {
    test('delegates CRUD operations to Prisma with the expected query shape', async () => {
      const timestamp = new Date();
      const course = {
        id: '1',
        name: 'Test',
        code: null,
        course_type: 'bachelor',
        created_at: timestamp,
        updated_at: timestamp,
      };
      courseFindMany.mockResolvedValue([]);
      courseFindUnique.mockResolvedValue(course);
      courseCreate.mockResolvedValue(course);
      courseUpdate.mockResolvedValue({ ...course, name: 'Update' });
      courseDelete.mockResolvedValue(course);

      await expect(courseRepo.getAllCourses()).resolves.toEqual([]);
      await expect(courseRepo.getCourseById('1')).resolves.toEqual(course);
      await expect(courseRepo.createCourse({ name: 'Test' })).resolves.toEqual(course);
      await expect(courseRepo.updateCourse('1', { name: 'Update' })).resolves.toMatchObject({
        id: '1',
        name: 'Update',
      });
      await expect(courseRepo.deleteCourse('1')).resolves.toEqual(course);

      expect(courseFindMany).toHaveBeenCalledWith();
      expect(courseFindUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(courseCreate).toHaveBeenCalledWith({ data: { name: 'Test' } });
      expect(courseUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Update' },
      });
      expect(courseDelete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    test('propagates Prisma errors to the caller', async () => {
      courseFindMany.mockRejectedValueOnce(new Error('DB fail'));
      courseCreate.mockRejectedValueOnce(new Error('Create failed'));

      await expect(courseRepo.getAllCourses()).rejects.toThrow('DB fail');
      await expect(courseRepo.createCourse({})).rejects.toThrow('Create failed');
    });
  });

  describe('Major Repository', () => {
    test('delegates CRUD and course filtering with the expected query shape', async () => {
      const timestamp = new Date();
      const major = {
        id: '1',
        name: 'Major',
        course_id: 'C1',
        created_at: timestamp,
        updated_at: timestamp,
      };
      majorFindMany.mockResolvedValue([]);
      majorFindUnique.mockResolvedValue(major);
      majorCreate.mockResolvedValue(major);
      majorUpdate.mockResolvedValue({ ...major, name: 'Update' });
      majorDelete.mockResolvedValue(major);

      await expect(majorRepo.getAllMajors()).resolves.toEqual([]);
      await expect(majorRepo.getMajorById('1')).resolves.toEqual(major);
      await expect(majorRepo.createMajor({ name: 'Major' })).resolves.toEqual(major);
      await expect(majorRepo.updateMajor('1', { name: 'Update' })).resolves.toMatchObject({
        id: '1',
        name: 'Update',
      });
      await expect(majorRepo.deleteMajor('1')).resolves.toEqual(major);
      await expect(majorRepo.getMajorsByCourseId('C1')).resolves.toEqual([]);

      expect(majorFindMany).toHaveBeenNthCalledWith(1);
      expect(majorFindMany).toHaveBeenNthCalledWith(2, { where: { course_id: 'C1' } });
      expect(majorFindUnique).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(majorCreate).toHaveBeenCalledWith({ data: { name: 'Major' } });
      expect(majorUpdate).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Update' },
      });
      expect(majorDelete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    test('propagates read, update, and delete failures', async () => {
      majorFindUnique.mockRejectedValueOnce(new Error('Read failed'));
      majorUpdate.mockRejectedValueOnce(new Error('Update failed'));
      majorDelete.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(majorRepo.getMajorById('1')).rejects.toThrow('Read failed');
      await expect(majorRepo.updateMajor('1', {})).rejects.toThrow('Update failed');
      await expect(majorRepo.deleteMajor('1')).rejects.toThrow('Delete failed');
    });
  });
});
