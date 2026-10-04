'use client';

// ============================================================
// A table that stays the same size however much is in it.
//
// The estimator used to render every unit and every student in one go, which is fine at 30 and unusable at
// 5,000: the page became one long scroll and the figure someone was looking for was somewhere in it. This
// pages the rows, searches them and sorts them, so 600 units take the same space on screen as 20 and any one
// of them is a few keystrokes away.
//
// Rows can expand in place to show their details, which keeps the drill-down next to the row it belongs to
// rather than in a second list further down the page.
// ============================================================

import { useMemo, useState, type ReactNode } from 'react';
import styles from './ui.module.css';

export interface Column<T> {
  key: string;
  label: string;
  /** Hover text explaining what the column means, for headings that need it. */
  hint?: string;
  align?: 'left' | 'right';
  /** A CSS grid track, e.g. '1fr' or '90px'. */
  width?: string;
  render: (row: T) => ReactNode;
  /** Makes the column sortable by clicking its heading. */
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Text a search box matches against. No search box without it. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  initialSort?: { key: string; direction: 'asc' | 'desc' };
  /** Content shown under a row when it is clicked. Rows are not clickable without it. */
  renderExpanded?: (row: T) => ReactNode;
  /** Extra controls beside the search box, such as filter buttons. */
  toolbar?: ReactNode;
  empty?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  searchPlaceholder = 'Search',
  pageSize = 25,
  initialSort,
  renderExpanded,
  toolbar,
  empty = 'Nothing to show.',
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState(initialSort ?? null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle && searchText ? rows.filter((row) => searchText(row).toLowerCase().includes(needle)) : rows;

    const column = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) return filtered;

    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = column.sortValue!(a);
      const y = column.sortValue!(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * direction;
    });
  }, [rows, columns, query, searchText, sort]);

  // Clamped rather than reset, so a search that shrinks the list never leaves the table on an empty page.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const shown = visible.slice(start, start + pageSize);

  const grid = { gridTemplateColumns: columns.map((c) => c.width ?? '1fr').join(' ') };

  const toggleSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    setSort((previous) =>
      previous?.key === column.key
        ? { key: column.key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: 'desc' },
    );
  };

  return (
    <div className={styles.table}>
      {(searchText || toolbar) && (
        <div className={styles.toolbar}>
          {searchText && (
            <input
              className={styles.search}
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            />
          )}
          {toolbar}
        </div>
      )}

      <div className={styles.grid}>
        <div className={`${styles.row} ${styles.head}`} style={grid}>
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              title={column.hint}
              className={`${styles.headCell} ${column.align === 'right' ? styles.right : ''} ${column.sortValue ? styles.sortable : ''}`}
              onClick={() => toggleSort(column)}
              disabled={!column.sortValue}
            >
              {column.label}
              {sort?.key === column.key && <span className={styles.sortMark}>{sort.direction === 'asc' ? '▲' : '▼'}</span>}
              {column.hint && <span className={styles.hintMark}>?</span>}
            </button>
          ))}
        </div>

        {shown.map((row) => {
          const key = rowKey(row);
          const isOpen = expanded === key;
          return (
            <div key={key} className={styles.rowGroup}>
              <div
                className={`${styles.row} ${renderExpanded ? styles.clickable : ''} ${isOpen ? styles.open : ''}`}
                style={grid}
                onClick={renderExpanded ? () => setExpanded(isOpen ? null : key) : undefined}
              >
                {columns.map((column) => (
                  <span key={column.key} className={`${styles.cell} ${column.align === 'right' ? styles.right : ''}`}>
                    {column.render(row)}
                  </span>
                ))}
              </div>
              {isOpen && renderExpanded && <div className={styles.expanded}>{renderExpanded(row)}</div>}
            </div>
          );
        })}

        {shown.length === 0 && <div className={styles.empty}>{query ? `Nothing matches “${query}”.` : empty}</div>}
      </div>

      {visible.length > pageSize && (
        <div className={styles.pager}>
          <span>
            {start + 1}–{Math.min(start + pageSize, visible.length)} of {visible.length.toLocaleString()}
          </span>
          <div className={styles.pagerButtons}>
            <button type="button" onClick={() => setPage(0)} disabled={current === 0}>«</button>
            <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0}>‹</button>
            <span>Page {current + 1} of {pageCount}</span>
            <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1}>›</button>
            <button type="button" onClick={() => setPage(pageCount - 1)} disabled={current >= pageCount - 1}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
