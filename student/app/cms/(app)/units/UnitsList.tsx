'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import dialogStyles from './UnitForm.module.css'
import styles from './page.module.css'

interface UnitRow {
  id: string
  unit_code: string
  unit_name: string
  year_level: number
  credit_points: string
}

interface Props {
  units: UnitRow[]
  /** False for a view-only account: no delete and no add. */
  canEdit?: boolean
  deleteUnit: (id: string) => Promise<
    | { success: true }
    | { success: false; reason: 'in_use' | 'failed' }
  >
}

type PageItem = number | 'ellipsis'

function getPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total]
  if (current >= total - 3) return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total]
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
}

const PAGE_SIZES = [10, 20, 50]

export default function UnitsList({ units, deleteUnit, canEdit = true }: Props) {
  const [query, setQuery] = useState('')
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<UnitRow | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<'in_use' | 'failed' | null>(null)
  const yearLevels = useMemo(() => [...new Set(units.map(unit => unit.year_level))].sort((a, b) => a - b), [units])
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return units.filter(unit =>
      (activeYear === null || unit.year_level === activeYear) &&
      (!normalizedQuery || unit.unit_code.toLowerCase().includes(normalizedQuery) || unit.unit_name.toLowerCase().includes(normalizedQuery)),
    )
  }, [units, query, activeYear])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const visibleUnits = filtered.slice(pageStart, pageStart + pageSize)
  const hasActiveFilters = Boolean(query.trim() || activeYear !== null)

  function clearFilters() {
    setQuery('')
    setActiveYear(null)
    setPage(1)
  }

  function closeDeleteDialog() {
    if (deletePending) return
    setDeleteTarget(null)
    setDeleteError(null)
  }

  async function confirmDelete() {
    if (!deleteTarget || deletePending) return
    setDeletePending(true)
    setDeleteError(null)
    try {
      const result = await deleteUnit(deleteTarget.id)
      if (result.success) {
        setDeleteTarget(null)
      } else {
        setDeleteError(result.reason)
      }
    } catch {
      setDeleteError('failed')
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <>
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search by code or unit name..."
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1) }}
            aria-label="Search units by code or name"
          />
          {query && <button type="button" className={styles.searchClear} onClick={() => { setQuery(''); setPage(1) }} aria-label="Clear search">✕</button>}
        </div>
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Year level</span>
          <div className={styles.filters} role="group" aria-label="Filter units by year level">
            <button type="button" aria-pressed={activeYear === null} className={`${styles.chip} ${activeYear === null ? styles.chipActive : ''}`} onClick={() => { setActiveYear(null); setPage(1) }}>All</button>
            {yearLevels.map(year => (
              <button key={year} type="button" aria-pressed={activeYear === year} className={`${styles.chip} ${activeYear === year ? styles.chipActive : ''}`} onClick={() => { setActiveYear(activeYear === year ? null : year); setPage(1) }}>Year {year}</button>
            ))}
          </div>
        </div>
        {hasActiveFilters && <button type="button" className={styles.clearFiltersButton} onClick={clearFilters}>Clear Filters</button>}
      </div>

      <p className={styles.resultsCount}>
        {filtered.length === 0
          ? `0 units${query.trim() || activeYear !== null ? ' found' : ' available'}`
          : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length} ${filtered.length === 1 ? 'unit' : 'units'}`}
      </p>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{units.length === 0 ? 'No units have been added yet.' : 'No units match your search or filters.'}</p>
          <p className={styles.emptySubtitle}>{units.length === 0 ? 'Add a unit to get started.' : 'Adjust your search or clear the filters to see more units.'}</p>
          {canEdit && units.length === 0 && <Link href="/cms/units/new" className={styles.btnSecondary}>Add the first unit</Link>}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Code</th>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Year</th>
              <th className={styles.th}>CP</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleUnits.map(unit => (
              <tr key={unit.id} className={styles.tr}>
                <td className={`${styles.td} ${styles.codeCell}`}>{unit.unit_code}</td>
                <td className={styles.td}>{unit.unit_name}</td>
                <td className={styles.td}>Year {unit.year_level}</td>
                <td className={styles.td}>{unit.credit_points}</td>
                <td className={styles.td}>
                  <div className={styles.rowActions}>
                    <Link href={`/cms/units/${unit.id}`} className={styles.btnSecondary}>{canEdit ? 'Edit' : 'View'}</Link>
                    {canEdit && <button type="button" className={styles.btnDanger} onClick={() => { setDeleteTarget(unit); setDeleteError(null) }}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {filtered.length > 0 && (
        <div className={styles.pagination}>
          <label className={styles.rowsPerPage}>
            Rows per page
            <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }} aria-label="Units per page">
              {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          {totalPages > 1 && (
            <nav className={styles.paginationNav} aria-label="Unit list pages">
              <button type="button" className={styles.pageButton} onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">Previous</button>
              {getPageItems(currentPage, totalPages).map((item, index) => item === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className={styles.pageEllipsis} aria-hidden="true">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`${styles.pageButton} ${currentPage === item ? styles.pageButtonActive : ''}`}
                  onClick={() => setPage(item)}
                  aria-label={`Go to page ${item}`}
                  aria-current={currentPage === item ? 'page' : undefined}
                >{item}</button>
              ))}
              <button type="button" className={styles.pageButton} onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page">Next</button>
            </nav>
          )}
        </div>
      )}

      {deleteTarget && (
        <div
          className={dialogStyles.dialogOverlay}
          role="presentation"
          onMouseDown={event => event.target === event.currentTarget && closeDeleteDialog()}
        >
          <section
            className={dialogStyles.resultDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-unit-title"
            aria-describedby="delete-unit-description"
            onKeyDown={event => event.key === 'Escape' && closeDeleteDialog()}
          >
            <header className={dialogStyles.dialogHeader}>
              <h2 id="delete-unit-title">Delete {deleteTarget.unit_code}?</h2>
            </header>
            <p id="delete-unit-description">This unit will be removed from the CMS. If it is currently used by a planner template, it cannot be deleted.</p>
            {deleteError && (
              <div className={styles.deleteError} role="alert">
                <strong>Unable to delete unit</strong>
                <p>{deleteError === 'in_use'
                  ? 'This unit is currently used by one or more planner templates. Remove those references before deleting the unit.'
                  : 'Unable to delete this unit. Please try again.'}</p>
              </div>
            )}
            <footer className={dialogStyles.dialogActions}>
              <button type="button" className={styles.btnSecondary} onClick={closeDeleteDialog} disabled={deletePending} autoFocus>Cancel</button>
              <button type="button" className={styles.btnDanger} onClick={confirmDelete} disabled={deletePending}>
                {deletePending ? 'Deleting...' : 'Delete'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
