'use client';

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import type {
  PlannerImportPlanner,
  PlannerImportReport,
  PlannerImportUnit,
} from '../../../../core/services/plannerImport/types';

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

  return [
    ...planner.categories.core_units,
    ...planner.categories.major_units,
    ...planner.categories.mpu_group,
    ...planner.categories.elective_groups.prescribed_elective,
    ...planner.categories.elective_groups.elective,
    ...planner.categories.wil_group,
  ];
}

export default function ImportPage() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [useLlm, setUseLlm] = useState(true);
  const [planner, setPlanner] = useState<PlannerImportPlanner | null>(null);
  const [report, setReport] = useState<PlannerImportReport | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);

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
    setSelectedFile(file);
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

  const handleParse = async () => {
    if (!selectedFile) {
      showToast('Choose a PDF before parsing.', 'error');
      return;
    }

    setIsParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('useLlm', String(useLlm));

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
          detail: `${payload.report.unit_counts.core_units ?? 0} core units | ${payload.report.unit_counts.major_units ?? 0} major units | ${payload.report.outcome.confidence} confidence`,
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
    setSelectedFile(null);
    setPlanner(null);
    setReport(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('Import session cleared.', 'info');
  };

  return (
    <div className={styles.panel}>
      <div className={styles.sectionTitle}>PDF Planner Import &amp; OCR</div>

      <div className={styles.splitLayout}>
        <div className={styles.splitMain}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className={styles.hiddenInput}
            onChange={handleInputChange}
          />

          <div
            role="button"
            tabIndex={0}
            className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className={styles.dropIcon}>PDF</div>
            <div className={styles.dropTitle}>Drag and drop a study planner PDF here</div>
            <div className={styles.dropSubtitle}>or click to browse files. Parsed data stays inside the app flow.</div>
            <div className={styles.dropMeta}>
              {selectedFile ? `Selected: ${selectedFile.name}` : 'No file selected'}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Import Configuration</div>
            <div className={styles.formGrid2}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Selected PDF</label>
                <input
                  className={`${styles.formInput} ${styles.formInputMono}`}
                  value={selectedFile?.name ?? 'Awaiting file selection'}
                  readOnly
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>AI Review</label>
                <select
                  className={styles.formSelect}
                  value={useLlm ? 'enabled' : 'disabled'}
                  onChange={(event) => setUseLlm(event.target.value === 'enabled')}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>

            <div className={styles.btnGroup}>
              <button className={styles.btnPrimary} onClick={handleParse} disabled={isParsing || !selectedFile}>
                {isParsing ? 'Parsing...' : 'Parse PDF'}
              </button>
              <button
                className={styles.btnSuccess}
                onClick={() => showToast('Planner update wiring can be added next.', 'info')}
                disabled={!planner}
              >
                Update Planner
              </button>
              <button className={styles.btnSecondary} onClick={handleClear} disabled={isParsing}>
                Clear
              </button>
            </div>
          </div>

          {summary ? (
            <div className={styles.card}>
              <div className={styles.cardTitle}>Extracted Planner Summary</div>
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
                    <span className={`${styles.badge} ${styles.signalBadge} ${styles[summary.confidenceTone]}`}>{summary.confidence}</span>
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

              {summary.reason ? (
                <div className={styles.reasonBox}>{summary.reason}</div>
              ) : null}

              {summary.validationIssues.length > 0 ? (
                <div className={styles.validationBox}>
                  {summary.validationIssues.map((issue) => (
                    <div key={issue} className={styles.validationIssue}>
                      {issue}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={styles.sectionTitle}>OCR Preview - Parsed Units</div>
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
                {units.length > 0 ? (
                  units.map((unit, index) => (
                    <tr key={`${unit.unit_code}-${unit.unit_name}-${index}`}>
                      <td>{index + 1}</td>
                      <td>
                        <code className={styles.code}>{unit.unit_code}</code>
                      </td>
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className={styles.emptyCell}>
                      Parse a planner PDF to preview extracted units here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.splitSide}>
          <div className={styles.sectionTitle}>Import History</div>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Recent Imports</div>
            <div className={styles.historyList}>
              {history.length > 0 ? (
                history.map((item) => (
                  <div key={item.id} className={styles.historyRow}>
                    <div className={styles.historyHeader}>
                      <div className={styles.historyMain}>
                        <span className={styles.historyName}>{item.name}</span>
                        <span className={styles.historyDetail}>{item.detail}</span>
                      </div>
                      <span className={`${styles.badge} ${styles[item.cls]}`}>{item.status}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyStateSub}>No planner imports in this session yet.</div>
              )}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Parser Status</div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Selected File</span>
              <span className={styles.statusValue}>{selectedFile?.name ?? 'None'}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Units Parsed</span>
              <span className={styles.statusValue}>{units.length}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Validation Issues</span>
              <span className={styles.statusValue}>{report?.validation_issues.length ?? 0}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>AI Review</span>
              <span className={styles.statusValue}>{useLlm ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Backend Model</span>
              <span className={styles.statusValue}>{report?.model ?? 'deepseek-r1:1.5b'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
