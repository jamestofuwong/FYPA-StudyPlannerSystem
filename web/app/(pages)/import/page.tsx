'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import type {
  PlannerImportPlanner,
  PlannerImportReport,
  PlannerImportUnit,
} from '../../../../core/shared/types/plannerImport';

type ImportHistoryItem = {
  id: string;
  name: string;
  status: string;
  detail: string;
  cls: 'badgeGreen' | 'badgeOrange' | 'badgeRed' | 'badgeBlue';
};

type PlannerApiResponse = {
  planner: PlannerImportPlanner;
  report: PlannerImportReport;
};

function getImportStatusLabel(status: string): string {
  switch (status) {
    case 'deterministic_ok':
      return 'Parsed Successfully';
    case 'llm_fallback_used':
      return 'Parsed with LLM Review';
    case 'manual_review_required':
      return 'Needs Manual Review';
    default:
      return 'Processed';
  }
}

function getConfidenceTone(confidence: string): keyof typeof styles {
  switch (confidence) {
    case 'high':
      return 'signalStrong';
    case 'medium':
      return 'signalModerate';
    default:
      return 'signalCritical';
  }
}

function getStatusTone(status: string): keyof typeof styles {
  switch (status) {
    case 'Parsed Successfully':
      return 'signalStrong';
    case 'Parsed with LLM Review':
      return 'signalModerate';
    case 'Needs Manual Review':
      return 'signalCritical';
    default:
      return 'signalNeutral';
  }
}

function formatRequirement(value: { count: number | null; cp: number | null }): string {
  const count = value.count ?? '-';
  const cp = value.cp ?? '-';
  return `${count} units / ${cp} cp`;
}

function formatConfidenceScore(score: number | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '-';
  return `${Math.round(score * 100)}%`;
}

