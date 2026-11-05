'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import dialogStyles from '../units/UnitForm.module.css'
import styles from './page.module.css'

interface PlannerRow {
  id: string
  courseName: string
  courseCode: string | null
  majorName: string | null
  intakeYear: number
  intakeMonth: number | null
  durationSemesters: number | null
}

interface Props {
  planners: PlannerRow[]
  /** False for a view-only account: no delete. */
  canEdit?: boolean
  deletePlanner: (id: string) => Promise<void>
}

const MONTH_NAMES: Record<number, string> = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April',
  5: 'May', 6: 'June', 7: 'July', 8: 'August',
  9: 'September', 10: 'October', 11: 'November', 12: 'December',
}

type PageItem = number | 'ellipsis'

function getPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total]
  if (current >= total - 3) return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total]
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
}

const PAGE_SIZES = [10, 20, 50]

export default function PlannersList({ planners, deletePlanner, canEdit = true }: Props) {
  const [query, setQuery] = useState('')
  const [activeCourse, setActiveCourse] = useState<string | null>(null)
  const [activeMajor, setActiveMajor] = useState<string | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<PlannerRow | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const courseNames = useMemo(() => [...new Set(planners.map(planner => planner.courseName))].sort(), [planners])
  const majorNames = useMemo(() => [...new Set(
    planners
      .filter(planner => !activeCourse || planner.courseName === activeCourse)
      .map(planner => planner.majorName ?? 'No major'),
  )].sort(), [planners, activeCourse])
  const intakeYears = useMemo(() => [...new Set(planners.map(planner => planner.intakeYear))].sort((a, b) => b - a), [planners])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return planners.filter(planner => {
      const majorName = planner.majorName ?? 'No major'
      const intakeLabel = `${planner.intakeMonth ? MONTH_NAMES[planner.intakeMonth] ?? `Month ${planner.intakeMonth}` : 'No month'} ${planner.intakeYear}`
      return (!activeCourse || planner.courseName === activeCourse) &&
        (!activeMajor || majorName === activeMajor) &&
        (activeYear === null || planner.intakeYear === activeYear) &&
        (!normalizedQuery || (planner.courseCode?.toLowerCase().includes(normalizedQuery) ?? false) || planner.courseName.toLowerCase().includes(normalizedQuery) || majorName.toLowerCase().includes(normalizedQuery) || intakeLabel.toLowerCase().includes(normalizedQuery))
    })
  }, [planners, query, activeCourse, activeMajor, activeYear])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const visiblePlanners = filtered.slice(pageStart, pageStart + pageSize)
  const hasActiveFilters = Boolean(query.trim() || activeCourse || activeMajor || activeYear !== null)

  function clearFilters() {
    setQuery('')
    setActiveCourse(null)
    setActiveMajor(null)
    setActiveYear(null)
    setPage(1)
  }

  function toggleCourse(course: string | null) {
    setActiveCourse(activeCourse === course ? null : course)
    setActiveMajor(null)
    setPage(1)
  }

  function closeDeleteDialog() {
    if (deletePending) return
    setDeleteTarget(null)
    setDeleteError(false)
  }

  async function confirmDelete() {
    if (!deleteTarget || deletePending) return
    setDeletePending(true)
    setDeleteError(false)
    let succeeded = false
    try {
      await deletePlanner(deleteTarget.id)
      succeeded = true
    } catch (error) {
      succeeded = error instanceof Error && error.message.includes('NEXT_REDIRECT')
      if (!succeeded) {
        setDeleteError(true)
      }
    } finally {
      setDeletePending(false)
    }
    if (succeeded) {
      setDeleteTarget(null)
      setDeleteError(false)
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
            placeholder="Search by course code, course, major, or intake..."
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1) }}
            aria-label="Search planners by course code, course, major, or intake"
          />
          {query && <button type="button" className={styles.searchClear} onClick={() => { setQuery(''); setPage(1) }} aria-label="Clear search">✕</button>}
        </div>

        <div className={styles.filterGroups}>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Course</span>
            <div className={styles.filters} role="group" aria-label="Filter planners by course">
              <button type="button" aria-pressed={activeCourse === null} className={`${styles.chip} ${activeCourse === null ? styles.chipActive : ''}`} onClick={() => toggleCourse(null)}>All</button>
              {courseNames.map(course => <button key={course} type="button" aria-pressed={activeCourse === course} className={`${styles.chip} ${activeCourse === course ? styles.chipActive : ''}`} onClick={() => toggleCourse(course)}>{course}</button>)}
            </div>
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Major</span>
            <div className={styles.filters} role="group" aria-label="Filter planners by major">
              <button type="button" aria-pressed={activeMajor === null} className={`${styles.chip} ${activeMajor === null ? styles.chipActive : ''}`} onClick={() => { setActiveMajor(null); setPage(1) }}>All</button>
              {majorNames.map(major => <button key={major} type="button" aria-pressed={activeMajor === major} className={`${styles.chip} ${activeMajor === major ? styles.chipActive : ''}`} onClick={() => { setActiveMajor(activeMajor === major ? null : major); setPage(1) }}>{major}</button>)}
            </div>
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Intake year</span>
            <div className={styles.filters} role="group" aria-label="Filter planners by intake year">
              <button type="button" aria-pressed={activeYear === null} className={`${styles.chip} ${activeYear === null ? styles.chipActive : ''}`} onClick={() => { setActiveYear(null); setPage(1) }}>All</button>
              {intakeYears.map(year => <button key={year} type="button" aria-pressed={activeYear === year} className={`${styles.chip} ${activeYear === year ? styles.chipActive : ''}`} onClick={() => { setActiveYear(activeYear === year ? null : year); setPage(1) }}>{year}</button>)}
            </div>
          </div>
        </div>
        {hasActiveFilters && <button type="button" className={styles.clearFiltersButton} onClick={clearFilters}>Clear Filters</button>}
      </div>

      <p className={styles.resultsCount}>
        {filtered.length === 0
          ? `0 planners${query.trim() || activeCourse || activeMajor || activeYear !== null ? ' found' : ' available'}`
          : `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length} ${filtered.length === 1 ? 'planner' : 'planners'}`}
      </p>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{planners.length === 0 ? 'No planner templates have been added yet.' : 'No planner templates match your search or filters.'}</p>
          {planners.length > 0 && <p className={styles.emptySubtitle}>Adjust your search or clear the filters to see more planner templates.</p>}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Code</th>
                <th className={styles.th}>Course</th>
                <th className={styles.th}>Major</th>
                <th className={styles.th}>Intake</th>
                <th className={styles.th}>Duration</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlanners.map(planner => {
                const monthName = planner.intakeMonth ? MONTH_NAMES[planner.intakeMonth] : null
                return (
                  <tr key={planner.id} className={styles.tr}>
                    <td className={styles.td}>{planner.courseCode?.trim() || 'No information'}</td>
                    <td className={styles.td}>{planner.courseName.trim() || 'No information'}</td>
                    <td className={styles.td}>{planner.majorName?.trim() || 'No information'}</td>
                    <td className={styles.td}>{monthName ? `${monthName} ${planner.intakeYear}` : 'No information'}</td>
                    <td className={styles.td}>{planner.durationSemesters === null ? 'No information' : `${Math.ceil(planner.durationSemesters / 2)} years`}</td>
                    <td className={styles.td}>
                      <div className={styles.rowActions}>
                        <Link href={`/cms/planners/${planner.id}`} className={styles.btnSecondary}>{canEdit ? 'Edit' : 'View'}</Link>
                        {canEdit && <button type="button" className={styles.btnDanger} onClick={() => { setDeleteTarget(planner); setDeleteError(false) }}>Delete</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className={styles.pagination}>
          <label className={styles.rowsPerPage}>
            Rows per page
            <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }} aria-label="Planners per page">
              {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          {totalPages > 1 && (
            <nav className={styles.paginationNav} aria-label="Planner list pages">
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
            aria-labelledby="delete-planner-title"
            aria-describedby="delete-planner-description"
            onKeyDown={event => event.key === 'Escape' && closeDeleteDialog()}
          >
            <header className={dialogStyles.dialogHeader}>
              <h2 id="delete-planner-title">Delete planner template?</h2>
            </header>
            <p id="delete-planner-description">
              {deleteTarget.courseName} / {deleteTarget.majorName ?? 'No major'} /{' '}
              {deleteTarget.intakeMonth ? MONTH_NAMES[deleteTarget.intakeMonth] ?? `Month ${deleteTarget.intakeMonth}` : 'No month'}{' '}
              {deleteTarget.intakeYear}. This action cannot be undone.
            </p>
            {deleteError && (
              <div className={styles.deleteError} role="alert">
                <strong>Unable to delete planner template</strong>
                <p>Please try again. The planner template has not been deleted.</p>
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
