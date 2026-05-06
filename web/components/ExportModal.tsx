'use client';

import { useState } from 'react';
import styles from './ExportModal.module.css';
import { useToast } from './providers/ToastProvider';
import {
  EXPORT_SECTION_LABELS,
  type ExportSection,
  type ExportInput,
} from '../../core/shared/types/export';

const ALL_SECTIONS: ExportSection[] = ['student_profile', 'major_match', 'unit_plan', 'study_planner'];

interface ExportModalProps {
  exportInput: Omit<ExportInput, 'options'>;
  onClose: () => void;
}

export default function ExportModal({ exportInput, onClose }: ExportModalProps) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Set<ExportSection>>(new Set(ALL_SECTIONS));
  const [isExporting, setIsExporting] = useState(false);

  const allSelected = selected.size === ALL_SECTIONS.length;

  function toggleSection(section: ExportSection) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ALL_SECTIONS));
  }

  const plannerSubtext = (() => {
    const p = exportInput.planner;
    const parts: string[] = [];
    if (p.course?.name) parts.push(p.course.name);
    if (p.major?.name) parts.push(p.major.name);
    if (exportInput.intakeYear) {
      const monthStr = p.intakeMonth != null
        ? new Date(2000, p.intakeMonth - 1).toLocaleString('default', { month: 'long' })
        : null;
      parts.push([exportInput.intakeYear, monthStr].filter(Boolean).join(' '));
    }
    return parts.join(' · ');
  })();

  async function handleExport() {
    if (selected.size === 0) {
      showToast('Select at least one section to export.', 'error');
      return;
    }

    setIsExporting(true);
    try {
      const input: ExportInput = { ...exportInput, options: { sections: [...selected] } };
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Export failed.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-${exportInput.studentId}-report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('Report exported successfully.', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Export Report</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.subtitle}>Select the sections to include in the .xlsx report.</div>

          <button className={styles.selectAll} onClick={toggleAll}>
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>

          <div className={styles.sections}>
            {ALL_SECTIONS.map((section) => (
              <label key={section} className={styles.sectionRow} style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  style={{ marginTop: 2 }}
                  checked={selected.has(section)}
                  onChange={() => toggleSection(section)}
                />
                <span>
                  <span className={styles.sectionLabel}>{EXPORT_SECTION_LABELS[section]}</span>
                  {section === 'study_planner' && plannerSubtext && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {plannerSubtext}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isExporting}>
            Cancel
          </button>
          <button className={styles.exportBtn} onClick={handleExport} disabled={isExporting || selected.size === 0}>
            {isExporting ? 'Exporting...' : `Export ${selected.size > 0 ? `(${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
