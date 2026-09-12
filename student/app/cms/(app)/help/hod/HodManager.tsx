'use client'
import { useState, useTransition } from 'react'
import { saveHods } from './hod-actions'
import styles from './page.module.css'

interface Hod {
  id?: string
  faculty: string
  department: string
  name: string
  email: string
  position: number
}

interface Props {
  initialHods: Hod[]
}

export default function HodManager({ initialHods }: Props) {
  const [hods, setHods] = useState<Hod[]>(
    initialHods.map((h, i) => ({
      id: h.id,
      faculty: h.faculty,
      department: h.department,
      name: h.name,
      email: h.email,
      position: h.position ?? i + 1,
    }))
  )
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function markDirty() {
    setIsDirty(true)
    setFeedback(null)
  }

  function updateHod<K extends keyof Hod>(index: number, key: K, value: Hod[K]) {
    setHods(prev => prev.map((h, i) => (i === index ? { ...h, [key]: value } : h)))
    markDirty()
  }

  function addRow() {
    const newIndex = hods.length
    setHods(prev => [
      ...prev,
      { faculty: '', department: '', name: '', email: '', position: prev.length + 1 },
    ])
    setEditingIndex(newIndex)
    markDirty()
  }

  function deleteRow(index: number) {
    setHods(prev => {
      const next = prev.filter((_, i) => i !== index)
      return next.map((h, i) => ({ ...h, position: i + 1 }))
    })
    if (editingIndex === index) setEditingIndex(null)
    markDirty()
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await saveHods(hods.map((h, i) => ({
          id: h.id,
          faculty: h.faculty,
          department: h.department,
          name: h.name,
          email: h.email,
          position: i + 1,
        })))
        setIsDirty(false)
        setEditingIndex(null)
        setFeedback({ type: 'success', message: 'Heads of Department saved successfully.' })
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
          <h1 className={styles.heading}>Heads of Department</h1>
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

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Faculty</th>
              <th className={styles.th}>Department</th>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Email</th>
              <th className={styles.th} style={{ width: 80 }}>Position</th>
              <th className={styles.th} style={{ width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hods.map((hod, index) => (
              <>
                <tr key={`row-${index}`} className={styles.tr}>
                  <td className={styles.td}>{hod.faculty || <em style={{ color: '#9ca3af' }}>—</em>}</td>
                  <td className={styles.td}>{hod.department || <em style={{ color: '#9ca3af' }}>—</em>}</td>
                  <td className={styles.td}>{hod.name || <em style={{ color: '#9ca3af' }}>—</em>}</td>
                  <td className={styles.td}>{hod.email || <em style={{ color: '#9ca3af' }}>—</em>}</td>
                  <td className={styles.td}>{hod.position}</td>
                  <td className={styles.td}>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${editingIndex === index ? styles.actionBtnActive : ''}`}
                        onClick={() => setEditingIndex(prev => prev === index ? null : index)}
                      >
                        {editingIndex === index ? 'Done' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtnDanger}
                        onClick={() => deleteRow(index)}
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
                {editingIndex === index && (
                  <tr key={`edit-${index}`} className={styles.editRow}>
                    <td className={styles.editTd} colSpan={6}>
                      <div className={styles.editGrid}>
                        <div className={styles.editField}>
                          <label className={styles.editLabel}>Faculty</label>
                          <input
                            className={styles.input}
                            value={hod.faculty}
                            onChange={e => updateHod(index, 'faculty', e.target.value)}
                            placeholder="Faculty name"
                          />
                        </div>
                        <div className={styles.editField}>
                          <label className={styles.editLabel}>Department</label>
                          <input
                            className={styles.input}
                            value={hod.department}
                            onChange={e => updateHod(index, 'department', e.target.value)}
                            placeholder="Department name"
                          />
                        </div>
                        <div className={styles.editField}>
                          <label className={styles.editLabel}>Name</label>
                          <input
                            className={styles.input}
                            value={hod.name}
                            onChange={e => updateHod(index, 'name', e.target.value)}
                            placeholder="Full name"
                          />
                        </div>
                        <div className={styles.editField}>
                          <label className={styles.editLabel}>Email</label>
                          <input
                            className={styles.input}
                            type="email"
                            value={hod.email}
                            onChange={e => updateHod(index, 'email', e.target.value)}
                            placeholder="email@university.edu.au"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {hods.length === 0 && (
              <tr>
                <td className={styles.td} colSpan={6} style={{ textAlign: 'center', color: '#6b7280' }}>
                  No heads of department yet. Add a row to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.addArea}>
        <button type="button" className={styles.addBtn} onClick={addRow}>
          + Add Row
        </button>
      </div>
    </div>
  )
}
