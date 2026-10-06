/** @jest-environment jsdom */
// ============================================================
// Tests for the paged table the class estimator uses for every list it shows.
//
// The point of it is that a list takes the same space whatever its length: the estimator used to render 600
// units or 5,000 students all at once. So these check that only one page is ever rendered, and that search,
// sorting and paging still reach every row.
// ============================================================

import React from 'react';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { DataTable, type Column } from '@/app/(pages)/class-estimation/components/DataTable';

type Unit = { code: string; headcount: number };

const units: Unit[] = Array.from({ length: 600 }, (_, i) => ({
  code: `UNIT${String(i).padStart(3, '0')}`,
  headcount: (i * 37) % 251,
}));

const columns: Column<Unit>[] = [
  { key: 'code', label: 'Unit', render: (u) => u.code, sortValue: (u) => u.code },
  { key: 'headcount', label: 'Headcount', render: (u) => u.headcount, sortValue: (u) => u.headcount },
];

function renderTable(extra: Partial<React.ComponentProps<typeof DataTable<Unit>>> = {}) {
  return render(
    <DataTable<Unit>
      rows={units}
      columns={columns}
      rowKey={(u) => u.code}
      searchText={(u) => u.code}
      pageSize={25}
      {...extra}
    />,
  );
}

/** Unit codes currently on screen, in order. */
const shownCodes = () => screen.queryAllByText(/^UNIT\d{3}$/).map((el) => el.textContent);

describe('DataTable', () => {
  afterEach(cleanup);

  test('renders one page, however many rows there are', () => {
    renderTable();
    expect(shownCodes()).toHaveLength(25);
    expect(screen.getByText('1–25 of 600')).toBeTruthy();
    expect(screen.getByText('Page 1 of 24')).toBeTruthy();
  });

  test('pages forward and to the end', () => {
    renderTable();
    fireEvent.click(screen.getByText('›'));
    expect(shownCodes()[0]).toBe('UNIT025');
    fireEvent.click(screen.getByText('»'));
    expect(shownCodes()).toEqual(units.slice(575).map((u) => u.code));
  });

  test('search reaches rows on any page', () => {
    renderTable();
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'unit599' } });
    expect(shownCodes()).toEqual(['UNIT599']);
  });

  // A search that shrinks the list must not strand the table on a page that no longer exists.
  test('a search from a later page lands back on results, not an empty page', () => {
    renderTable();
    fireEvent.click(screen.getByText('»'));
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'UNIT00' } });
    expect(shownCodes()).toHaveLength(10);
  });

  test('says when nothing matches', () => {
    renderTable();
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'nothing' } });
    expect(screen.getByText('Nothing matches “nothing”.')).toBeTruthy();
  });

  test('sorts by a column across every page, not just the visible one', () => {
    renderTable();
    fireEvent.click(screen.getByText('Headcount'));          // first click sorts descending
    const largest = Math.max(...units.map((u) => u.headcount));
    const firstRow = screen.getByText(shownCodes()[0]!).parentElement!.parentElement!;
    expect(within(firstRow).getByText(String(largest))).toBeTruthy();

    fireEvent.click(screen.getByText('Headcount'));          // second click flips it
    const smallestRow = screen.getByText(shownCodes()[0]!).parentElement!.parentElement!;
    expect(within(smallestRow).getByText(String(Math.min(...units.map((u) => u.headcount))))).toBeTruthy();
  });

  test('starts in the sort it is given', () => {
    renderTable({ initialSort: { key: 'code', direction: 'desc' } });
    expect(shownCodes()[0]).toBe('UNIT599');
  });

  test('a row opens to show its detail, and closes again', () => {
    renderTable({ renderExpanded: (u) => <div>detail for {u.code}</div> });
    fireEvent.click(screen.getByText('UNIT000'));
    expect(screen.getByText('detail for UNIT000')).toBeTruthy();
    fireEvent.click(screen.getByText('UNIT000'));
    expect(screen.queryByText('detail for UNIT000')).toBeNull();
  });

  test('a short list has no pager at all', () => {
    render(<DataTable<Unit> rows={units.slice(0, 5)} columns={columns} rowKey={(u) => u.code} pageSize={25} />);
    expect(shownCodes()).toHaveLength(5);
    expect(screen.queryByText(/Page \d+ of/)).toBeNull();
  });

  test('an empty list shows its empty message', () => {
    render(<DataTable<Unit> rows={[]} columns={columns} rowKey={(u) => u.code} empty="No units yet." />);
    expect(screen.getByText('No units yet.')).toBeTruthy();
  });
});
