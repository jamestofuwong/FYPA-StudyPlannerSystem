'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import styles from './PlannerForm.module.css'
import { savePlanner, deletePlanner } from './actions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseOption {
  id: string
  name: string
  code: string | null
  majors: { id: string; name: string }[]
}

interface UnitOption {
  id: string
  code: string
  name: string
}

interface ExistingPlanner {
  id: string
  course_id: string
  major_id: string | null
  intake_month: number
  intake_year: number
  duration_years: number
  semesters: {
    id: string
    year_number: number
    sem_number: number
    label: string | null
    units: {
      id: string
      unit_id: string | null
      unit: { id: string; code: string; name: string } | null
      category: string
      is_elective_slot: boolean
      position: number
    }[]
  }[]
  elective_pool: { unit_id: string; unit: { id: string; code: string; name: string } }[]
}

interface Props {
  courses: CourseOption[]
  allUnits: UnitOption[]
  planner?: ExistingPlanner
}

type UnitCat = 'core' | 'major_core' | 'prescribed_elective' | 'elective' | 'wil' | 'mpu'

interface SemUnitState {
  key: string
  unit_id: string | null
  code: string
  name: string
  category: UnitCat
  is_elective_slot: boolean
}

interface SemState {
  key: string
  year_number: number
  sem_number: number
  label: string
  units: SemUnitState[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SemesterUnitSearch({
  semKey,
  allUnits,
  existingUnitIds,
  onAdd,
}: {
  semKey: string
  allUnits: UnitOption[]
  existingUnitIds: Set<string>
  onAdd: (semKey: string, unit: UnitOption) => void
}) {
  const [query, setQuery] = useState('')

  const filtered =
    query.trim().length > 0
      ? allUnits
          .filter(
            u =>
              !existingUnitIds.has(u.id) &&
              (u.code.toLowerCase().includes(query.toLowerCase()) ||
                u.name.toLowerCase().includes(query.toLowerCase())),
          )
          .slice(0, 10)
      : []

  return (
    <div className={styles.addUnitWrap}>
      <input
        type="text"
        className={styles.unitSearchInput}
        placeholder="Search units to add..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {filtered.length > 0 && (
        <div className={styles.unitDropdown}>
          {filtered.map(u => (
            <button
              key={u.id}
              type="button"
              className={styles.unitDropdownItem}
              onClick={() => {
                onAdd(semKey, u)
                setQuery('')
              }}
            >
              <span className={styles.unitDropdownCode}>{u.code}</span>
              <span className={styles.unitDropdownName}>{u.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddSemesterRow({
  onAdd,
  existing,
}: {
  onAdd: (year: number, label: string) => void
  existing: SemState[]
}) {
  const [year, setYear] = useState(1)
  const [label, setLabel] = useState('')

  const trimmedLabel = label.trim()
  const isDuplicate =
    trimmedLabel.length > 0 &&
    existing.some(
      s => s.year_number === year && s.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    )

  return (
    <div className={styles.addSemRow}>
      <div className={styles.field}>
        <label className={styles.label}>Year</label>
        <input
          type="number"
          className={styles.input}
          value={year}
          min={1}
          style={{ width: 80 }}
          onChange={e => setYear(Math.max(1, Number(e.target.value)))}
        />
      </div>
      <div className={styles.field} style={{ flex: 1 }}>
        <label className={styles.label}>Semester Name</label>
        <input
          type="text"
          className={styles.input}
          placeholder="e.g. Semester 1, Summer Term"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
      </div>
      <button
        type="button"
        className={styles.addBtn}
        disabled={!trimmedLabel || isDuplicate}
        title={isDuplicate ? 'This semester already exists' : undefined}
        onClick={() => {
          onAdd(year, trimmedLabel)
          setLabel('')
        }}
      >
        + Add Semester
      </button>
      {isDuplicate && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', alignSelf: 'flex-end', paddingBottom: 6 }}>
          Already exists
        </span>
      )}
    </div>
  )
}

function PoolSearch({
  allUnits,
  existingIds,
  onAdd,
}: {
  allUnits: UnitOption[]
  existingIds: Set<string>
  onAdd: (unit: UnitOption) => void
}) {
  const [query, setQuery] = useState('')

  const filtered =
    query.trim().length > 0
      ? allUnits
          .filter(
            u =>
              !existingIds.has(u.id) &&
              (u.code.toLowerCase().includes(query.toLowerCase()) ||
                u.name.toLowerCase().includes(query.toLowerCase())),
          )
          .slice(0, 10)
      : []

  return (
    <div className={styles.poolSearchWrap}>
      <input
        type="text"
        className={styles.unitSearchInput}
        placeholder="Search units to add to pool..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {filtered.length > 0 && (
        <div className={styles.unitDropdown}>
          {filtered.map(u => (
            <button
              key={u.id}
              type="button"
              className={styles.unitDropdownItem}
              onClick={() => {
                onAdd(u)
                setQuery('')
              }}
            >
              <span className={styles.unitDropdownCode}>{u.code}</span>
              <span className={styles.unitDropdownName}>{u.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlannerForm({ courses, allUnits, planner }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Basic info
  const [courseName, setCourseName] = useState(
    courses.find(c => c.id === planner?.course_id)?.name ?? '',
  )
  const [courseCode, setCourseCode] = useState(
    courses.find(c => c.id === planner?.course_id)?.code ?? '',
  )
  const [majorName, setMajorName] = useState(
    courses
      .find(c => c.id === planner?.course_id)
      ?.majors.find(m => m.id === planner?.major_id)?.name ?? '',
  )
  const [intakeMonth, setIntakeMonth] = useState(planner?.intake_month ?? 3)
  const [intakeYear, setIntakeYear] = useState(planner?.intake_year ?? new Date().getFullYear())
  const [durationYears, setDurationYears] = useState(planner?.duration_years ?? 3)

  // Semesters
  const [semesters, setSemesters] = useState<SemState[]>(
    planner
      ? [...planner.semesters]
          .sort((a, b) => a.year_number - b.year_number || a.sem_number - b.sem_number)
          .map(s => ({
            key: s.id,
            year_number: s.year_number,
            sem_number: s.sem_number,
            label: s.label ?? `Semester ${s.sem_number}`,
            units: [...s.units]
              .sort((a, b) => a.position - b.position)
              .map(u => ({
                key: u.id,
                unit_id: u.unit_id,
                code: u.unit?.code ?? 'ELECTIVE',
                name: u.unit?.name ?? 'Free Elective Slot',
                category: u.category as UnitCat,
                is_elective_slot: u.is_elective_slot,
              })),
          }))
      : [],
  )

  // Elective pool
  const [electivePool, setElectivePool] = useState<UnitOption[]>(
    planner?.elective_pool.map(ep => ep.unit) ?? [],
  )

  // All major names for datalist suggestions
  const allMajorNames = Array.from(new Set(courses.flatMap(c => c.majors.map(m => m.name))))

  // ─── Semester mutations ──────────────────────────────────────────────────────

  const addSemester = (year: number, label: string) => {
    const duplicate = semesters.some(
      s => s.year_number === year && s.label.trim().toLowerCase() === label.trim().toLowerCase(),
    )
    if (duplicate) return
    const newSem: SemState = {
      key: crypto.randomUUID(),
      year_number: year,
      sem_number: semesters.filter(s => s.year_number === year).length + 1,
      label,
      units: [],
    }
    // Keep sorted by year; stable sort preserves within-year order
    setSemesters(prev => [...prev, newSem].sort((a, b) => a.year_number - b.year_number))
  }

  const moveSemester = (key: string, direction: 'up' | 'down') => {
    setSemesters(prev => {
      const idx = prev.findIndex(s => s.key === key)
      if (idx === -1) return prev
      const year = prev[idx].year_number
      const next = [...prev]
      if (direction === 'up') {
        let swapIdx = -1
        for (let i = idx - 1; i >= 0; i--) {
          if (next[i].year_number === year) { swapIdx = i; break }
        }
        if (swapIdx === -1) return prev
        ;[next[swapIdx], next[idx]] = [next[idx], next[swapIdx]]
      } else {
        let swapIdx = -1
        for (let i = idx + 1; i < next.length; i++) {
          if (next[i].year_number === year) { swapIdx = i; break }
        }
        if (swapIdx === -1) return prev
        ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      }
      return next
    })
  }

  const removeSemester = (key: string) => {
    setSemesters(prev => prev.filter(s => s.key !== key))
  }

  const renameSemester = (key: string, label: string) => {
    setSemesters(prev => prev.map(s => s.key === key ? { ...s, label } : s))
  }

  const addUnitToSemester = (semKey: string, unit: UnitOption) => {
    setSemesters(prev =>
      prev.map(s => {
        if (s.key !== semKey) return s
        // Avoid duplicate units in same semester
        if (s.units.some(u => u.unit_id === unit.id)) return s
        return {
          ...s,
          units: [
            ...s.units,
            {
              key: crypto.randomUUID(),
              unit_id: unit.id,
              code: unit.code,
              name: unit.name,
              category: 'core' as UnitCat,
              is_elective_slot: false,
            },
          ],
        }
      }),
    )
  }

  const addElectiveSlot = (semKey: string) => {
    setSemesters(prev =>
      prev.map(s => {
        if (s.key !== semKey) return s
        return {
          ...s,
          units: [
            ...s.units,
            {
              key: crypto.randomUUID(),
              unit_id: null,
              code: 'ELECTIVE',
              name: 'Free Elective Slot',
              category: 'elective' as UnitCat,
              is_elective_slot: true,
            },
          ],
        }
      }),
    )
  }

  const removeUnitFromSemester = (semKey: string, unitKey: string) => {
    setSemesters(prev =>
      prev.map(s => {
        if (s.key !== semKey) return s
        return { ...s, units: s.units.filter(u => u.key !== unitKey) }
      }),
    )
  }

  const updateUnitCategory = (semKey: string, unitKey: string, cat: UnitCat) => {
    setSemesters(prev =>
      prev.map(s => {
        if (s.key !== semKey) return s
        return {
          ...s,
          units: s.units.map(u => (u.key === unitKey ? { ...u, category: cat } : u)),
        }
      }),
    )
  }

  // ─── Elective pool mutations ─────────────────────────────────────────────────

  const addToPool = (unit: UnitOption) => {
    setElectivePool(prev => {
      if (prev.some(u => u.id === unit.id)) return prev
      return [...prev, unit]
    })
  }

  const removeFromPool = (unitId: string) => {
    setElectivePool(prev => prev.filter(u => u.id !== unitId))
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (!courseName.trim()) {
      setError('Please enter a course name.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        // Build sem_number as position within each year group
        const yearCounters = new Map<number, number>()
        const semestersWithNum = semesters.map(s => {
          const pos = (yearCounters.get(s.year_number) ?? 0) + 1
          yearCounters.set(s.year_number, pos)
          return { ...s, sem_number: pos }
        })

        await savePlanner({
          id: planner?.id,
          course_name: courseName.trim(),
          course_code: courseCode.trim() || null,
          major_name: majorName.trim() || null,
          intake_month: intakeMonth,
          intake_year: intakeYear,
          duration_years: durationYears,
          semesters: semestersWithNum.map(s => ({
            year_number: s.year_number,
            sem_number: s.sem_number,
            label: s.label,
            units: s.units.map((u, idx) => ({
              unit_id: u.unit_id,
              category: u.category,
              is_elective_slot: u.is_elective_slot,
              position: idx,
            })),
          })),
          elective_pool: electivePool.map(u => u.id),
        })
      } catch (e: unknown) {
        // redirect throws, so only real errors land here
        if (e instanceof Error && !e.message.includes('NEXT_REDIRECT')) {
          setError(e.message)
        }
      }
    })
  }

  const handleDelete = () => {
    if (!planner) return
    if (!confirm('Delete this planner template? This cannot be undone.')) return
    startTransition(async () => {
      try {
        await deletePlanner(planner.id)
      } catch (e: unknown) {
        if (e instanceof Error && !e.message.includes('NEXT_REDIRECT')) {
          setError(e.message)
        }
      }
    })
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.form}>
      {/* Basic Info */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Basic Information</h2>
        <div className={styles.infoGrid}>
          {/* Course */}
          <div className={styles.field}>
            <label className={styles.label}>Course</label>
            <input
              type="text"
              className={styles.input}
              list="course-suggestions"
              value={courseName}
              placeholder="e.g. Bachelor of Computer Science"
              onChange={e => {
                setCourseName(e.target.value)
                // Auto-fill code when selecting an existing course from the datalist
                const match = courses.find(c => c.name === e.target.value)
                if (match) setCourseCode(match.code ?? '')
              }}
            />
            <datalist id="course-suggestions">
              {courses.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>

          {/* Course Code */}
          <div className={styles.field}>
            <label className={styles.label}>Course Code (optional)</label>
            <input
              type="text"
              className={styles.input}
              value={courseCode ?? ''}
              placeholder="e.g. BCS"
              onChange={e => setCourseCode(e.target.value)}
            />
          </div>

          {/* Major */}
          <div className={styles.field}>
            <label className={styles.label}>Major (optional)</label>
            <input
              type="text"
              className={styles.input}
              list="major-suggestions"
              value={majorName}
              placeholder="e.g. Artificial Intelligence"
              onChange={e => setMajorName(e.target.value)}
            />
            <datalist id="major-suggestions">
              {allMajorNames.map(name => <option key={name} value={name} />)}
            </datalist>
          </div>

          {/* Intake Month */}
          <div className={styles.field}>
            <label className={styles.label}>Intake Month</label>
            <select
              className={styles.select}
              value={intakeMonth}
              onChange={e => setIntakeMonth(Number(e.target.value))}
            >
              <option value={1}>January</option>
              <option value={2}>February</option>
              <option value={3}>March</option>
              <option value={4}>April</option>
              <option value={5}>May</option>
              <option value={6}>June</option>
              <option value={7}>July</option>
              <option value={8}>August</option>
              <option value={9}>September</option>
              <option value={10}>October</option>
              <option value={11}>November</option>
              <option value={12}>December</option>
            </select>
          </div>

          {/* Intake Year */}
          <div className={styles.field}>
            <label className={styles.label}>Intake Year</label>
            <input
              type="number"
              className={styles.input}
              value={intakeYear}
              min={2000}
              max={2100}
              onChange={e => setIntakeYear(Number(e.target.value))}
            />
          </div>

          {/* Duration */}
          <div className={styles.field}>
            <label className={styles.label}>Duration (years)</label>
            <input
              type="number"
              className={styles.input}
              value={durationYears}
              min={1}
              max={10}
              onChange={e => setDurationYears(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>
      </section>

      {/* Semesters */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Semesters</h2>

        {semesters.length === 0 && (
          <p className={styles.sectionDesc}>No semesters added yet. Use the form below to add one.</p>
        )}

        {Array.from(new Set(semesters.map(s => s.year_number)))
          .sort((a, b) => a - b)
          .map(year => (
            <div key={year} className={styles.yearGroup}>
              <h3 className={styles.yearHeading}>Year {year}</h3>

              {semesters
                .filter(s => s.year_number === year)
                .map(sem => {
                  const existingUnitIds = new Set(
                    sem.units.filter(u => u.unit_id !== null).map(u => u.unit_id as string),
                  )

                  return (
                    <div key={sem.key} className={styles.semesterCard}>
                      <div className={styles.semesterHeader}>
                        <input
                          className={styles.semesterLabelInput}
                          value={sem.label}
                          onChange={e => renameSemester(sem.key, e.target.value)}
                          placeholder="Semester name"
                        />
                        <div className={styles.semesterHeaderActions}>
                          <button
                            type="button"
                            className={styles.semMoveBtn}
                            onClick={() => moveSemester(sem.key, 'up')}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className={styles.semMoveBtn}
                            onClick={() => moveSemester(sem.key, 'down')}
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className={styles.semRemoveBtn}
                            onClick={() => removeSemester(sem.key)}
                            title="Remove semester"
                          >
                            &times;
                          </button>
                        </div>
                      </div>

                      <div className={styles.semesterBody}>
                        {sem.units.length === 0 && (
                          <p className={styles.noUnits}>No units added to this semester yet.</p>
                        )}
                        {sem.units.map(u => (
                          <div key={u.key} className={styles.unitRow}>
                            {u.is_elective_slot ? (
                              <span className={styles.electiveSlot}>Free Elective Slot</span>
                            ) : (
                              <>
                                <span className={styles.unitCode}>{u.code}</span>
                                <span className={styles.unitName}>{u.name}</span>
                              </>
                            )}
                            <select
                              className={styles.categorySelect}
                              value={u.category}
                              onChange={e => updateUnitCategory(sem.key, u.key, e.target.value as UnitCat)}
                            >
                              <option value="core">Core</option>
                              <option value="major_core">Major Core</option>
                              <option value="prescribed_elective">Prescribed Elective</option>
                              <option value="elective">Elective</option>
                              <option value="wil">WIL</option>
                              <option value="mpu">MPU</option>
                            </select>
                            <button
                              type="button"
                              className={styles.removeBtn}
                              onClick={() => removeUnitFromSemester(sem.key, u.key)}
                              title="Remove unit"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className={styles.semActions}>
                        <SemesterUnitSearch
                          semKey={sem.key}
                          allUnits={allUnits}
                          existingUnitIds={existingUnitIds}
                          onAdd={addUnitToSemester}
                        />
                        <button
                          type="button"
                          className={styles.addSlotBtn}
                          onClick={() => addElectiveSlot(sem.key)}
                        >
                          + Add Slot
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          ))}

        <AddSemesterRow onAdd={addSemester} existing={semesters} />
      </section>

      {/* Elective Pool */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Elective Pool</h2>
        <p className={styles.sectionDesc}>
          Units students can choose from for elective slots in this planner.
        </p>

        <div className={styles.poolTags}>
          {electivePool.length === 0 ? (
            <span className={styles.poolEmpty}>No units in pool yet.</span>
          ) : (
            electivePool.map(u => (
              <span key={u.id} className={styles.poolTag}>
                <span className={styles.poolTagCode}>{u.code}</span>
                <span>{u.name}</span>
                <button
                  type="button"
                  className={styles.poolTagRemove}
                  onClick={() => removeFromPool(u.id)}
                  title={`Remove ${u.code}`}
                >
                  &times;
                </button>
              </span>
            ))
          )}
        </div>

        <PoolSearch
          allUnits={allUnits}
          existingIds={new Set(electivePool.map(u => u.id))}
          onAdd={addToPool}
        />
      </section>

      {/* Error */}
      {error && <p className={styles.feedbackError}>{error}</p>}

      {/* Footer */}
      <div className={styles.formFooter}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={handleSubmit}
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Save Planner'}
        </button>
        <Link href="/cms/planners" className={styles.cancelLink}>
          Cancel
        </Link>
        {planner && (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={handleDelete}
            disabled={isPending}
          >
            Delete Planner
          </button>
        )}
      </div>
    </div>
  )
}
