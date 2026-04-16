/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, screen } from '@testing-library/react';
import StudentCourseList from '@/web/app/(pages)/student/StudentCourseList';

describe('Student UI Coverage Fix', () => {
  test('Renders title and handles empty list without crashing', () => {
    // This fixes the crash. We check for the title which ALWAYS exists.
    render(<StudentCourseList courseList={[]} />);
    expect(screen.getByText(/Course List/i)).toBeInTheDocument();
  });

  test('Hits full data branches (Lines 25-51)', () => {
    const mockData = [{ 
      courseId: 'CS101', 
      courseTitle: 'Test', 
      credits: 3, 
      creditsEarned: 3, 
      status: 'Passed',
      term: '2023_01_Sem' // Added term to prevent split() error
    }];
    render(<StudentCourseList courseList={mockData} />);
    expect(screen.getByText('CS101')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });
});