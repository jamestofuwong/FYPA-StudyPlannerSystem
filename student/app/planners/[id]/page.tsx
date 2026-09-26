'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { useCatalog } from '@student/components/CatalogProvider'
import type { SemesterBlock } from '@student/lib/types'
import Nav from '@student/components/Nav/Nav'
import SemesterTable from '@student/components/SemesterTable/SemesterTable'
import ElectivePool from '@student/components/ElectivePool/ElectivePool'
import styles from './page.module.css'

interface Props {
  params: Promise<{ id: string }>
}

const YEAR_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const STOP_WORDS = new Set(['of', 'the', 'and', 'in', 'for', 'a'])

function courseAbbrev(name: string): string {
  const words = name.split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase()))
  if (words.length === 0) return name.slice(0, 3).toUpperCase()
  const parts = words.map(w => w[0].toUpperCase())
  if (parts.length <= 2) parts[parts.length - 1] = words[words.length - 1].slice(0, 3)
  return parts.join('')
}

function majorAbbrev(name: string): string {
  const words = name.split(/\s+/)
  if (words.length === 1) return name.slice(0, 2).toUpperCase()
  return words.map(w => w[0].toUpperCase()).join('')
}

function semesterPeriod(
  intakeYear: number,
  intakeMonth: number,
  year: number,
  semester: number,
): string {
  const offset = (year - 1) * 12 + (semester - 1) * 5
  const total = (intakeMonth - 1) + offset
  return `${MONTH_NAMES[total % 12]} ${intakeYear + Math.floor(total / 12)}`
}

function groupByYear(semesters: SemesterBlock[]): Map<number, SemesterBlock[]> {
  const map = new Map<number, SemesterBlock[]>()
  for (const block of semesters) {
    const arr = map.get(block.year) ?? []
    arr.push(block)
    map.set(block.year, arr)
  }
  return map
}

export default function PlannerDetailPage({ params }: Props) {
  const { id } = use(params)
  const { plannersById } = useCatalog()
  const planner = plannersById[id]
  if (!planner) notFound()

  const byYear = groupByYear(planner.semesters)
  const allUnits = planner.semesters.flatMap(s => s.units)
  const mpuCount = allUnits.filter(u => u.category === 'mpu').length
  const hasPrescribedElectives = allUnits.some(u => u.category === 'prescribed_elective')
  const totalCp = planner.totalUnits * 12.5
  const { core, major, elective, wil } = planner.requirements

  const courseCode =
    courseAbbrev(planner.courseName) +
    (planner.majorName ? `-${majorAbbrev(planner.majorName)}` : '')

  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>

        {/* Breadcrumb */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/" className={styles.breadcrumbLink}>Study Planners</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>
            {planner.courseName}{planner.majorName ? ` (${planner.majorName})` : ''}
          </span>
        </nav>

        {/* Course header */}
        <header className={styles.header}>
          <h1 className={styles.courseName}>{planner.courseName}</h1>
          {planner.majorName && (
            <p className={styles.majorName}>{planner.majorName}</p>
          )}
          <div className={styles.headerMeta}>
            <span className={styles.courseCode}>{courseCode}</span>
            <span className={styles.intake}>Intake: {planner.intakeLabel}</span>
          </div>
          <hr className={styles.rule} />
        </header>

        {/* Two-column layout */}
        <div className={styles.contentGrid}>

          {/* LEFT: Year sections */}
          <section aria-label="Study plan by year">
            {[...byYear.entries()].map(([year, blocks]) => (
              <div key={year}>
                <h2 className={styles.yearHeading}>
                  Year {YEAR_WORDS[year - 1] ?? year}
                </h2>
                {blocks.map(block => (
                  <SemesterTable
                    key={`${block.year}-${block.semester}`}
                    block={block}
                    periodLabel={semesterPeriod(
                      planner.intakeYear,
                      planner.intakeMonth,
                      block.year,
                      block.semester,
                    )}
                  />
                ))}
              </div>
            ))}

            {/* Prescribed elective footnote */}
            {hasPrescribedElectives && (
              <p className={styles.footnote}>
                <span className={styles.footnoteMark}>*</span>
                Prescribed elective — compulsory for your course and cannot be substituted with a free elective.
              </p>
            )}

            {/* Elective pool */}
            {planner.electivePool.length > 0 && (
              <div className={styles.poolSection}>
                <h3 className={styles.poolTitle}>Elective Pool</h3>
                <p className={styles.poolSubtitle}>
                  Choose from the following units to fill your open elective slots.
                </p>
                <ElectivePool units={planner.electivePool} />
              </div>
            )}
          </section>

          {/* RIGHT: Sidebar */}
          <aside className={styles.sidebar} aria-label="Course information">

            {/* Course Information */}
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarTitle}>Course Information</div>
              <div className={styles.totalUnits}>{planner.totalUnits} units total</div>
              <div className={styles.totalCp}>{totalCp} credit points</div>
              <hr className={styles.divider} />

              {core.count !== null && (
                <div className={`${styles.reqRow} ${styles.reqRowCore}`}>
                  <span className={styles.reqLabel}>Core Units</span>
                  <span className={styles.reqDetail}>
                    <strong>{core.count}</strong> units · <strong>{core.count * 12.5}</strong> cp
                  </span>
                </div>
              )}
              {major.count !== null && (
                <div className={`${styles.reqRow} ${styles.reqRowMajor}`}>
                  <span className={styles.reqLabel}>Major Core</span>
                  <span className={styles.reqDetail}>
                    <strong>{major.count}</strong> units · <strong>{major.count * 12.5}</strong> cp
                  </span>
                </div>
              )}
              {elective.count !== null && (
                <div className={`${styles.reqRow} ${styles.reqRowElective}`}>
                  <span className={styles.reqLabel}>Elective</span>
                  <span className={styles.reqDetail}>
                    <strong>{elective.count}</strong> units · <strong>{elective.count * 12.5}</strong> cp
                  </span>
                </div>
              )}
              {wil.count !== null && (
                <div className={`${styles.reqRow} ${styles.reqRowWil}`}>
                  <span className={styles.reqLabel}>WIL</span>
                  <span className={styles.reqDetail}>
                    <strong>{wil.count}</strong> {wil.count === 1 ? 'unit' : 'units'} · <strong>{wil.count * 12.5}</strong> cp
                  </span>
                </div>
              )}
              {mpuCount > 0 && (
                <div className={`${styles.reqRow} ${styles.reqRowMpu}`}>
                  <span className={styles.reqLabel}>MPU</span>
                  <span className={styles.reqDetail}>
                    <strong>{mpuCount}</strong> {mpuCount === 1 ? 'unit' : 'units'}
                  </span>
                </div>
              )}
            </div>

            {/* How to use */}
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarTitle}>How to use this planner</div>
              <p className={styles.howToUseText}>
                Units are listed in a recommended sequence. This may be amended depending on unit availability and timetabling. Consult your academic advisor before making changes.
              </p>
            </div>

          </aside>
        </div>

      </main>
    </div>
  )
}
