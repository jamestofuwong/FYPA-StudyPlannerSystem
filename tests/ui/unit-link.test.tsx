/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UnitLink from '@/components/common/UnitLink';
import CourseListTable from '@/components/planner/CourseListTable';

describe('UnitLink', () => {
  test('a unit code links to the official page, opened in a new place and without sharing the opener', () => {
    render(<UnitLink code="COS10009"><code>COS10009</code></UnitLink>);
    const link = screen.getByRole('link', { name: /COS10009, opens the official unit page/ });
    expect(link.getAttribute('href')).toBe('https://www.swinburne.edu.au/course/unit/c/cos10009/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  test('an MPU unit and text that is not a unit code stay plain text', () => {
    render(<><UnitLink code="MPU3212"><code>MPU3212</code></UnitLink><UnitLink code="-"><span>-</span></UnitLink></>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('MPU3212')).toBeTruthy();
    expect(screen.getByText('-')).toBeTruthy();
  });

  test('clicking the link does not trigger the click action of the row around it', () => {
    const rowClick = jest.fn();
    render(<div onClick={rowClick}><UnitLink code="COS10009"><code>COS10009</code></UnitLink></div>);
    fireEvent.click(screen.getByRole('link'));
    expect(rowClick).not.toHaveBeenCalled();
  });
});

describe('Study Planners table', () => {
  const unit = (code: string) => ({ year_level: 1, semester: 1, category: 'core', unit_code: code, unit_name: `${code} name`, prerequisite: null, offered_in: [1] });
  const years = [{
    year: 1, label: 'Year 1', isEmpty: false,
    semesters: [{ semester: 1, label: 'Semester 1', isEmpty: false, list: [unit('COS10009'), unit('MPU3212')] }],
  }];

  test('every unit code is a link except the MPU unit', () => {
    render(<CourseListTable yearGroups={years} intakeMonth={3} />);
    const links = screen.getAllByTestId('unit-link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://www.swinburne.edu.au/course/unit/c/cos10009/');
    expect(screen.getByText('MPU3212').closest('a')).toBeNull();
  });
});
