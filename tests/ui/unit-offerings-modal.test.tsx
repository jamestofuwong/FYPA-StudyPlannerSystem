/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import UnitOfferingsModal from '@/app/(pages)/units/UnitOfferingsModal';

const units = [
  { id: '1', unit_code: 'COS10009', unit_name: 'Introduction to Programming', offerings: [1, 2] },
  { id: '2', unit_code: 'SWE20001', unit_name: 'Development Project 1', offerings: [2] },
  { id: '3', unit_code: 'ICT10001', unit_name: 'Problem Solving with ICT', offerings: [] },
];
const renderModal = () => render(<UnitOfferingsModal isOpen onClose={jest.fn()} units={units} onRefresh={jest.fn()} />);
const heading = (name: RegExp) => screen.getByText(name).closest('div') as HTMLElement;

describe('UnitOfferingsModal', () => {
  test('every semester section starts closed: the headings and counts show, the unit rows do not', () => {
    renderModal();
    expect(screen.getByText('Semester 1 Offerings')).toBeTruthy();
    expect(screen.getByText('Semester 2 Offerings')).toBeTruthy();
    expect(screen.queryByText('COS10009')).toBeNull();
    expect(screen.queryByText('SWE20001')).toBeNull();
    expect(screen.queryByText('ICT10001')).toBeNull();
    expect(within(heading(/Semester 1 Offerings/)).getByText('1')).toBeTruthy();   // count is visible while closed
    expect(within(heading(/Semester 2 Offerings/)).getByText('2')).toBeTruthy();
  });

  test('clicking a heading opens only that section', () => {
    renderModal();
    fireEvent.click(screen.getByText('Semester 2 Offerings'));
    expect(screen.getByText('SWE20001')).toBeTruthy();
    expect(screen.queryByText('ICT10001')).toBeNull();
    fireEvent.click(screen.getByText('Semester 2 Offerings'));
    expect(screen.queryByText('SWE20001')).toBeNull();
  });

  test('Expand All opens every section and Collapse All closes them again', () => {
    renderModal();
    fireEvent.click(screen.getByText(/Expand All/));
    expect(screen.getAllByText('COS10009').length).toBe(2);       // offered in Sem 1 and Sem 2
    expect(screen.getByText('ICT10001')).toBeTruthy();            // unclassified section too
    fireEvent.click(screen.getByText(/Collapse All/));
    expect(screen.queryByText('COS10009')).toBeNull();
  });

  test('searching shows matches even though the sections are closed', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/search by unit code or name/i), { target: { value: 'swe20001' } });
    expect(screen.getByText('SWE20001')).toBeTruthy();
    expect(screen.queryByText('COS10009')).toBeNull();
  });

  test('renders nothing when closed', () => {
    const { container } = render(<UnitOfferingsModal isOpen={false} onClose={jest.fn()} units={units} onRefresh={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
