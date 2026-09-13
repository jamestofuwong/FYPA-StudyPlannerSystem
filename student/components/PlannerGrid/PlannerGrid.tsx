'use client'

import { useState, useMemo } from 'react'
import type { PlannerSummary } from '@student/lib/types'
import PlannerCard from '@student/components/PlannerCard/PlannerCard'
import styles from './PlannerGrid.module.css'

interface Props {
  planners: PlannerSummary[]
}

export default function PlannerGrid({ planners }: Props) {
  const [query, setQuery] = useState('')
  const [activeCourse, setActiveCourse] = useState<string | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)

  // Derive unique course names and intake years from the data for filter chips
  const courseNames = useMemo(
    () => [...new Set(planners.map(p => p.courseName))].sort(),
    [planners]
  )
  const intakeYears = useMemo(
    () => [...new Set(planners.map(p => p.intakeYear))].sort((a, b) => b - a),
    [planners]
  )

  const filtered = useMemo(() => {
    let result = planners
    if (activeCourse) {
      result = result.filter(p => p.courseName === activeCourse)
    }
    if (activeYear !== null) {
      result = result.filter(p => p.intakeYear === activeYear)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter(
        p =>
          p.courseName.toLowerCase().includes(q) ||
          (p.majorName?.toLowerCase().includes(q) ?? false) ||
          p.intakeLabel.toLowerCase().includes(q)
      )
    }
    return result
  }, [planners, query, activeCourse, activeYear])

  return (
    <div>
      {/* Controls */}
      <div className={styles.controls}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search by course or major…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search planners"
          />
          {query && (
            <button
              className={styles.searchClear}
              onClick={() => setQuery('')}
              type="button"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className={styles.filterGroups}>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Course</span>
            <div className={styles.filters} role="group" aria-label="Filter by course">
              <button
                type="button"
                className={`${styles.chip} ${activeCourse === null ? styles.chipActive : ''}`}
                onClick={() => setActiveCourse(null)}
              >
                All
              </button>
              {courseNames.map(name => (
                <button
                  key={name}
                  type="button"
                  className={`${styles.chip} ${activeCourse === name ? styles.chipActive : ''}`}
                  onClick={() => setActiveCourse(activeCourse === name ? null : name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Year</span>
            <div className={styles.filters} role="group" aria-label="Filter by intake year">
              <button
                type="button"
                className={`${styles.chip} ${activeYear === null ? styles.chipActive : ''}`}
                onClick={() => setActiveYear(null)}
              >
                All
              </button>
              {intakeYears.map(year => (
                <button
                  key={year}
                  type="button"
                  className={`${styles.chip} ${activeYear === year ? styles.chipActive : ''}`}
                  onClick={() => setActiveYear(activeYear === year ? null : year)}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className={styles.resultsCount}>
        {filtered.length} {filtered.length === 1 ? 'planner' : 'planners'}
        {query || activeCourse || activeYear ? ' found' : ' available'}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No planners found</p>
          <p className={styles.emptySubtitle}>Try adjusting your search or filter.</p>
          <button className={styles.emptyReset} onClick={() => { setQuery(''); setActiveCourse(null); setActiveYear(null) }} type="button">
            Clear filters
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(planner => (
            <PlannerCard key={planner.id} planner={planner} />
          ))}
        </div>
      )}
    </div>
  )
}
