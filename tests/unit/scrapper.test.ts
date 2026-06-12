import { getMockStudent } from '@core/services/studentService';
import { calculateProgress } from '@core/services/analyticsService'; 

describe('Student Data Analytics', () => {
  const mockStudent = getMockStudent();

  test('should correctly calculate course completion percentage', () => {
    //37.5/300 required = 0.125 (12.5%)
    const percentage = calculateProgress(mockStudent);
    expect(percentage).toBe(12.5);
  });

  test('should only count Complete units for major matching', () => {
    //2 Complete units and 1 Future unit
    const completedUnits = mockStudent.courseList.filter(c => c.status === 'Complete');
    
    expect(completedUnits).toHaveLength(2);
    expect(completedUnits[0].courseId).toBe('COS10009');
  });
});
