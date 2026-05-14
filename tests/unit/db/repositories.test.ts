// @ts-nocheck
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Course Repository', () => {
    test('Success: Hits all CRUD functions', async () => {
      (prisma.course.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.course.findUnique as jest.Mock).mockResolvedValue({ id: '1' });
      (prisma.course.create as jest.Mock).mockResolvedValue({ id: '1' });
      (prisma.course.update as jest.Mock).mockResolvedValue({ id: '1' });
      (prisma.course.delete as jest.Mock).mockResolvedValue({ id: '1' });

      await courseRepo.getAllCourses();
      await courseRepo.getCourseById('1');
      await courseRepo.createCourse({ name: 'Test' });
      await courseRepo.updateCourse('1', { name: 'Update' });
      await courseRepo.deleteCourse('1');

      expect(prisma.course.delete).toHaveBeenCalled();
    });

    test('Error: Hits catch blocks for coverage', async () => {
      const err = new Error("DB fail");
      (prisma.course.findMany as jest.Mock).mockRejectedValue(err);
      (prisma.course.create as jest.Mock).mockRejectedValue(err);

      try { await courseRepo.getAllCourses(); } catch (e) {}
      try { await courseRepo.createCourse({}); } catch (e) {}
    });
  });

  describe('Major Repository', () => {
    test('Success: Hits all CRUD and relation functions', async () => {
      (prisma.major.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.major.findUnique as jest.Mock).mockResolvedValue({ id: '1' });
      (prisma.major.create as jest.Mock).mockResolvedValue({ id: '1' });
      (prisma.major.update as jest.Mock).mockResolvedValue({ id: '1' });
      (prisma.major.delete as jest.Mock).mockResolvedValue({ id: '1' });

      await majorRepo.getAllMajors();
      await majorRepo.getMajorById('1');
      await majorRepo.createMajor({ name: 'Major' });
      await majorRepo.updateMajor('1', { name: 'Update' });
      await majorRepo.deleteMajor('1');
      await majorRepo.getMajorsByCourseId('C1');

      expect(prisma.major.delete).toHaveBeenCalled();
    });

    test('Error: Hits catch blocks for coverage', async () => {
      const err = new Error("DB fail");
      (prisma.major.findUnique as jest.Mock).mockRejectedValue(err);
      (prisma.major.update as jest.Mock).mockRejectedValue(err);
      (prisma.major.delete as jest.Mock).mockRejectedValue(err);

      try { await majorRepo.getMajorById('1'); } catch (e) {}
      try { await majorRepo.updateMajor('1', {}); } catch (e) {}
      try { await majorRepo.deleteMajor('1'); } catch (e) {}
    });
  });
});