'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PlannerSummary } from '@student/lib/types'
import PlannerCard from '@student/components/PlannerCard/PlannerCard'
import styles from './PlannerGrid.module.css'

interface Props {
  planners: PlannerSummary[]
}

const FILTER_CACHE_KEY = 'study-planner-filters'

interface CachedFilters {
  query?: string
  activeCourse?: string | null
  activeMajor?: string | null
  activeYear?: number | null
}

function readCachedFilters(): CachedFilters {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(FILTER_CACHE_KEY)
    return raw ? JSON.parse(raw) as CachedFilters : {}
  } catch {
    return {}
  }
}

export default function PlannerGrid({ planners }: Props) {
  const [query, setQuery] = useState('')
  const [activeCourse, setActiveCourse] = useState<string | null>(null)
  const [activeMajor, setActiveMajor] = useState<string | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [cacheReady, setCacheReady] = useState(false)

  const courseNames = useMemo(
    () => [...new Set(planners.map(p => p.courseName))].sort(),
    [planners],
  )

  const majorNames = useMemo(
    () => [
      ...new Set(
        planners
          .filter(p => !activeCourse || p.courseName === activeCourse)
          .map(p => p.majorName ?? 'No major'),
      ),
    ].sort(),
    [planners, activeCourse],
  )

  const intakeYears = useMemo(
    () => [...new Set(planners.map(p => p.intakeYear))].sort((a, b) => b - a),
    [planners],
  )

  useEffect(() => {
    const cachedFilters = readCachedFilters()
    setQuery(cachedFilters.query ?? '')
    setActiveCourse(cachedFilters.activeCourse ?? null)
    setActiveMajor(cachedFilters.activeMajor ?? null)
    setActiveYear(typeof cachedFilters.activeYear === 'number' ? cachedFilters.activeYear : null)
    setCacheReady(true)
  }, [])

  useEffect(() => {
    if (activeCourse !== null && !courseNames.includes(activeCourse)) {
      setActiveCourse(null)
      setActiveMajor(null)
      return
    }
    if (activeMajor !== null && !majorNames.includes(activeMajor)) {
      setActiveMajor(null)
      return
    }
    if (activeYear !== null && !intakeYears.includes(activeYear)) {
      setActiveYear(null)
    }
  }, [activeCourse, activeMajor, activeYear, courseNames, majorNames, intakeYears])

  useEffect(() => {
    if (!cacheReady) return
    try {
      sessionStorage.setItem(FILTER_CACHE_KEY, JSON.stringify({
        query,
        activeCourse,
        activeMajor,
        activeYear,
      }))
    } catch {
      // Ignore private-mode or quota failures.
    }
  }, [cacheReady, query, activeCourse, activeMajor, activeYear])

  const filtered = useMemo(() => {
    let result = planners

    if (activeCourse) {
      result = result.filter(p => p.courseName === activeCourse)
    }
    if (activeMajor) {
      result = result.filter(p => (p.majorName ?? 'No major') === activeMajor)
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
          p.intakeLabel.toLowerCase().includes(q),
      )
    }

    return result
  }, [planners, query, activeCourse, activeMajor, activeYear])

  function toggleCourse(name: string | null) {
    setActiveCourse(activeCourse === name ? null : name)
    setActiveMajor(null)
  }

  function clearFilters() {
    setQuery('')
    setActiveCourse(null)
    setActiveMajor(null)
    setActiveYear(null)
  }

  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search by course or major..."
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
              x
            </button>
          )}
        </div>

        <div className={styles.filterGroups}>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Course</span>
            <div className={styles.filters} role="group" aria-label="Filter by course">
              <button
                type="button"
                className={`${styles.chip} ${activeCourse === null ? styles.chipActive : ''}`}
                onClick={() => toggleCourse(null)}
              >
                All
              </button>
              {courseNames.map(name => (
                <button
                  key={name}
                  type="button"
                  className={`${styles.chip} ${activeCourse === name ? styles.chipActive : ''}`}
                  onClick={() => toggleCourse(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Major</span>
            <div className={styles.filters} role="group" aria-label="Filter by major">
              <button
                type="button"
                className={`${styles.chip} ${activeMajor === null ? styles.chipActive : ''}`}
                onClick={() => setActiveMajor(null)}
              >
                All
              </button>
              {majorNames.map(name => (
                <button
                  key={name}
                  type="button"
                  className={`${styles.chip} ${activeMajor === name ? styles.chipActive : ''}`}
                  onClick={() => setActiveMajor(activeMajor === name ? null : name)}
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

      <p className={styles.resultsCount}>
        {filtered.length} {filtered.length === 1 ? 'planner' : 'planners'}
        {query || activeCourse || activeMajor || activeYear ? ' found' : ' available'}
      </p>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No planners found</p>
          <p className={styles.emptySubtitle}>Try adjusting your search or filter.</p>
          <button className={styles.emptyReset} onClick={clearFilters} type="button">
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
