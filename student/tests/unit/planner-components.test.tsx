/** @jest-environment jsdom */
import React from 'react';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import PlannerCard from '@student/components/PlannerCard/PlannerCard';
import PlannerGrid from '@student/components/PlannerGrid/PlannerGrid';
import type { PlannerSummary } from '@student/lib/types';

// The real link shows a loading overlay after a click, which needs the Next.js router. A plain link is enough here.
jest.mock('@student/components/common/PendingNavigation', () => ({
  PendingLink: ({ href, children, className, ariaLabel }: any) => <a href={href} className={className} aria-label={ariaLabel}>{children}</a>,
}));

const planner = (over: Partial<PlannerSummary> = {}): PlannerSummary => ({
  id: 'p1', courseName: 'Bachelor of Computer Science', courseCode: 'BCS', majorName: 'Data Science',
  intakeYear: 2026, intakeMonth: 3, intakeLabel: 'March 2026', durationYears: 3, totalUnits: 24, ...over,
});

afterEach(() => { cleanup(); sessionStorage.clear(); });

describe('PlannerCard', () => {
  test('shows the course code, major, course, intake, length and unit count, and links to the planner', () => {
    render(<PlannerCard planner={planner()} />);
    const link = screen.getByRole('link', { name: 'View Bachelor of Computer Science Data Science planner' });
    expect(link).toHaveAttribute('href', '/planners/p1');
    expect(within(link).getByText('BCS')).toBeInTheDocument();
    expect(within(link).getByRole('heading', { name: 'Data Science' })).toBeInTheDocument();
    expect(within(link).getByText('Intake: March 2026')).toBeInTheDocument();
    expect(link).toHaveTextContent('3 yrs');
    expect(link).toHaveTextContent('24 units');
  });

  test.each([[null], [undefined], ['   ']])('a missing course code (%j) reads "No information"', (courseCode) => {
    render(<PlannerCard planner={planner({ courseCode: courseCode as any })} />);
    expect(screen.getByText('No information')).toBeInTheDocument();
  });

  test('a planner with no major is a General Programme, and one year is "1 yr"', () => {
    render(<PlannerCard planner={planner({ majorName: null, durationYears: 1 })} />);
    expect(screen.getByRole('heading', { name: 'General Programme' })).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(/1 yr\b/);
    expect(link).not.toHaveTextContent('1 yrs');
    expect(link).toHaveAttribute('aria-label', 'View Bachelor of Computer Science planner');
  });
});

describe('PlannerGrid', () => {
  const planners = [
    planner({ id: '1', courseName: 'Bachelor of Computer Science', courseCode: 'BCS', majorName: 'Data Science', intakeYear: 2026, intakeLabel: 'March 2026' }),
    planner({ id: '2', courseName: 'Bachelor of Computer Science', courseCode: 'BCS', majorName: 'Cybersecurity', intakeYear: 2025, intakeLabel: 'September 2025' }),
    planner({ id: '3', courseName: 'Bachelor of Information Technology', courseCode: 'BIT', majorName: null, intakeYear: 2026, intakeLabel: 'March 2026' }),
  ];
  const cards = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'));
  const search = (text: string) => fireEvent.change(screen.getByLabelText(/Search planners/i), { target: { value: text } });
  const group = (name: string) => within(screen.getByRole('group', { name }));

  test('shows every planner and the count', () => {
    render(<PlannerGrid planners={planners} />);
    expect(cards()).toEqual(['/planners/1', '/planners/2', '/planners/3']);
    expect(screen.getByText(/3 planners available/)).toBeInTheDocument();
  });

  test.each([
    ['BIT', ['/planners/3']],                                  // by course code (added in the CMS update)
    ['bit', ['/planners/3']],                                  // not case sensitive
    ['cyber', ['/planners/2']],                                // by major
    ['information', ['/planners/3']],                          // by course name
    ['september', ['/planners/2']],                            // by intake label
    ['  data  ', ['/planners/1']],                             // spaces around the words are ignored
  ])('searching "%s" finds %j', (text, expected) => {
    render(<PlannerGrid planners={planners} />);
    search(text);
    expect(cards()).toEqual(expected);
  });

  test('a search with no match shows a message, and "Clear filters" brings the list back', () => {
    render(<PlannerGrid planners={planners} />);
    search('zzz');
    expect(screen.getByText('No planners found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cards()).toHaveLength(3);
  });

  test('the course, major and year chips narrow the list together', () => {
    render(<PlannerGrid planners={planners} />);
    fireEvent.click(group('Filter by course').getByRole('button', { name: 'Bachelor of Computer Science' }));
    expect(cards()).toEqual(['/planners/1', '/planners/2']);
    fireEvent.click(group('Filter by major').getByRole('button', { name: 'Cybersecurity' }));
    expect(cards()).toEqual(['/planners/2']);
    fireEvent.click(group('Filter by intake year').getByRole('button', { name: '2026' }));
    expect(screen.getByText('No planners found')).toBeInTheDocument();
  });

  test('the major chips list only the majors of the chosen course (and "No major" for a planner without one)', () => {
    render(<PlannerGrid planners={planners} />);
    expect(group('Filter by major').getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Cybersecurity', 'Data Science', 'No major']);
    fireEvent.click(group('Filter by course').getByRole('button', { name: 'Bachelor of Computer Science' }));
    expect(group('Filter by major').getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Cybersecurity', 'Data Science']);
  });

  test('choosing another course clears the major filter', () => {
    render(<PlannerGrid planners={planners} />);
    fireEvent.click(group('Filter by major').getByRole('button', { name: 'Data Science' }));
    expect(cards()).toEqual(['/planners/1']);
    fireEvent.click(group('Filter by course').getByRole('button', { name: 'Bachelor of Information Technology' }));
    expect(cards()).toEqual(['/planners/3']);
  });

  test('the filters are kept when the person comes back to the page in the same session', () => {
    const { unmount } = render(<PlannerGrid planners={planners} />);
    search('cyber');
    fireEvent.click(group('Filter by intake year').getByRole('button', { name: '2025' }));
    unmount();

    render(<PlannerGrid planners={planners} />);
    expect(screen.getByLabelText(/Search planners/i)).toHaveValue('cyber');
    expect(cards()).toEqual(['/planners/2']);
  });

  test('damaged saved filters are ignored instead of breaking the page', () => {
    sessionStorage.setItem('study-planner-filters', '{not json');
    render(<PlannerGrid planners={planners} />);
    expect(cards()).toHaveLength(3);
  });
});
