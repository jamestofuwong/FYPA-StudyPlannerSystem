'use client';

import { useState } from 'react';
import styles from './page.module.css';

type InferredDiffItem = {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  current_offerings: number[];
  proposed_offerings: number[];
  status: 'new' | 'changed' | 'unchanged';
};

type SyncPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  yearRangeStr: string;
  totalPlanners: number;
  initialDiffs: InferredDiffItem[];
  onRefresh: () => Promise<void>;
};

const TERMS = [
  { id: 1, label: 'Sem 1' },
  { id: 2, label: 'Sem 2' },
  { id: 3, label: 'Summer' },
  { id: 4, label: 'Winter' },
];

function formatTerms(terms: number[]): string {
  if (!terms || terms.length === 0) return '-';
  const labelMap: Record<number, string> = { 1: 'Sem 1', 2: 'Sem 2', 3: 'Summer', 4: 'Winter' };
  return terms.map((t) => labelMap[t] || `Term ${t}`).join(', ');
}

export default function SyncOfferingsPreviewModal({
  isOpen,
  onClose,
  yearRangeStr,
  totalPlanners,
  initialDiffs,
  onRefresh,
}: SyncPreviewModalProps) {
  const [editableDiffs, setEditableDiffs] = useState<InferredDiffItem[]>(initialDiffs);
  const [filterChangedOnly, setFilterChangedOnly] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  // Toggle term checkbox in the proposed column
  const handleToggleTerm = (unitCode: string, termId: number) => {
    setEditableDiffs((prev) =>
      prev.map((item) => {
        if (item.unit_code !== unitCode) return item;
        const exists = item.proposed_offerings.includes(termId);
        const updated = exists
          ? item.proposed_offerings.filter((t) => t !== termId)
          : [...item.proposed_offerings, termId].sort((a, b) => a - b);
        return {
          ...item,
          proposed_offerings: updated,
          status: 'changed',
        };
      })
    );
  };

  // Submit the overwrite payload
  const handleConfirmOverwrite = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const updates = editableDiffs.map((d) => ({
        unit_id: d.unit_id,
        offerings: d.proposed_offerings,
      }));

      const res = await fetch('/api/units/offerings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to overwrite offerings.');
      }

      await onRefresh();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error overwriting offerings.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedDiffs = filterChangedOnly
    ? editableDiffs.filter((d) => d.status !== 'unchanged')
    : editableDiffs;

  const totalChanges = editableDiffs.filter((d) => d.status !== 'unchanged').length;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.largeOfferingsModal}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '1000px' }}
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Auto-Detect Offerings Review</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Analyzed <strong>{totalPlanners}</strong> planners across <strong>{yearRangeStr}</strong>. Detected changes for <strong>{totalChanges}</strong> units.
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {errorMessage && <div className={styles.errorAlert}>{errorMessage}</div>}

        {/* Filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0' }}>
          <label className={styles.checkboxLabel} style={{ fontSize: '11px' }}>
            <input
              type="checkbox"
              checked={filterChangedOnly}
              onChange={(e) => setFilterChangedOnly(e.target.checked)}
            />
            Show changed & new units only ({totalChanges})
          </label>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            You can modify the proposed checkboxes before confirming overwrite.
          </span>
        </div>

        {/* Diff Table */}
        <div className={styles.offeringsScrollBody}>
          <div className={styles.tableWrap}>
            {displayedDiffs.length === 0 ? (
              <div className={styles.termEmpty}>No differences found. Current offerings match recent planners.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '15%' }}>UNIT CODE</th>
                    <th style={{ width: '32%' }}>UNIT TITLE</th>
                    <th style={{ width: '18%' }}>CURRENT OFFERINGS</th>
                    <th style={{ width: '25%' }}>PROPOSED (EDITABLE)</th>
                    <th style={{ width: '10%', textAlign: 'center' }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedDiffs.map((d) => (
                    <tr key={d.unit_code}>
                      <td><code className={styles.code}>{d.unit_code}</code></td>
                      <td className={styles.unitNameText}>{d.unit_name}</td>
                      <td>
                        <span className={styles.itemMeta}>{formatTerms(d.current_offerings)}</span>
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          {TERMS.map((t) => (
                            <label
                              key={t.id}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              <input
                                type="checkbox"
                                checked={d.proposed_offerings.includes(t.id)}
                                onChange={() => handleToggleTerm(d.unit_code, t.id)}
                              />
                              {t.label}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {d.status === 'new' ? (
                          <span className={`${styles.badge} ${styles.badgeOrange}`}>NEW</span>
                        ) : d.status === 'changed' ? (
                          <span className={`${styles.badge} ${styles.badgeYellow}`}>MODIFIED</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeGreen}`}>MATCH</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.modalActions}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleConfirmOverwrite}
            disabled={isSubmitting || totalChanges === 0}
          >
            {isSubmitting ? 'Overwriting...' : `Confirm & Overwrite (${totalChanges} Units)`}
          </button>
        </div>
      </div>
    </div>
  );
}
