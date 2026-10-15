'use client'
import { useEffect, useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { checkOfficialUnitUpdates, reviewUnitDetailUpdate, saveUnit } from './actions'
import type { UnitDetailSectionKey } from '@/lib/unit-detail-service'
import styles from './UnitForm.module.css'

const TABS = ['Basic', 'Availability', 'Learning Outcomes', 'Content', 'Assessments', 'Requisites'] as const
type Tab = typeof TABS[number]
const UNIT_DETAIL_SECTION_LABELS: Record<UnitDetailSectionKey, string> = {
  overview: 'Overview',
  learning_outcomes: 'Learning Outcomes',
  content_topics: 'Content Topics',
  assessments: 'Assessments',
}

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
interface Assessment { id?: string; type: string; task: string; weight: string; weightingRaw: string; ulosStr: string; position: number }

type PendingUnitDetailUpdate = {
  section: UnitDetailSectionKey
  content: unknown
  sourceUrl: string | null
}

type ReviewDecision = 'keep_current' | 'use_official'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function EmptyValue({ children }: { children: string }) {
  return <p className={styles.reviewEmpty}>{children}</p>
}

function SectionContent({ section, value }: { section: UnitDetailSectionKey; value: unknown }) {
  if (section === 'overview') {
    return typeof value === 'string' && value.trim()
      ? <p className={styles.reviewOverview}>{value}</p>
      : <EmptyValue>No overview available.</EmptyValue>
  }

  if (!Array.isArray(value) || value.length === 0) {
    return <EmptyValue>{section === 'learning_outcomes' ? 'No learning outcomes available.' : section === 'content_topics' ? 'No content topics available.' : 'No assessments available.'}</EmptyValue>
  }

  if (section === 'learning_outcomes') {
    return (
      <ol className={styles.reviewList}>
        {value.map((item, index) => {
          const outcome = isRecord(item) ? item : {}
          return (
            <li className={styles.reviewItem} key={index}>
              <strong>ULO {String(outcome.number ?? index + 1)}</strong>
              <p>{String(outcome.description ?? '')}</p>
            </li>
          )
        })}
      </ol>
    )
  }

  if (section === 'content_topics') {
    return (
      <ol className={styles.reviewList}>
        {value.map((item, index) => {
          const topic = isRecord(item) ? item : {}
          return <li className={styles.reviewItem} key={index}>{String(topic.topic ?? '')}</li>
        })}
      </ol>
    )
  }

  return (
    <div className={`${styles.reviewList} ${styles.reviewAssessmentList}`}>
      {value.map((item, index) => {
        const assessment = isRecord(item) ? item : {}
        const task = typeof assessment.task === 'string' && assessment.task.trim() ? assessment.task : null
        const rawWeight = typeof assessment.weighting_raw === 'string' && assessment.weighting_raw.trim()
          ? assessment.weighting_raw
          : typeof assessment.weightingRaw === 'string' && assessment.weightingRaw.trim()
            ? assessment.weightingRaw
            : null
        const numericWeight = typeof assessment.weight === 'number' ? `${assessment.weight}%` : null
        const ulos = Array.isArray(assessment.ulos) ? assessment.ulos.map(String).join(', ') : ''

        return (
          <article className={styles.reviewItem} key={index}>
            <h4>{String(assessment.type || 'Assessment')}</h4>
            <dl className={styles.reviewDetails}>
              <div><dt>Task</dt><dd>{task ?? 'Not specified'}</dd></div>
              <div><dt>Weighting</dt><dd>{rawWeight ?? numericWeight ?? 'Not specified'}</dd></div>
              <div><dt>ULOs</dt><dd>{ulos || 'Not specified'}</dd></div>
            </dl>
          </article>
        )
      })}
    </div>
  )
}

function UnitDetailReviewDialog({
  update,
  currentContent,
  busy,
  onClose,
  onDecision,
}: {
  update: PendingUnitDetailUpdate
  currentContent: unknown
  busy: boolean
  onClose: () => void
  onDecision: (decision: ReviewDecision) => void
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])

  return (
    <div className={styles.dialogOverlay} onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
      <section className={styles.reviewDialog} role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="review-dialog-title">Review {UNIT_DETAIL_SECTION_LABELS[update.section]} Update</h2>
            <p>Compare the current content with the official Swinburne version.</p>
          </div>
          <button type="button" className={styles.dialogClose} onClick={onClose} disabled={busy} aria-label="Close review dialog" autoFocus>&times;</button>
        </header>

        <div className={styles.comparisonGrid}>
          <section className={styles.comparisonColumn} aria-labelledby="current-version-heading">
            <h3 id="current-version-heading">Current Version</h3>
            <SectionContent section={update.section} value={currentContent} />
          </section>
          <section className={styles.comparisonColumn} aria-labelledby="official-version-heading">
            <h3 id="official-version-heading">Official Swinburne Version</h3>
            <SectionContent section={update.section} value={update.content} />
            {update.sourceUrl && <a className={styles.sourceLink} href={update.sourceUrl} target="_blank" rel="noopener noreferrer">View official source</a>}
          </section>
        </div>

        <footer className={styles.dialogActions}>
          <button type="button" className={styles.addBtn} onClick={() => onDecision('keep_current')} disabled={busy}>
            {busy ? 'Saving...' : 'Keep Current Version'}
          </button>
          <button type="button" className={styles.saveBtn} onClick={() => onDecision('use_official')} disabled={busy}>
            {busy ? 'Saving...' : 'Use Official Version'}
          </button>
        </footer>
      </section>
    </div>
  )
}

