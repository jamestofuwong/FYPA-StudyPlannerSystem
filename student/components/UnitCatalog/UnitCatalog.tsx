'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { UnitListing } from '@student/lib/types'
import styles from './UnitCatalog.module.css'

interface Props {
  units: UnitListing[]
}

const PAGE_SIZE = 15
const LEVELS = [1, 2, 3, 4]

function unitLevel(code: string): number {
  const match = code.match(/\d/)
  return match ? parseInt(match[0]) : 0
}

function pageRange(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

export default function UnitCatalog({ units }: Props) {
  const router = useRouter()
  const [query, setQuery]           = useState('')
  const [activeLevel, setActiveLevel] = useState<number | null>(null)
  const [page, setPage]             = useState(1)

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [query, activeLevel])

  const filtered = useMemo(() => {
    let result = units
    if (activeLevel !== null) {
      result = result.filter(u => unitLevel(u.code) === activeLevel)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        u =>
          u.code.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          (u.prerequisites?.some(p => p.toLowerCase().includes(q)) ?? false),
      )
    }
    return result
  }, [units, query, activeLevel])

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div>
      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search by code or unit name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search units"
          />
          {query && (
            <button
              className={styles.searchClear}
              onClick={() => setQuery('')}
              type="button"
              aria-label="Clear search"
            >✕</button>
          )}
        </div>

        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Year level</span>
          <div className={styles.filters} role="group" aria-label="Filter by year level">
            <button
              type="button"
              className={`${styles.chip} ${activeLevel === null ? styles.chipActive : ''}`}
              onClick={() => setActiveLevel(null)}
            >All</button>
            {LEVELS.map(level => (
              <button
                key={level}
                type="button"
                className={`${styles.chip} ${activeLevel === level ? styles.chipActive : ''}`}
                onClick={() => setActiveLevel(activeLevel === level ? null : level)}
              >Year {level}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className={styles.resultsCount}>
        {filtered.length} {filtered.length === 1 ? 'unit' : 'units'}
        {query || activeLevel !== null ? ' found' : ' available'}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No units found</p>
          <p className={styles.emptySubtitle}>Try adjusting your search or filter.</p>
          <button
            className={styles.emptyReset}
            onClick={() => { setQuery(''); setActiveLevel(null) }}
            type="button"
          >Clear filters</button>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.colHeaderRow}>
                  <th className={styles.colCode}>Unit Code</th>
                  <th className={styles.colName}>Unit Name</th>
                  <th className={styles.colPrereq}>Pre-requisites</th>
                  <th className={styles.colAvail}>Availability</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(unit => (
                  <tr
                    key={unit.code}
                    className={styles.unitRow}
                    onClick={() => router.push(`/units/${unit.code}`)}
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/units/${unit.code}`) }}
                    role="link"
                    aria-label={`View ${unit.name}`}
                  >
                    <td className={styles.cellCode}>{unit.code}</td>
                    <td className={styles.cellName}>{unit.name}</td>
                    <td className={styles.cellPrereq}>
                      {unit.prerequisites && unit.prerequisites.length > 0
                        ? unit.prerequisites.join(', ')
                        : 'Nil'}
                    </td>
                    <td className={styles.cellAvail}>
                      <span className={styles.availText}>
                        {unit.availability && unit.availability.length > 0
                          ? unit.availability.join(' · ')
                          : '—'}
                      </span>
                      <span className={styles.viewHint} aria-hidden="true">View unit →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Pagination">
              <button
                className={styles.navBtn}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >&#8249;</button>

              {pageRange(currentPage, totalPages).map((item, i) =>
                item === '…' ? (
                  <span key={`ellipsis-${i}`} className={styles.pageEllipsis}>…</span>
                ) : (
                  <button
                    key={item}
                    className={`${styles.pageNum} ${item === currentPage ? styles.pageNumActive : ''}`}
                    onClick={() => setPage(item as number)}
                    aria-label={`Page ${item}`}
                    aria-current={item === currentPage ? 'page' : undefined}
                  >{item}</button>
                )
              )}

              <button
                className={styles.navBtn}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >&#8250;</button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
