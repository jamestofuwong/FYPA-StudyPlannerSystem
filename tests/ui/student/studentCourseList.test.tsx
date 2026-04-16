/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import StudentCourseList from '../../../web/app/(pages)/student/studentCourseList';

const mockUnits = [
  { 
    courseId: "COS10009", 
    courseTitle: "Intro to Programming", 
    status: "Complete",
    term: "2024_FEB_S1" 
  },
  { 
    courseId: "TNE10006", 
    courseTitle: "Networks", 
    status: "In Progress",
    term: "2024_SEP_S2" 
  }
];

describe('StudentCourseList Component', () => {
  test('should render all units in the list', () => {
    // TRY THIS: Change the prop name from 'courses' to 'courseList' 
    // to match what termFunction.ts is looking for.
    render(<StudentCourseList courseList={mockUnits} />);
    
    expect(screen.getByText("COS10009")).toBeInTheDocument();
  });
});