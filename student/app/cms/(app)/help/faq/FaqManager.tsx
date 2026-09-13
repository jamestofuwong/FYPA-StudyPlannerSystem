'use client'
import { useState, useTransition } from 'react'
import { saveFaqItems } from './faq-actions'
import styles from './page.module.css'

interface FaqItem {
  id?: string
  question: string
  answer: string
  position: number
}

interface Props {
  initialItems: FaqItem[]
}

export default function FaqManager({ initialItems }: Props) {
  const [items, setItems] = useState<FaqItem[]>(
    initialItems.map((item, i) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
      position: item.position ?? i + 1,
    }))
  )
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function markDirty() {
    setIsDirty(true)
    setFeedback(null)
  }

  function updateItem(index: number, field: 'question' | 'answer', value: string) {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
    markDirty()
  }

  function addItem() {
    setItems(prev => {
      const next = [...prev, { question: '', answer: '', position: prev.length + 1 }]
      return next
    })
    setExpandedIndex(items.length)
    markDirty()
  }

  function deleteItem(index: number) {
    setItems(prev => {
      const next = prev.filter((_, i) => i !== index)
      return next.map((item, i) => ({ ...item, position: i + 1 }))
    })
    if (expandedIndex === index) setExpandedIndex(null)
    markDirty()
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    setItems(prev => {
      const next = [...prev]
      const swapIdx = direction === 'up' ? index - 1 : index + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
      return next.map((item, i) => ({ ...item, position: i + 1 }))
    })
    markDirty()
  }

  function toggleExpand(index: number) {
    setExpandedIndex(prev => (prev === index ? null : index))
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await saveFaqItems(items.map((item, i) => ({
          id: item.id,
          question: item.question,
          answer: item.answer,
          position: i + 1,
        })))
        setIsDirty(false)
        setFeedback({ type: 'success', message: 'FAQ items saved successfully.' })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to save'
        setFeedback({ type: 'error', message: msg })
      }
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>FAQ</h1>
          {isDirty && <span className={styles.unsaved}>Unsaved changes</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {feedback && (
            <span
              style={{
                fontSize: 13,
                color: feedback.type === 'success' ? '#166534' : '#dc2626',
              }}
            >
              {feedback.message}
            </span>
          )}
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isPending || !isDirty}
          >
            {isPending ? 'Saving...' : isDirty ? 'Save Changes*' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {items.map((item, index) => (
          <div key={index} className={styles.item}>
            <div className={styles.itemHeader}>
              <span className={styles.itemNum}>{index + 1}</span>
              <div className={styles.itemContent}>
                <p className={styles.itemQuestion}>
                  {item.question || <em style={{ color: '#9ca3af' }}>Untitled question</em>}
                </p>
                {item.answer ? (
                  <p className={styles.itemAnswer}>{item.answer}</p>
                ) : (
                  <p className={styles.itemAnswerEmpty}>No answer yet</p>
                )}
              </div>
              <div className={styles.itemControls}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => moveItem(index, 'up')}
                  disabled={index === 0}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => moveItem(index, 'down')}
                  disabled={index === items.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${expandedIndex === index ? styles.iconBtnActive : ''}`}
                  onClick={() => toggleExpand(index)}
                  title={expandedIndex === index ? 'Collapse' : 'Edit'}
                >
                  {expandedIndex === index ? '▲' : '✎'}
                </button>
                <button
                  type="button"
                  className={styles.iconBtnDanger}
                  onClick={() => deleteItem(index)}
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            </div>

            {expandedIndex === index && (
              <div className={styles.itemEdit}>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>Question</label>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={item.question}
                    onChange={e => updateItem(index, 'question', e.target.value)}
                    placeholder="FAQ question..."
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>Answer</label>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={item.answer}
                    onChange={e => updateItem(index, 'answer', e.target.value)}
                    placeholder="FAQ answer..."
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        <div className={styles.addArea}>
          <button type="button" className={styles.addBtn} onClick={addItem}>
            + Add FAQ Item
          </button>
        </div>
      </div>
    </div>
  )
}
