/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import UnitDetailPage from '@/app/units/[code]/page';

jest.mock('@student/components/Nav/Nav', () => ({ __esModule: true, default: () => <nav /> }));
jest.mock('./../../app/units/[code]/RequisiteExpression', () => ({ __esModule: true, default: () => <span>Nil</span> }));
jest.mock('next/navigation', () => ({ notFound: () => { throw new Error('not found'); } }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...rest}>{children}</a> }));

const getCachedUnit = jest.fn();
jest.mock('@student/lib/catalog', () => ({ getCachedUnit: (...args: unknown[]) => getCachedUnit(...args) }));

const unit = (code: string) => ({
  code, name: `${code} name`, creditPoints: 12.5, yearLevel: 1, availability: ['Semester 1'],
  overview: 'An overview.', learningOutcomes: [], content: [], assessment: [],
  requisiteGroups: [], prerequisites: [], corequisites: [], antirequisites: [],
});

const renderPage = async (code: string) => render(await UnitDetailPage({ params: Promise.resolve({ code }) }));

describe('unit detail page: official university page button', () => {
  beforeEach(() => getCachedUnit.mockReset());

  test('a unit has a button to its official page, opened in a new tab without sharing the opener', async () => {
    getCachedUnit.mockResolvedValue(unit('COS10009'));
    await renderPage('COS10009');
    const link = screen.getByRole('link', { name: /View COS10009 on the university website/ });
    expect(link).toHaveAttribute('href', 'https://www.swinburne.edu.au/course/unit/c/cos10009/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('View on the university website');
  });

  test('an MPU unit has no button, because the site has no page of its own for it', async () => {
    getCachedUnit.mockResolvedValue(unit('MPU3212'));
    await renderPage('MPU3212');
    expect(screen.queryByRole('link', { name: /university website/ })).toBeNull();
  });

  test('the button is there even when the unit has no detail text', async () => {
    getCachedUnit.mockResolvedValue({ ...unit('SWE40001'), overview: '' });
    await renderPage('SWE40001');
    expect(screen.getByText('Unit details unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View SWE40001 on the university website/ })).toHaveAttribute('href', 'https://www.swinburne.edu.au/course/unit/s/swe40001/');
  });
});