interface Props {
  allUnits: UnitRef[]
  pendingUpdates?: PendingUnitDetailUpdate[]
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
    assessments: { id: string; type: string; task: string | null; weight: number | null; weighting_raw: string | null; ulos: number[]; position: number }[]
    requisites: { id: string; requisite_type: string; requisite_unit: UnitRef }[]
  }
}

export default function UnitForm({ unit, ...formProps }: Props) {
  return <UnitFormFields unit={unit} {...formProps} />
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

function UnitFormFields({ unit, allUnits, pendingUpdates = [] }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Basic')
  const [isPending, startTransition] = useTransition()
  const [isCheckingUpdates, startCheckingUpdates] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedUpdate, setSelectedUpdate] = useState<PendingUnitDetailUpdate | null>(null)
  const [resolvedSections, setResolvedSections] = useState<Set<UnitDetailSectionKey>>(new Set())
  const [checkDialog, setCheckDialog] = useState<'updates' | 'no_changes' | 'unavailable' | null>(null)
  const updatePanelRef = useRef<HTMLElement>(null)
  const saveFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

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
    unit?.assessments.map(a => ({ id: a.id, type: a.type, task: a.task ?? '', weight: a.weight == null ? '' : String(a.weight), weightingRaw: a.weighting_raw ?? '', ulosStr: a.ulos.join(', '), position: a.position })) ?? []
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
    setAssessments(prev => [...prev, { type: '', task: '', weight: '', weightingRaw: '', ulosStr: '', position: prev.length + 1 }])
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

  function currentSectionContent(section: UnitDetailSectionKey): unknown {
    if (section === 'overview') return overview
    if (section === 'learning_outcomes') return ulos.map(item => ({ number: item.ulo_number, description: item.description }))
    if (section === 'content_topics') return topics
    return assessments.map(item => ({
      position: item.position,
      type: item.type,
      task: item.task || null,
      weighting_raw: item.weightingRaw || null,
      weight: item.weight.trim() ? Number(item.weight) : null,
      ulos: parseUlos(item.ulosStr),
    }))
  }

  function checkUpdates() {
    if (!unit) return
    setCheckDialog(null)
    setResolvedSections(new Set())
    startCheckingUpdates(async () => {
      try {
        const result = await checkOfficialUnitUpdates(unit.id)
        setCheckDialog(result.type === 'error'
          ? 'unavailable'
          : result.message === 'No official changes found.' ? 'no_changes' : 'updates')
        router.refresh()
      } catch {
        setCheckDialog('unavailable')
      }
    })
  }

  function applyOfficialContent(update: PendingUnitDetailUpdate) {
    if (update.section === 'overview') {
      setOverview(typeof update.content === 'string' ? update.content : '')
      return
    }
    if (!Array.isArray(update.content)) return

    if (update.section === 'learning_outcomes') {
      setUlos(update.content.map((value, index) => {
        const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
        return {
          ulo_number: typeof item.number === 'number' ? item.number : index + 1,
          description: typeof item.description === 'string' ? item.description : '',
        }
      }))
    } else if (update.section === 'content_topics') {
      setTopics(update.content.map((value, index) => {
        const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
        return {
          position: typeof item.position === 'number' ? item.position : index + 1,
          topic: typeof item.topic === 'string' ? item.topic : '',
        }
      }))
    } else {
      setAssessments(update.content.map((value, index) => {
        const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
        return {
          position: typeof item.position === 'number' ? item.position : index + 1,
          type: typeof item.type === 'string' ? item.type : '',
          task: typeof item.task === 'string' ? item.task : '',
          weight: typeof item.weight === 'number' ? String(item.weight) : '',
          weightingRaw: typeof item.weighting_raw === 'string' ? item.weighting_raw : '',
          ulosStr: Array.isArray(item.ulos) ? item.ulos.map(String).join(', ') : '',
        }
      }))
    }
  }

  function reviewOfficialUpdate(update: PendingUnitDetailUpdate, decision: 'keep_current' | 'use_official') {
    if (!unit) return
    setFeedback(null)
    startTransition(async () => {
      try {
        await reviewUnitDetailUpdate(unit.id, update.section, decision)
        if (decision === 'use_official') applyOfficialContent(update)
        setResolvedSections(previous => new Set(previous).add(update.section))
        setSelectedUpdate(null)
        router.refresh()
      } catch (error) {
        setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Could not review the official update' })
      }
    })
  }

  const sectionOrder: UnitDetailSectionKey[] = ['overview', 'learning_outcomes', 'content_topics', 'assessments']
  const listedUpdates = sectionOrder.flatMap(section =>
    pendingUpdates.filter(update => update.section === section && !resolvedSections.has(section)),
  )
  const updateResultMessage = listedUpdates.length === 1
    ? '1 section has an official version available for review.'
    : listedUpdates.length > 1
      ? `${listedUpdates.length} sections have official versions available for review.`
      : 'Official versions are available for review in the Official Updates panel.'

  function focusUpdatePanel() {
    setCheckDialog(null)
    requestAnimationFrame(() => {
      updatePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      updatePanelRef.current?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    if (!checkDialog) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setCheckDialog(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [checkDialog])

  useEffect(() => () => {
    if (saveFeedbackTimeoutRef.current) clearTimeout(saveFeedbackTimeoutRef.current)
  }, [])

  function showSavedFeedback() {
    if (saveFeedbackTimeoutRef.current) clearTimeout(saveFeedbackTimeoutRef.current)
    setFeedback({ type: 'success', message: 'Saved' })
    saveFeedbackTimeoutRef.current = setTimeout(() => {
      setFeedback(current => current?.type === 'success' ? null : current)
      saveFeedbackTimeoutRef.current = null
    }, 1800)
  }

  async function handleSubmit() {
    if (saveFeedbackTimeoutRef.current) clearTimeout(saveFeedbackTimeoutRef.current)
    saveFeedbackTimeoutRef.current = null
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
          assessments: assessments.map(a => ({
            type: a.type,
            task: a.task || null,
            weight: a.weight.trim() ? Number(a.weight) : null,
            weighting_raw: a.weightingRaw.trim() ? a.weightingRaw : null,
            ulos: parseUlos(a.ulosStr),
            position: a.position,
          })),
          requisites: [
            ...prerequisites.map(u => ({ requisite_type: 'prerequisite' as const, requisite_unit_id: u.id })),
            ...corequisites.map(u => ({ requisite_type: 'corequisite' as const, requisite_unit_id: u.id })),
            ...antirequisites.map(u => ({ requisite_type: 'antirequisite' as const, requisite_unit_id: u.id })),
          ],
        })
        showSavedFeedback()
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          showSavedFeedback()
          return
        }
        const msg = err instanceof Error ? err.message : 'An error occurred'
        setFeedback({ type: 'error', message: msg })
      }
    })
  }

  return (
    <div className={`${styles.editLayout} ${unit ? '' : styles.editLayoutSingle}`}>
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
        <>
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
            <label className={styles.label}>CP</label>
            <input className={styles.input} type="number" step="0.1" min={0} value={creditPoints} onChange={e => setCreditPoints(e.target.value)} style={{ maxWidth: 160 }} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Overview</label>
            <textarea className={styles.textarea} rows={5} value={overview} onChange={e => setOverview(e.target.value)} placeholder="Unit description..." />
          </div>
        </div>
        </>
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
        <>
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
        </>
      )}

      {/* Tab: Content */}
      {activeTab === 'Content' && (
        <>
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
        </>
      )}

      {/* Tab: Assessments */}
      {activeTab === 'Assessments' && (
        <>
        <div className={styles.panel}>
          <div className={styles.assessmentsScroll}>
            <div className={styles.assessmentHeader}>
              <span className={styles.assessmentHeaderCell}>Type</span>
              <span className={styles.assessmentHeaderCell}>Task</span>
              <span className={styles.assessmentHeaderCell}>Weight %</span>
              <span className={styles.assessmentHeaderCell}>Official weighting</span>
              <span className={styles.assessmentHeaderCell}>ULOs</span>
              <span></span>
            </div>
            {assessments.map((a, index) => (
              <div key={index} className={styles.assessmentGrid}>
                <input className={styles.input} value={a.type} onChange={e => updateAssessment(index, 'type', e.target.value)} placeholder="e.g. Exam" />
                <input className={styles.input} value={a.task} onChange={e => updateAssessment(index, 'task', e.target.value)} placeholder="e.g. Individual" />
                <input className={styles.input} type="number" min="0" max="100" step="1" value={a.weight} onChange={e => updateAssessment(index, 'weight', e.target.value)} placeholder="e.g. 40" />
                <input className={styles.input} value={a.weightingRaw} onChange={e => updateAssessment(index, 'weightingRaw', e.target.value)} placeholder="e.g. 15 - 25%, Pass/Fail" />
                <input className={styles.input} value={a.ulosStr} onChange={e => updateAssessment(index, 'ulosStr', e.target.value)} placeholder="1,2,3" />
                <button type="button" className={styles.iconBtn} onClick={() => removeAssessment(index)} title="Remove">&times;</button>
              </div>
            ))}
          </div>
          <button type="button" className={styles.addBtn} onClick={addAssessment}>+ Add Assessment</button>
        </div>
        </>
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
          {isPending ? 'Saving...' : feedback?.type === 'success' ? 'Saved' : 'Save Changes'}
        </button>
        <Link href="/cms/units" className={styles.cancelLink}>Cancel</Link>
        {feedback?.type === 'error' && (
          <span className={`${styles.feedback} ${styles.feedbackError}`}>
            {feedback.message}
          </span>
        )}
      </div>
    </div>
      {unit && (
        <aside ref={updatePanelRef} className={styles.updateSidebar} tabIndex={-1} aria-labelledby="official-updates-heading">
          <div className={styles.updatePanel}>
            <div className={styles.updatePanelHeader}>
              <h2 id="official-updates-heading">Official Updates</h2>
              <p>{listedUpdates.length} update{listedUpdates.length === 1 ? '' : 's'} available</p>
            </div>
            <button type="button" className={styles.checkUpdatesBtn} onClick={checkUpdates} disabled={isCheckingUpdates || isPending}>
              {isCheckingUpdates ? 'Checking...' : 'Check Official Updates'}
            </button>
            {listedUpdates.length ? (
              <ul className={styles.updateList}>
                {listedUpdates.map(update => (
                  <li key={update.section} className={styles.updateListItem}>
                    <span>{UNIT_DETAIL_SECTION_LABELS[update.section]}</span>
                    <button type="button" className={styles.viewUpdateBtn} onClick={() => setSelectedUpdate(update)} disabled={isPending}>View</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.updateEmpty}>No official updates waiting for review.</p>
            )}
          </div>
        </aside>
      )}

      {selectedUpdate && (
        <UnitDetailReviewDialog
          update={selectedUpdate}
          currentContent={currentSectionContent(selectedUpdate.section)}
          busy={isPending}
          onClose={() => setSelectedUpdate(null)}
          onDecision={decision => reviewOfficialUpdate(selectedUpdate, decision)}
        />
      )}

      {checkDialog && !isCheckingUpdates && (
        <div className={styles.dialogOverlay} role="presentation" onMouseDown={event => event.target === event.currentTarget && setCheckDialog(null)}>
          <section className={styles.resultDialog} role="dialog" aria-modal="true" aria-labelledby="check-result-title">
            <h2 id="check-result-title">
              {checkDialog === 'updates' ? 'Official Check Complete' : checkDialog === 'no_changes' ? 'No Changes Found' : 'Unable to Check Official Information'}
            </h2>
            <p>
              {checkDialog === 'updates'
                ? updateResultMessage
                : checkDialog === 'no_changes'
                  ? 'This unit already matches the current official information.'
                  : 'No reliable official unit details could be retrieved. Your current content was not changed.'}
            </p>
            <footer className={styles.dialogActions}>
              {checkDialog === 'updates'
                ? <button type="button" className={styles.saveBtn} onClick={focusUpdatePanel} autoFocus>Review Updates</button>
                : <button type="button" className={styles.saveBtn} onClick={() => setCheckDialog(null)} autoFocus>OK</button>}
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
