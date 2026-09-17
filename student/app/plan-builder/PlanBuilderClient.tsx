'use client'

import { useState, useRef, useEffect } from 'react'
import { MOCK_UNITS } from '@student/lib/data/units-mock'
import { generatePlan } from '@student/lib/plan-builder'
import type { GenerationResult } from '@student/lib/plan-builder'
import type { PlannerCourseOption } from '@student/lib/planners'
import type { SemesterBlock } from '@student/lib/types'
import SemesterTable from '@student/components/SemesterTable/SemesterTable'
import ElectivePool from '@student/components/ElectivePool/ElectivePool'
import styles from './PlanBuilderClient.module.css'

const YEAR_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

const MONTH_OPTIONS = [
  { value: 1,  label: 'January'   },
  { value: 2,  label: 'February'  },
  { value: 3,  label: 'March'     },
  { value: 4,  label: 'April'     },
  { value: 5,  label: 'May'       },
  { value: 6,  label: 'June'      },
  { value: 7,  label: 'July'      },
  { value: 8,  label: 'August'    },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October'   },
  { value: 11, label: 'November'  },
  { value: 12, label: 'December'  },
]

interface CompletedSemester {
  id: string
  unitCodes: string[]
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

interface Props {
  plannerOptions: PlannerCourseOption[]
}

export default function PlanBuilderClient({ plannerOptions }: Props) {
  // ── Config ──
  const [selectedCourseId, setSelectedCourseId]   = useState('')
  const [selectedPlannerId, setSelectedPlannerId] = useState('')
  const [intakeYear, setIntakeYear]               = useState(new Date().getFullYear())
  const [intakeMonth, setIntakeMonth]             = useState(3)

  // ── Completed semesters ──
  const semCounter = useRef(1)
  const [completedSemesters, setCompletedSemesters] = useState<CompletedSemester[]>([
    { id: 'sem-1', unitCodes: [] },
  ])
  // Which semester's inline search is open
  const [activeAddSem, setActiveAddSem] = useState<string | null>(null)
  const [addQuery, setAddQuery]         = useState('')
  const addRowRef = useRef<HTMLDivElement>(null)

  // ── Generation ──
  const [result, setResult]             = useState<GenerationResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const selectedCourse  = plannerOptions.find(c => c.courseId === selectedCourseId)
  const majors          = selectedCourse?.majors ?? []
  const canGenerate     = Boolean(selectedPlannerId)

  const allCompletedCodes = completedSemesters.flatMap(s => s.unitCodes)

  function handleCourseChange(id: string) {
    setSelectedCourseId(id)
    setSelectedPlannerId('')
    setResult(null)
    setError(null)
  }

  // ── Semester management ──
  function addSemester() {
    semCounter.current++
    setCompletedSemesters(prev => [
      ...prev,
      { id: `sem-${semCounter.current}`, unitCodes: [] },
    ])
  }

  function removeSemester(id: string) {
    setCompletedSemesters(prev => prev.filter(s => s.id !== id))
    if (activeAddSem === id) closeAddUnit()
  }

  // ── Unit management ──
  function addUnitToSem(semId: string, code: string) {
    setCompletedSemesters(prev =>
      prev.map(s => s.id === semId ? { ...s, unitCodes: [...s.unitCodes, code] } : s)
    )
    setAddQuery('')
    // Keep search open for rapid entry
  }

  function removeUnitFromSem(semId: string, code: string) {
    setCompletedSemesters(prev =>
      prev.map(s => s.id === semId ? { ...s, unitCodes: s.unitCodes.filter(c => c !== code) } : s)
    )
  }

  function openAddUnit(semId: string) {
    setActiveAddSem(semId)
    setAddQuery('')
  }

  function closeAddUnit() {
    setActiveAddSem(null)
    setAddQuery('')
  }

  // Filter units for the active add row (exclude anything already added anywhere)
  const filteredAddUnits = addQuery.trim().length >= 1
    ? MOCK_UNITS.filter(u =>
        !allCompletedCodes.includes(u.code) &&
        (u.code.toLowerCase().includes(addQuery.toLowerCase()) ||
         u.name.toLowerCase().includes(addQuery.toLowerCase()))
      ).slice(0, 8)
    : []

  // Close inline search on outside click
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (addRowRef.current && !addRowRef.current.contains(e.target as Node)) {
        closeAddUnit()
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  // ── Generate ──
  async function handleGenerate() {
    if (!canGenerate) return
    setIsGenerating(true)
    setError(null)
    try {
      const res = await generatePlan({
        config: { plannerId: selectedPlannerId, intakeYear, intakeMonth },
        completedUnitCodes: allCompletedCodes,
      })
      if (!res) {
        setError('No plan template found for the selected configuration. Try a different course or major.')
      } else {
        setResult(res)
        setTimeout(() => {
          document.getElementById('generated-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    } catch {
      setError('An error occurred while generating the plan. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className={styles.wrap}>

      {/* ── Section 1: Course Configuration ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionNum}>1</span>
          <div>
            <h2 className={styles.sectionTitle}>Course Configuration</h2>
            <p className={styles.sectionSubtitle}>Select your intake and course details.</p>
          </div>
        </div>

        <div className={styles.configGrid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="course">Course</label>
            <select
              id="course"
              className={styles.select}
              value={selectedCourseId}
              onChange={e => handleCourseChange(e.target.value)}
            >
              <option value="">Select a course…</option>
              {plannerOptions.map(c => (
                <option key={c.courseId} value={c.courseId}>{c.courseName}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="major">
              Major
              {!selectedCourseId && <span className={styles.fieldHint}> — select a course first</span>}
            </label>
            <select
              id="major"
              className={styles.select}
              value={selectedPlannerId}
              onChange={e => { setSelectedPlannerId(e.target.value); setResult(null); setError(null) }}
              disabled={!selectedCourseId}
            >
              <option value="">Select a major…</option>
              {majors.map(m => (
                <option key={m.plannerId} value={m.plannerId}>{m.majorName ?? 'No Major'}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="intakeMonth">Intake Month</label>
            <select
              id="intakeMonth"
              className={styles.select}
              value={intakeMonth}
              onChange={e => setIntakeMonth(Number(e.target.value))}
            >
              {MONTH_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="intakeYear">Intake Year</label>
            <input
              id="intakeYear"
              type="number"
              className={styles.select}
              value={intakeYear}
              min={2000}
              max={2099}
              onChange={e => setIntakeYear(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <div className={styles.divider} />

      {/* ── Section 2: Completed Semesters ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionNum}>2</span>
          <div>
            <h2 className={styles.sectionTitle}>Units Completed</h2>
            <p className={styles.sectionSubtitle}>
              Add the units you have already passed, organised by semester.
              These will be marked as completed in your generated plan.
            </p>
          </div>
        </div>

        <div className={styles.completedTablesWrap}>
          {completedSemesters.map((sem, idx) => {
            const isAddActive = activeAddSem === sem.id
            return (
              <div key={sem.id} className={styles.completedTable}>

                {/* Header */}
                <div className={styles.completedTableHeader}>
                  <span>Semester {idx + 1}</span>
                  {completedSemesters.length > 1 && (
                    <button
                      className={styles.removeSemBtn}
                      onClick={() => removeSemester(sem.id)}
                      aria-label={`Remove Semester ${idx + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Column headers */}
                <div className={styles.completedColHeaders}>
                  <span>Unit Code</span>
                  <span>Unit Name</span>
                  <span />
                </div>

                {/* Unit rows */}
                {sem.unitCodes.length === 0 && !isAddActive && (
                  <div className={styles.completedEmpty}>
                    No units added. Click &ldquo;+ Add unit&rdquo; below.
                  </div>
                )}

                {sem.unitCodes.map(code => {
                  const unit = MOCK_UNITS.find(u => u.code === code)
                  return (
                    <div key={code} className={styles.completedRow}>
                      <span className={styles.completedRowCode}>{code}</span>
                      <span className={styles.completedRowName}>{unit?.name ?? '—'}</span>
                      <button
                        className={styles.removeUnitBtn}
                        onClick={() => removeUnitFromSem(sem.id, code)}
                        aria-label={`Remove ${code}`}
                      >×</button>
                    </div>
                  )
                })}

                {/* Add unit row */}
                {isAddActive ? (
                  <div className={styles.addUnitRow} ref={addRowRef}>
                    <input
                      autoFocus
                      type="text"
                      className={styles.addUnitInput}
                      placeholder="Search by unit code or name…"
                      value={addQuery}
                      onChange={e => setAddQuery(e.target.value)}
                      autoComplete="off"
                      onKeyDown={e => { if (e.key === 'Escape') closeAddUnit() }}
                      aria-label="Search units to add"
                    />
                    <button
                      className={styles.addUnitDone}
                      onClick={closeAddUnit}
                      aria-label="Close search"
                    >Done</button>

                    {filteredAddUnits.length > 0 && (
                      <ul className={styles.addDropdown} role="listbox">
                        {filteredAddUnits.map(u => (
                          <li
                            key={u.code}
                            className={styles.addDropdownItem}
                            role="option"
                            aria-selected={false}
                            onMouseDown={e => { e.preventDefault(); addUnitToSem(sem.id, u.code) }}
                          >
                            <span className={styles.addDropdownCode}>{u.code}</span>
                            <span className={styles.addDropdownName}>{u.name}</span>
                            <span className={styles.addDropdownPlus} aria-hidden="true">+</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {addQuery.trim().length >= 1 && filteredAddUnits.length === 0 && (
                      <div className={styles.addDropdownEmpty}>No units found.</div>
                    )}
                  </div>
                ) : (
                  <button
                    className={styles.addUnitBtn}
                    onClick={() => openAddUnit(sem.id)}
                  >
                    + Add unit
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <button className={styles.addSemBtn} onClick={addSemester}>
          + Add Semester
        </button>
      </section>

      <div className={styles.divider} />

      {/* ── Generate ── */}
      <div className={styles.generateBar}>
        <div className={styles.generateLeft}>
          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating
              ? <><span className={styles.spinner} aria-hidden="true" /> Generating…</>
              : 'Generate Study Plan'}
          </button>
          {!canGenerate && (
            <span className={styles.generateHint}>Select a course and major to continue.</span>
          )}
        </div>
        {allCompletedCodes.length > 0 && (
          <span className={styles.completedCount}>
            {allCompletedCodes.length} unit{allCompletedCodes.length !== 1 ? 's' : ''} marked as completed
          </span>
        )}
      </div>

      {error && <div className={styles.errorBox} role="alert">{error}</div>}

      {/* ── Generated Plan ── */}
      {result && (
        <section className={styles.planSection} id="generated-plan">
          <div className={styles.planHeader}>
            <h2 className={styles.planTitle}>Your Study Plan</h2>
          </div>

          <div className={styles.planGrid}>
            <div className={styles.planMain}>
              {[...groupByYear(result.semesters).entries()].map(([year, blocks]) => (
                <div key={year}>
                  <h3 className={styles.yearHeading}>Year {YEAR_WORDS[year - 1] ?? year}</h3>
                  {blocks.map(block => (
                    <SemesterTable
                      key={`${block.year}-${block.semester}`}
                      block={block}
                      completedCodes={result.completedCodes}
                    />
                  ))}
                </div>
              ))}

              {result.electivePool.length > 0 && (
                <div className={styles.poolSection}>
                  <h3 className={styles.poolTitle}>Elective Pool</h3>
                  <p className={styles.poolSubtitle}>
                    Choose from the following units to fill your open elective slots.
                  </p>
                  <ElectivePool units={result.electivePool} />
                </div>
              )}
            </div>

            <aside className={styles.planSidebar}>
              <div className={styles.sideCard}>
                <div className={styles.sideCardTitle}>Plan Summary</div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Intake</span>
                  <span className={styles.summaryValue}>
                    {MONTH_OPTIONS.find(m => m.value === intakeMonth)?.label} {intakeYear}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Course</span>
                  <span className={styles.summaryValue}>
                    {selectedCourse?.courseName ?? '—'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Major</span>
                  <span className={styles.summaryValue}>
                    {majors.find(m => m.plannerId === selectedPlannerId)?.majorName ?? '—'}
                  </span>
                </div>
                <hr className={styles.summaryDivider} />
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Completed</span>
                  <span className={`${styles.summaryValue} ${styles.summaryCompleted}`}>
                    {allCompletedCodes.length} unit{allCompletedCodes.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Remaining</span>
                  <span className={styles.summaryValue}>
                    {result.semesters
                      .flatMap(s => s.units)
                      .filter(u => !u.isElectiveSlot && !result.completedCodes.has(u.code))
                      .length} units
                  </span>
                </div>
              </div>

              <div className={styles.sideCard}>
                <div className={styles.sideCardTitle}>Note</div>
                <p className={styles.noteText}>
                  This plan is based on the standard course template. Unit availability and sequencing
                  may vary. Consult your academic advisor before finalising your plan.
                </p>
              </div>
            </aside>
          </div>
        </section>
      )}
    </div>
  )
}
