'use client'
import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { saveUnit } from './actions'
import styles from './UnitForm.module.css'

const TABS = ['Basic', 'Availability', 'Learning Outcomes', 'Content', 'Assessments', 'Requisites'] as const
type Tab = typeof TABS[number]

const AVAILABLE_MONTHS: { value: number; label: string }[] = [
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

type RequisiteType = 'prerequisite' | 'corequisite' | 'antirequisite'

interface UnitRef { id: string; code: string; name: string }
interface ULO { id?: string; ulo_number: number; description: string }
interface ContentTopic { id?: string; position: number; topic: string }
interface Assessment { id?: string; title: string; type: string; weight: string; ulosStr: string; position: number }

interface Props {
  allUnits: UnitRef[]
  unit?: {
    id: string
    code: string
    name: string
    credit_points: string | number
    year_level: number
    overview: string | null
    availability: { month: number }[]
    learning_outcomes: { id: string; ulo_number: number; description: string }[]
    content_topics: { id: string; position: number; topic: string }[]
    assessments: { id: string; title: string; type: string; weight: number; ulos: number[]; position: number }[]
    requisites: { id: string; requisite_type: string; requisite_unit: UnitRef }[]
  }
}

const REQUISITE_SECTIONS: { type: RequisiteType; label: string; description: string }[] = [
  { type: 'prerequisite',  label: 'Prerequisites',   description: 'Must be completed before enrolling in this unit.' },
  { type: 'corequisite',   label: 'Co-requisites',   description: 'Must be enrolled in the same semester as this unit.' },
  { type: 'antirequisite', label: 'Anti-requisites',  description: 'Cannot be taken if this unit has already been completed.' },
]

function RequisiteSection({
  type, label, description, selected, allUnits, currentUnitId, onChange,
}: {
  type: RequisiteType
  label: string
  description: string
  selected: UnitRef[]
  allUnits: UnitRef[]
  currentUnitId?: string
  onChange: (units: UnitRef[]) => void
}) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedIds = new Set(selected.map(u => u.id))
  const suggestions = query.trim().length > 0
    ? allUnits.filter(u =>
        u.id !== currentUnitId &&
        !selectedIds.has(u.id) &&
        (u.code.toLowerCase().includes(query.toLowerCase()) ||
         u.name.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 8)
    : []

  function add(unit: UnitRef) {
    onChange([...selected, unit])
    setQuery('')
    inputRef.current?.focus()
  }

  function remove(id: string) {
    onChange(selected.filter(u => u.id !== id))
  }

  return (
    <div className={styles.reqSection}>
      <div className={styles.reqHeader}>
        <span className={styles.reqLabel}>{label}</span>
        <span className={styles.reqDesc}>{description}</span>
      </div>
      <div className={styles.reqTags}>
        {selected.map(u => (
          <span key={u.id} className={styles.reqTag}>
            <span className={styles.reqTagCode}>{u.code}</span>
            <span className={styles.reqTagName}>{u.name}</span>
            <button type="button" className={styles.reqTagRemove} onClick={() => remove(u.id)}>&times;</button>
          </span>
        ))}
        {selected.length === 0 && <span className={styles.reqEmpty}>None added</span>}
      </div>
      <div className={styles.reqSearchWrap}>
        <input
          ref={inputRef}
          className={styles.input}
          style={{ width: 320 }}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by code or name..."
        />
        {suggestions.length > 0 && (
          <div className={styles.reqDropdown}>
            {suggestions.map(u => (
              <button key={u.id} type="button" className={styles.reqDropdownItem} onClick={() => add(u)}>
                <span className={styles.reqDropdownCode}>{u.code}</span>
                <span className={styles.reqDropdownName}>{u.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function UnitForm({ unit, allUnits }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Basic')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Basic fields
  const [code, setCode] = useState(unit?.code ?? '')
  const [name, setName] = useState(unit?.name ?? '')
  const [creditPoints, setCreditPoints] = useState(String(unit?.credit_points ?? '12.5'))
  const [yearLevel, setYearLevel] = useState(String(unit?.year_level ?? '1'))
  const [overview, setOverview] = useState(unit?.overview ?? '')

  // Availability
  const [selectedMonths, setSelectedMonths] = useState<number[]>(
    unit?.availability.map(a => a.month) ?? []
  )

  // Learning outcomes
  const [ulos, setUlos] = useState<ULO[]>(
    unit?.learning_outcomes.map(u => ({ id: u.id, ulo_number: u.ulo_number, description: u.description })) ?? []
  )

  // Content topics
  const [topics, setTopics] = useState<ContentTopic[]>(
    unit?.content_topics.map(t => ({ id: t.id, position: t.position, topic: t.topic })) ?? []
  )

  // Assessments
  const [assessments, setAssessments] = useState<Assessment[]>(
    unit?.assessments.map(a => ({ id: a.id, title: a.title, type: a.type, weight: String(a.weight), ulosStr: a.ulos.join(', '), position: a.position })) ?? []
  )

  // Requisites — split by type
  const [prerequisites, setPrerequisites] = useState<UnitRef[]>(
    unit?.requisites.filter(r => r.requisite_type === 'prerequisite').map(r => r.requisite_unit) ?? []
  )
  const [corequisites, setCorequisites] = useState<UnitRef[]>(
    unit?.requisites.filter(r => r.requisite_type === 'corequisite').map(r => r.requisite_unit) ?? []
  )
  const [antirequisites, setAntirequisites] = useState<UnitRef[]>(
    unit?.requisites.filter(r => r.requisite_type === 'antirequisite').map(r => r.requisite_unit) ?? []
  )

  function toggleMonth(month: number) {
    setSelectedMonths(prev =>
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month].sort((a, b) => a - b)
    )
  }

  function addUlo() {
    setUlos(prev => [...prev, { ulo_number: prev.length + 1, description: '' }])
  }
  function removeUlo(index: number) {
    setUlos(prev => prev.filter((_, i) => i !== index).map((u, i) => ({ ...u, ulo_number: i + 1 })))
  }
  function updateUloDesc(index: number, desc: string) {
    setUlos(prev => prev.map((u, i) => (i === index ? { ...u, description: desc } : u)))
  }
  function moveUlo(index: number, direction: 'up' | 'down') {
    setUlos(prev => {
      const next = [...prev]
      const swapIdx = direction === 'up' ? index - 1 : index + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
      return next.map((u, i) => ({ ...u, ulo_number: i + 1 }))
    })
  }

  function addTopic() {
    setTopics(prev => [...prev, { position: prev.length + 1, topic: '' }])
  }
  function removeTopic(index: number) {
    setTopics(prev => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, position: i + 1 })))
  }
  function updateTopicText(index: number, text: string) {
    setTopics(prev => prev.map((t, i) => (i === index ? { ...t, topic: text } : t)))
  }
  function moveTopic(index: number, direction: 'up' | 'down') {
    setTopics(prev => {
      const next = [...prev]
      const swapIdx = direction === 'up' ? index - 1 : index + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
      return next.map((t, i) => ({ ...t, position: i + 1 }))
    })
  }

  function addAssessment() {
    setAssessments(prev => [...prev, { title: '', type: '', weight: '', ulosStr: '', position: prev.length + 1 }])
  }
  function removeAssessment(index: number) {
    setAssessments(prev => prev.filter((_, i) => i !== index).map((a, i) => ({ ...a, position: i + 1 })))
  }
  function updateAssessment<K extends keyof Assessment>(index: number, key: K, value: Assessment[K]) {
    setAssessments(prev => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)))
  }
  function parseUlos(raw: string): number[] {
    return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
  }

  async function handleSubmit() {
    setFeedback(null)
    startTransition(async () => {
      try {
        await saveUnit({
          id: unit?.id,
          code: code.trim(),
          name: name.trim(),
          credit_points: parseFloat(creditPoints),
          year_level: parseInt(yearLevel, 10),
          overview: overview.trim(),
          availability: selectedMonths,
          learning_outcomes: ulos.map(u => ({ ulo_number: u.ulo_number, description: u.description })),
          content_topics: topics.map(t => ({ position: t.position, topic: t.topic })),
          assessments: assessments.map(a => ({ title: a.title, type: a.type, weight: parseFloat(a.weight) || 0, ulos: parseUlos(a.ulosStr), position: a.position })),
          requisites: [
            ...prerequisites.map(u => ({ requisite_type: 'prerequisite' as const, requisite_unit_id: u.id })),
            ...corequisites.map(u => ({ requisite_type: 'corequisite' as const, requisite_unit_id: u.id })),
            ...antirequisites.map(u => ({ requisite_type: 'antirequisite' as const, requisite_unit_id: u.id })),
          ],
        })
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) return
        const msg = err instanceof Error ? err.message : 'An error occurred'
        setFeedback({ type: 'error', message: msg })
      }
    })
  }

  return (
    <div className={styles.form}>
      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab: Basic */}
      {activeTab === 'Basic' && (
        <div className={styles.panel}>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Unit Code</label>
              <input className={styles.input} value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. ICT301" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Year Level</label>
              <input className={styles.input} type="number" min={1} max={4} value={yearLevel} onChange={e => setYearLevel(e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Unit Name</label>
            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Advanced Software Engineering" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Credit Points</label>
            <input className={styles.input} type="number" step="0.1" min={0} value={creditPoints} onChange={e => setCreditPoints(e.target.value)} style={{ maxWidth: 160 }} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Overview</label>
            <textarea className={styles.textarea} rows={5} value={overview} onChange={e => setOverview(e.target.value)} placeholder="Unit description..." />
          </div>
        </div>
      )}

      {/* Tab: Availability */}
      {activeTab === 'Availability' && (
        <div className={styles.panel}>
          <div className={styles.field}>
            <label className={styles.label}>Available in</label>
            <p className={styles.hint}>Select which months/periods this unit is offered.</p>
            <div className={styles.checkGroup}>
              {AVAILABLE_MONTHS.map(m => (
                <label key={m.value} className={styles.checkItem}>
                  <input type="checkbox" checked={selectedMonths.includes(m.value)} onChange={() => toggleMonth(m.value)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Learning Outcomes */}
      {activeTab === 'Learning Outcomes' && (
        <div className={styles.panel}>
          <div>
            {ulos.map((ulo, index) => (
              <div key={index} className={styles.listItem}>
                <span className={styles.listNum}>{ulo.ulo_number}.</span>
                <textarea className={styles.textarea} style={{ flex: 1, minHeight: 72 }} value={ulo.description} onChange={e => updateUloDesc(index, e.target.value)} placeholder={`ULO ${ulo.ulo_number} description...`} />
                <div className={styles.listActions}>
                  <button type="button" className={styles.iconBtn} onClick={() => moveUlo(index, 'up')} disabled={index === 0} title="Move up">↑</button>
                  <button type="button" className={styles.iconBtn} onClick={() => moveUlo(index, 'down')} disabled={index === ulos.length - 1} title="Move down">↓</button>
                  <button type="button" className={styles.iconBtn} onClick={() => removeUlo(index)} title="Remove">&times;</button>
                </div>
              </div>
            ))}
            <button type="button" className={styles.addBtn} onClick={addUlo}>+ Add Learning Outcome</button>
          </div>
        </div>
      )}

      {/* Tab: Content */}
      {activeTab === 'Content' && (
        <div className={styles.panel}>
          <div>
            {topics.map((topic, index) => (
              <div key={index} className={styles.listItem}>
                <span className={styles.listNum}>{index + 1}.</span>
                <input className={styles.input} style={{ flex: 1 }} value={topic.topic} onChange={e => updateTopicText(index, e.target.value)} placeholder="Topic title..." />
                <div className={styles.listActions}>
                  <button type="button" className={styles.iconBtn} onClick={() => moveTopic(index, 'up')} disabled={index === 0} title="Move up">↑</button>
                  <button type="button" className={styles.iconBtn} onClick={() => moveTopic(index, 'down')} disabled={index === topics.length - 1} title="Move down">↓</button>
                  <button type="button" className={styles.iconBtn} onClick={() => removeTopic(index)} title="Remove">&times;</button>
                </div>
              </div>
            ))}
            <button type="button" className={styles.addBtn} onClick={addTopic}>+ Add Topic</button>
          </div>
        </div>
      )}

      {/* Tab: Assessments */}
      {activeTab === 'Assessments' && (
        <div className={styles.panel}>
          <div className={styles.assessmentHeader}>
            <span className={styles.assessmentHeaderCell}>Title</span>
            <span className={styles.assessmentHeaderCell}>Type</span>
            <span className={styles.assessmentHeaderCell}>Weight %</span>
            <span className={styles.assessmentHeaderCell}>ULOs</span>
            <span></span>
          </div>
          {assessments.map((a, index) => (
            <div key={index} className={styles.assessmentGrid}>
              <input className={styles.input} value={a.title} onChange={e => updateAssessment(index, 'title', e.target.value)} placeholder="e.g. Final Exam" />
              <input className={styles.input} value={a.type} onChange={e => updateAssessment(index, 'type', e.target.value)} placeholder="e.g. Exam" />
              <input className={styles.input} value={a.weight} onChange={e => updateAssessment(index, 'weight', e.target.value)} placeholder="e.g. 40" />
              <input className={styles.input} value={a.ulosStr} onChange={e => updateAssessment(index, 'ulosStr', e.target.value)} placeholder="1,2,3" />
              <button type="button" className={styles.iconBtn} onClick={() => removeAssessment(index)} title="Remove">&times;</button>
            </div>
          ))}
          <button type="button" className={styles.addBtn} onClick={addAssessment}>+ Add Assessment</button>
        </div>
      )}

      {/* Tab: Requisites */}
      {activeTab === 'Requisites' && (
        <div className={styles.panel}>
          {REQUISITE_SECTIONS.map(section => (
            <RequisiteSection
              key={section.type}
              type={section.type}
              label={section.label}
              description={section.description}
              allUnits={allUnits}
              currentUnitId={unit?.id}
              selected={
                section.type === 'prerequisite' ? prerequisites :
                section.type === 'corequisite' ? corequisites :
                antirequisites
              }
              onChange={
                section.type === 'prerequisite' ? setPrerequisites :
                section.type === 'corequisite' ? setCorequisites :
                setAntirequisites
              }
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className={styles.formFooter}>
        <button type="button" className={styles.saveBtn} onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving...' : 'Save Unit'}
        </button>
        <Link href="/cms/units" className={styles.cancelLink}>Cancel</Link>
        {feedback && (
          <span className={`${styles.feedback} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  )
}