function categoryLabel(category: string | null): string {
  if (!category) return 'Unknown';
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function badgeClassForCategory(category: string | null): keyof typeof styles {
  switch (category) {
    case 'core':
      return 'badgeBlue';
    case 'major_core':
      return 'badgeOrange';
    case 'mpu':
      return 'badgeYellow';
    case 'wil':
      return 'badgeRed';
    case 'prescribed_elective':
      return 'badgeOrange';
    default:
      return 'badgeGreen';
  }
}

function flattenUnits(planner: PlannerImportPlanner | null): PlannerImportUnit[] {
  if (!planner) return [];
  const c = planner.categories ?? {};
  const eg = c.elective_groups ?? {};
  return [
    ...(c.core_units ?? []),
    ...(c.major_units ?? []),
    ...(c.mpu_group ?? []),
    ...(eg.prescribed_elective ?? []),
    ...(eg.elective ?? []),
    ...(c.wil_group ?? []),
  ];
}

type OllamaStatus = {
  ollama: 'unknown' | 'available' | 'unavailable';
  model: 'unknown' | 'ready' | 'pulling' | 'unavailable';
  pullProgress: number;
  pullError: string | null;
};

export default function ImportPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [useLlm, setUseLlm] = useState(true);
  const [planner, setPlanner] = useState<PlannerImportPlanner | null>(null);
  const [report, setReport] = useState<PlannerImportReport | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({
    ollama: 'unknown', model: 'unknown', pullProgress: 0, pullError: null,
  });

  // Revoke old object URL when file changes or component unmounts
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Poll Ollama status on mount and while model is pulling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const check = async () => {
      const res = await fetch('/api/ollama/status').catch(() => null);
      if (!res?.ok) return;
      const data = await res.json() as OllamaStatus;
      setOllamaStatus(data);
      if (data.model === 'ready' || (data.ollama === 'unavailable' && data.model !== 'pulling')) {
        clearInterval(interval);
      }
    };

    check();
    interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  const modelReady = ollamaStatus.model === 'ready';
  const effectiveUseLlm = useLlm && modelReady;

  const units = useMemo(() => flattenUnits(planner), [planner]);

  const summary = useMemo(() => {
    if (!planner || !report) return null;

    const validationIssues = Array.from(new Set(report.validation_issues));

    return {
      course: planner.course_information.course || 'Unknown course',
      major: planner.course_information.major || 'Unknown major',
      intake: planner.course_information.intake || 'Unknown intake',
      intakeYear: planner.course_information.intake_year ?? '-',
      core: planner.course_information.requirements.core,
      majorReq: planner.course_information.requirements.major,
      elective: planner.course_information.requirements.elective,
      wil: planner.course_information.requirements.wil,
      statusLabel: getImportStatusLabel(report.outcome.status),
      statusTone: getStatusTone(getImportStatusLabel(report.outcome.status)),
      confidence: report.outcome.confidence,
      confidenceScore: report.confidence?.overall_score,
      confidenceScoreLabel: formatConfidenceScore(report.confidence?.overall_score),
      manualReviewRequired: report.confidence?.manual_review_required ?? report.outcome.status === 'manual_review_required',
      confidenceTone: getConfidenceTone(report.outcome.confidence),
      reason: validationIssues.length > 0 ? null : report.outcome.reason,
      llmApplied: report.llm_applied,
      missingCount: validationIssues.length,
      validationIssues,
    };
  }, [planner, report]);

  const handleFileSelected = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please choose a PDF planner file.', 'error');
      return;
    }
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setSelectedFile(file);
    setPdfUrl(URL.createObjectURL(file));
    setPlanner(null);
    setReport(null);
    showToast(`Selected ${file.name}`, 'info');
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelected(event.target.files?.[0] ?? null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFileSelected(event.dataTransfer.files?.[0] ?? null);
  };

  const handleDownloadModel = async () => {
    const res = await fetch('/api/ollama/pull', { method: 'POST' }).catch(() => null);
    if (!res?.ok) {
      showToast('Failed to start model download.', 'error');
      return;
    }
    const data = await res.json();
    showToast(data.message ?? 'Downloading AI model...', 'info');
    setOllamaStatus((prev) => ({ ...prev, model: 'pulling', pullProgress: 0 }));
  };

  const handleParse = async () => {
    if (!selectedFile) {
      showToast('Choose a PDF before parsing.', 'error');
      return;
    }

    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('useLlm', String(effectiveUseLlm));

      const response = await fetch('/api/planners', {
        method: 'POST',
        body: formData,
      });

      const data = (await response.json()) as PlannerApiResponse | { error?: string };
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to import planner.');
      }

      const payload = data as PlannerApiResponse;
      setPlanner(payload.planner);
      setReport(payload.report);
      setHistory((prev) => [
        {
          id: `${selectedFile.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: selectedFile.name,
          status: getImportStatusLabel(payload.report.outcome.status),
          detail: `${payload.report.unit_counts.core_units ?? 0} core units | ${payload.report.unit_counts.major_units ?? 0} major units | ${formatConfidenceScore(payload.report.confidence?.overall_score)} score`,
          cls: payload.report.validation_issues.length ? 'badgeOrange' : 'badgeGreen',
        },
        ...prev.slice(0, 4),
      ]);
      showToast('Planner parsed successfully.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import planner.';
      showToast(message, 'error');
    } finally {
      setIsParsing(false);
    }
  };

  const handleClear = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setSelectedFile(null);
    setPdfUrl(null);
    setPlanner(null);
    setReport(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('Import session cleared.', 'info');
  };

  const handleSaveToDatabase = async () => {
    if (!planner) return;

    setIsParsing(true);
    try {
      const response = await fetch('/api/planners/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planner }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save planner to database.');
      }

      showToast('Planner saved to database successfully!', 'success');
      router.push('/planners');

    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Save failed', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // ── Hidden file input (shared between both states) ────────────────────────
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/pdf,.pdf"
      className={styles.hiddenInput}
      onChange={handleInputChange}
    />
  );

  // ── Before file selected: full-width drop zone ────────────────────────────
  if (!selectedFile) {
    return (
      <div className={styles.panel}>
        {fileInput}
        <div className={styles.sectionTitle}>PDF Planner Import &amp; OCR</div>
        <div
          role="button"
          tabIndex={0}
          className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); }
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className={styles.dropIcon}>PDF</div>
          <div className={styles.dropTitle}>Drag and drop a study planner PDF here</div>
          <div className={styles.dropSubtitle}>or click to browse files. Parsed data stays inside the app flow.</div>
          <div className={styles.dropMeta}>No file selected</div>
        </div>

        {/* Import history below the drop zone */}
        {history.length > 0 && (
          <>
            <div className={styles.sectionTitle} style={{ marginTop: 8 }}>Import History</div>
            <div className={styles.card}>
              <div className={styles.historyList}>
                {history.map((item) => (
                  <div key={item.id} className={styles.historyRow}>
                    <div className={styles.historyHeader}>
                      <div className={styles.historyMain}>
                        <span className={styles.historyName}>{item.name}</span>
                        <span className={styles.historyDetail}>{item.detail}</span>
                      </div>
                      <span className={`${styles.badge} ${styles[item.cls]}`}>{item.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── After file selected: split screen ─────────────────────────────────────
  return (
    <div className={styles.panelSplit}>
      {fileInput}

      <div className={styles.splitScreen}>
        {/* ── Left: PDF viewer ─────────────────────────────────────────── */}
        <div className={styles.pdfPane}>
          <div className={styles.pdfHeader}>
            <span className={styles.pdfFileName}>{selectedFile.name}</span>
            <button
              className={styles.btnSecondary}
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
            >
              Change
            </button>
            <button
              className={styles.btnDanger}
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={handleClear}
              disabled={isParsing}
            >
              ✕ Clear
            </button>
          </div>
          <embed
            src={pdfUrl ?? ''}
            type="application/pdf"
            className={styles.pdfViewer}
          />
        </div>

        {/* ── Right: controls + results ─────────────────────────────────── */}
        <div className={styles.resultsPane}>

          {/* Import Configuration */}
          <div className={styles.sectionTitle}>Import Configuration</div>
          <div className={styles.card}>
            <div className={styles.formGrid2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Selected PDF</label>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  value={selectedFile.name}
                  readOnly
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>AI Review</label>
                <select
                  className={styles.formSelect}
                  value={useLlm ? 'enabled' : 'disabled'}
                  onChange={(e) => setUseLlm(e.target.value === 'enabled')}
                  disabled={!modelReady}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>

            {/* Ollama / model status notices */}
            {ollamaStatus.ollama === 'unavailable' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, padding: '6px 10px', background: 'rgba(244,135,113,0.08)', border: '1px solid rgba(244,135,113,0.25)', borderRadius: 4 }}>
                AI model server is not running — AI Review is disabled.
              </div>
            )}
            {ollamaStatus.ollama === 'available' && ollamaStatus.model === 'unavailable' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '6px 10px', background: 'rgba(206,153,62,0.08)', border: '1px solid rgba(206,153,62,0.25)', borderRadius: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>AI model not downloaded — required for LLM review (~1.1 GB).</span>
                <button className={styles.btnSecondary} style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleDownloadModel}>Download</button>
              </div>
            )}
            {ollamaStatus.model === 'pulling' && (
              <div style={{ marginBottom: 10, padding: '6px 10px', background: 'rgba(86,156,214,0.08)', border: '1px solid rgba(86,156,214,0.25)', borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Downloading AI model... {ollamaStatus.pullProgress}%</div>
                <div style={{ height: 4, background: 'var(--surface-bg)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${ollamaStatus.pullProgress}%`, background: 'var(--accent-blue)', transition: 'width 0.3s' }} />
                </div>
              </div>
            )}
            {ollamaStatus.pullError && (
              <div style={{ fontSize: 11, color: 'var(--accent-red)', marginBottom: 10 }}>
                Download failed: {ollamaStatus.pullError}
              </div>
            )}

            <div className={styles.btnGroup}>
              <button className={styles.btnPrimary} onClick={handleParse} disabled={isParsing}>
                {isParsing && !planner ? 'Parsing...' : 'Parse PDF'}
              </button>
              <button
                className={styles.btnSuccess}
                onClick={handleSaveToDatabase}
                disabled={isParsing || !planner}
              >
                {isParsing && planner ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>

          {/* Parsing spinner */}
          {isParsing && !planner && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
              <div className={styles.spinner} />
              Parsing PDF...
            </div>
          )}

          {/* Extracted Planner Summary */}
          {summary && (
            <>
              <div className={styles.sectionTitle}>Extracted Summary</div>
              <div className={styles.card}>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Course</span>
                    <span className={styles.summaryValue}>{summary.course}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Major</span>
                    <span className={styles.summaryValue}>{summary.major}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Intake</span>
                    <span className={styles.summaryValue}>{summary.intake}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Intake Year</span>
                    <span className={styles.summaryValue}>{summary.intakeYear}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Core</span>
                    <span className={styles.summaryValue}>{formatRequirement(summary.core)}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Major</span>
                    <span className={styles.summaryValue}>{formatRequirement(summary.majorReq)}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Elective</span>
                    <span className={styles.summaryValue}>{formatRequirement(summary.elective)}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>WIL</span>
                    <span className={styles.summaryValue}>{formatRequirement(summary.wil)}</span>
                  </div>
                </div>

                <div className={styles.signalGrid}>
                  <div className={`${styles.signalRow} ${styles[summary.statusTone]}`}>
                    <div className={styles.signalMain}>
                      <span className={styles.signalRowLabel}>Import Status</span>
                      <span className={`${styles.badge} ${styles.signalBadge} ${styles[summary.statusTone]}`}>{summary.statusLabel}</span>
                    </div>
                  </div>
                  <div className={`${styles.signalRow} ${styles[summary.confidenceTone]}`}>
                    <div className={styles.signalMain}>
                      <span className={styles.signalRowLabel}>Confidence</span>
                      <span className={`${styles.badge} ${styles.signalBadge} ${styles[summary.confidenceTone]}`}>
                        {summary.confidence} ({summary.confidenceScoreLabel})
                      </span>
                    </div>
                  </div>
                  <div className={`${styles.signalRow} ${summary.manualReviewRequired ? styles.signalCritical : styles.signalStrong}`}>
                    <div className={styles.signalMain}>
                      <span className={styles.signalRowLabel}>Review Decision</span>
                      <span className={`${styles.badge} ${styles.signalBadge} ${summary.manualReviewRequired ? styles.signalCritical : styles.signalStrong}`}>
                        {summary.manualReviewRequired ? 'Manual Review' : 'Ready'}
                      </span>
                    </div>
                  </div>
                  <div className={`${styles.signalRow} ${summary.llmApplied ? styles.signalModerate : styles.signalNeutral}`}>
                    <div className={styles.signalMain}>
                      <span className={styles.signalRowLabel}>LLM Review</span>
                      <span className={`${styles.badge} ${styles.signalBadge} ${summary.llmApplied ? styles.signalModerate : styles.signalNeutral}`}>
                        {summary.llmApplied ? 'Applied' : 'Not Applied'}
                      </span>
                    </div>
                  </div>
                  <div className={`${styles.signalRow} ${summary.missingCount > 0 ? styles.signalCritical : styles.signalStrong}`}>
                    <div className={styles.signalMain}>
                      <span className={styles.signalRowLabel}>Missing Data</span>
                      <span className={`${styles.badge} ${styles.signalBadge} ${summary.missingCount > 0 ? styles.signalCritical : styles.signalStrong}`}>
                        {summary.missingCount > 0 ? `${summary.missingCount} issue${summary.missingCount > 1 ? 's' : ''}` : 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                {summary.reason && <div className={styles.reasonBox}>{summary.reason}</div>}

                {summary.validationIssues.length > 0 && (
                  <div className={styles.validationBox}>
                    {summary.validationIssues.map((issue) => (
                      <div key={issue} className={styles.validationIssue}>{issue}</div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Parsed Units Table — always shown once planner is available */}
          {planner && (
            <>
              <div className={styles.sectionTitle}>Parsed Units</div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Unit Code</th>
                      <th>Unit Name</th>
                      <th>Sem</th>
                      <th>Year</th>
                      <th>Type</th>
                      <th>Prerequisite</th>
                      <th>Offered In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.length > 0 ? units.map((unit, index) => (
                      <tr key={`${unit.unit_code}-${unit.unit_name}-${index}`}>
                        <td>{index + 1}</td>
                        <td><code className={styles.code}>{unit.unit_code}</code></td>
                        <td>{unit.unit_name}</td>
                        <td>{unit.semester ?? '-'}</td>
                        <td>{unit.year_level ?? '-'}</td>
                        <td>
                          <span className={`${styles.badge} ${styles[badgeClassForCategory(unit.category)]}`}>
                            {categoryLabel(unit.category)}
                          </span>
                        </td>
                        <td>{unit.prerequisite ? <code className={styles.code}>{unit.prerequisite}</code> : '-'}</td>
                        <td>{unit.offered_in ?? '-'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} className={styles.emptyCell}>No units were extracted from this planner.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Import History */}
          {history.length > 0 && (
            <>
              <div className={styles.sectionTitle}>Import History</div>
              <div className={styles.card}>
                <div className={styles.historyList}>
                  {history.map((item) => (
                    <div key={item.id} className={styles.historyRow}>
                      <div className={styles.historyHeader}>
                        <div className={styles.historyMain}>
                          <span className={styles.historyName}>{item.name}</span>
                          <span className={styles.historyDetail}>{item.detail}</span>
                        </div>
                        <span className={`${styles.badge} ${styles[item.cls]}`}>{item.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
