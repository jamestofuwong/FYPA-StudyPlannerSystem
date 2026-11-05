/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import CourseListTable from '@/components/planner/CourseListTable';

// A planner is shown with one heading for each term that carries the year, such as "Year 1 Semester 1", instead
// of a "Year 1" heading with a separate "Semester 1" heading under it.

const unit = (code: string, year: number, semester: number) => ({
  year_level: year, semester, category: 'core', unit_code: code, unit_name: `${code} name`, prerequisite: null, offered_in: [semester],
});

const group = (year: number, semesters: { semester: number; label: string; list: ReturnType<typeof unit>[] }[]) => ({
  year, label: `Year ${year}`, isEmpty: semesters.every((s) => s.list.length === 0),
  semesters: semesters.map((s) => ({ ...s, isEmpty: s.list.length === 0 })),
});

const YEARS = [
  group(1, [
    { semester: 1, label: 'Semester 1', list: [unit('COS10009', 1, 1)] },
    { semester: 2, label: 'Semester 2', list: [unit('COS20007', 1, 2)] },
  ]),
  group(2, [
    { semester: 1, label: 'Semester 1', list: [unit('COS30019', 2, 1)] },
    { semester: 2, label: 'Semester 2', list: [] },
  ]),
];

describe('CourseListTable headings', () => {
  test('each term has one heading that names the year and the semester', () => {
    render(<CourseListTable yearGroups={YEARS} intakeMonth={3} />);
    expect(screen.getByText('Year 1 Semester 1')).toBeTruthy();
    expect(screen.getByText('Year 1 Semester 2')).toBeTruthy();
    expect(screen.getByText('Year 2 Semester 1')).toBeTruthy();
  });

  test('there is no separate year heading and no separate semester heading', () => {
    render(<CourseListTable yearGroups={YEARS} intakeMonth={3} />);
    expect(screen.queryByText('Year 1')).toBeNull();
    expect(screen.queryByText('Year 2')).toBeNull();
    expect(screen.queryByText('Semester 1')).toBeNull();
    expect(screen.queryByText('Semester 2')).toBeNull();
  });

  test('empty terms shown while editing carry the year too, whether the semester has no units or the term is missing', () => {
    render(<CourseListTable yearGroups={YEARS} intakeMonth={3} editable onAddUnit={() => {}} onAddSemester={() => {}} />);
    expect(screen.getByText('Year 2 Semester 2')).toBeTruthy();   // a semester with no units
    expect(screen.getByText('Year 1 Summer Term')).toBeTruthy();  // a term that the planner does not list
    expect(screen.queryByText('Summer Term')).toBeNull();
    expect(screen.queryByText('Year 1')).toBeNull();
  });
});
