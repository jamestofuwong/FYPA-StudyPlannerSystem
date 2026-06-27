'use client';

import { useRef, useState } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import type { CohortSession, CohortStudentResult } from '../../api/cohort/store';

type SortField = 'studentId' | 'studentName' | 'detectedMajor' | 'matchPct' | 'atRiskLevel' | 'graduationEligible' | 'missingCoreCount';
type SortDir = 'asc' | 'desc';

const RISK_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

function riskRowClass(level: string): string {
  switch (level) {
    case 'critical': return styles.rowCritical;
    case 'high':     return styles.rowHigh;
    case 'medium':   return styles.rowMedium;
    default:         return '';
  }
}

export default function CohortPage() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'import' | 'results'>('import');

  // Import mode
  const [importMode, setImportMode] = useState<'excel' | 'sequential'>('excel');

  // Mode A — Excel
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Mode B — Sequential
  const [studentIdsText, setStudentIdsText] = useState('');

  // Session state
  const [session, setSession] = useState<CohortSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Results table state
  const [sortField, setSortField] = useState<SortField>('matchPct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterLevel, setFilterLevel] = useState<string>('all');

  // ── File handling ──────────────────────────────────────────────────────────

  function handleFileSelected(file: File | null) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      showToast('Please select an Excel (.xlsx or .xls) file.', 'error');
      return;
    }
    setSelectedFile(file);
    showToast(`Selected: ${file.name}`, 'info');
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelected(e.dataTransfer.files?.[0] ?? null);
  }

  // ── Mode A — Excel upload ──────────────────────────────────────────────────

  async function handleExcelUpload() {
    if (!selectedFile) {
      showToast('Please select an Excel file first.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/cohort/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed.');
      }

      // Fetch the full session via status endpoint
      const statusRes = await fetch('/api/cohort/status');
      const statusData = await statusRes.json();
      setSession(statusData.session);
      showToast(`Processed ${data.totalCount} student(s).`, 'success');
      setActiveTab('results');
    } catch (err: any) {
      showToast(err.message ?? 'Upload failed.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Mode B — Sequential scraping ──────────────────────────────────────────

  async function handleStartSequential() {
    const ids = studentIdsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (ids.length === 0) {
      showToast('Please enter at least one student ID.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/cohort/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: ids }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start session.');

      const statusRes = await fetch('/api/cohort/status');
      const statusData = await statusRes.json();
      setSession(statusData.session);
      showToast(
        `Session created for ${data.totalCount} student(s). Use the Scraping page for each student, then submit results here.`,
        'info',
      );
    } catch (err: any) {
      showToast(err.message ?? 'Failed to start session.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Sort and filter ────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function getSortedFilteredResults(): CohortStudentResult[] {
    if (!session) return [];

    let results = [...session.results];

    if (filterLevel !== 'all') {
      results = results.filter(
        (r) => r.matchResult?.atRiskLevel === filterLevel,
      );
    }

    results.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortField) {
        case 'studentId':
          aVal = a.studentId;
          bVal = b.studentId;
          break;
        case 'studentName':
          aVal = a.studentName ?? '';
          bVal = b.studentName ?? '';
          break;
        case 'detectedMajor':
          aVal = a.matchResult?.detectedMajor ?? '';
          bVal = b.matchResult?.detectedMajor ?? '';
          break;
        case 'matchPct':
          aVal = a.matchResult?.matchPct ?? -1;
          bVal = b.matchResult?.matchPct ?? -1;
          break;
        case 'atRiskLevel':
          aVal = RISK_ORDER[a.matchResult?.atRiskLevel ?? ''] ?? -1;
          bVal = RISK_ORDER[b.matchResult?.atRiskLevel ?? ''] ?? -1;
          break;
        case 'graduationEligible':
          aVal = a.matchResult?.graduationEligible ? 1 : 0;
          bVal = b.matchResult?.graduationEligible ? 1 : 0;
          break;
        case 'missingCoreCount':
          aVal = a.matchResult?.missingCoreCount ?? 999;
          bVal = b.matchResult?.missingCoreCount ?? 999;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return results;
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    if (!session) {
      showToast('No session to export.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/cohort/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Export failed.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cohort-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Cohort report downloaded.', 'success');
    } catch (err: any) {
      showToast(err.message ?? 'Export failed.', 'error');
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function SortBtn({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return (
      <button
        className={`${styles.sortBtn} ${active ? styles.sortBtnActive : ''}`}
        onClick={() => handleSort(field)}
      >
        {label}{arrow}
      </button>
    );
  }

  const sortedResults = getSortedFilteredResults();
  const processedCount = session?.processedCount ?? 0;
  const totalCount = session?.totalCount ?? 0;
  const progressPct = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Tab bar */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'import' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('import')}
        >
          Import
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'results' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('results')}
          disabled={!session}
        >
          Results {session ? `(${session.results.length})` : ''}
        </button>

        {/* Export button in header area when results available */}
        {session && activeTab === 'results' && (
          <button className={styles.exportBtn} onClick={handleExport}>
            Export Excel
          </button>
        )}
      </div>

      {/* Progress bar — shown during processing */}
      {isProcessing && (
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ── Import tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'import' && (
        <div className={styles.tabContent}>
          <div className={styles.sectionTitle}>Cohort Processing</div>

          {/* Mode selector */}
          <div className={styles.modeSelector}>
            <button
              className={`${styles.modeBtn} ${importMode === 'excel' ? styles.modeBtnActive : ''}`}
              onClick={() => setImportMode('excel')}
            >
              Mode A — Bulk Excel Upload
            </button>
            <button
              className={`${styles.modeBtn} ${importMode === 'sequential' ? styles.modeBtnActive : ''}`}
              onClick={() => setImportMode('sequential')}
            >
              Mode B — Sequential Scraping
            </button>
          </div>

          {/* Mode A */}
          {importMode === 'excel' && (
            <div className={styles.modePanel}>
              <p className={styles.modeDesc}>
                Upload a cohort Excel file containing multiple students. Each student
                block begins with a row containing the student ID, name, intake year,
                and intake month, followed by their unit rows.
              </p>

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                className={`${styles.uploadZone} ${isDragging ? styles.uploadZoneActive : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <div className={styles.uploadIcon}>XLS</div>
                <div className={styles.uploadTitle}>
                  {selectedFile ? selectedFile.name : 'Drag and drop cohort Excel file here'}
                </div>
                <div className={styles.uploadSubtitle}>
                  or click to browse files
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className={styles.hiddenInput}
                onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
              />

              <button
                className={styles.btnPrimary}
                onClick={handleExcelUpload}
                disabled={isProcessing || !selectedFile}
              >
                {isProcessing ? 'Processing...' : 'Upload Cohort Excel'}
              </button>
            </div>
          )}

          {/* Mode B */}
          {importMode === 'sequential' && (
            <div className={styles.modePanel}>
              <p className={styles.modeDesc}>
                Enter student IDs one per line (or comma-separated). The system will
                create a session. You then scrape each student via the Scraping page —
                results are automatically submitted to this session.
              </p>

              <textarea
                className={styles.idTextarea}
                placeholder={'12345678\n12345679\n12345680'}
                value={studentIdsText}
                onChange={(e) => setStudentIdsText(e.target.value)}
                rows={8}
              />

              <button
                className={styles.btnPrimary}
                onClick={handleStartSequential}
                disabled={isProcessing || !studentIdsText.trim()}
              >
                {isProcessing ? 'Creating Session...' : 'Start Sequential Scraping'}
              </button>

              {session?.mode === 'sequential' && (
                <div className={styles.sequentialInstructions}>
                  <strong>Session active.</strong> Use the Scraping page to scrape each
                  student. Progress is tracked here automatically.
                  <div className={styles.progressLabel}>
                    {processedCount} / {totalCount} processed
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Results tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'results' && session && (
        <div className={styles.tabContent}>
          <div className={styles.filterBar}>
            <span className={styles.filterLabel}>Filter by risk:</span>
            {['all', 'critical', 'high', 'medium', 'low'].map((level) => (
              <button
                key={level}
                className={`${styles.filterBtn} ${filterLevel === level ? styles.filterBtnActive : ''}`}
                onClick={() => setFilterLevel(level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
            <span className={styles.resultCount}>
              {sortedResults.length} / {session.results.length} students
            </span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th><SortBtn field="studentId" label="Student ID" /></th>
                  <th><SortBtn field="studentName" label="Name" /></th>
                  <th><SortBtn field="detectedMajor" label="Detected Major" /></th>
                  <th><SortBtn field="matchPct" label="Match %" /></th>
                  <th><SortBtn field="atRiskLevel" label="At-Risk" /></th>
                  <th><SortBtn field="graduationEligible" label="Grad Eligible" /></th>
                  <th><SortBtn field="missingCoreCount" label="Missing Core" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.length === 0 && (
                  <tr>
                    <td colSpan={7} className={styles.emptyRow}>
                      No results match the current filter.
                    </td>
                  </tr>
                )}
                {sortedResults.map((r) => {
                  const mr = r.matchResult;
                  const riskClass = riskRowClass(mr?.atRiskLevel ?? '');
                  return (
                    <tr key={r.studentId} className={riskClass}>
                      <td className={styles.monoCell}>{r.studentId}</td>
                      <td>{r.studentName ?? '—'}</td>
                      <td>{mr?.detectedMajor ?? <span className={styles.dimText}>—</span>}</td>
                      <td className={styles.numCell}>
                        {mr ? `${mr.matchPct.toFixed(1)}%` : '—'}
                      </td>
                      <td>
                        {mr?.atRiskLevel ? (
                          <span className={`${styles.riskBadge} ${styles[`risk_${mr.atRiskLevel}`]}`}>
                            {mr.atRiskLevel}
                          </span>
                        ) : (
                          r.status === 'error' ? (
                            <span className={styles.errorText}>{r.error ?? 'Error'}</span>
                          ) : '—'
                        )}
                      </td>
                      <td className={styles.numCell}>
                        {mr ? (mr.graduationEligible ? 'Yes' : 'No') : '—'}
                      </td>
                      <td className={styles.numCell}>
                        {mr?.missingCoreCount ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
