'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import styles from './page.module.css';

function AuditContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const autoprint = searchParams.get('autoprint') === '1';
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) { setError('No session ID provided'); return; }
    fetch(`/api/graduation-audit/session?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setSession(data);
      })
      .catch((e: Error) => setError(e.message));
  }, [sessionId]);

  useEffect(() => {
    if (!autoprint || !session) return;
    // Small delay to let the browser finish painting before opening print dialog
    const t = setTimeout(() => {
      window.print();
      window.close();
    }, 500);
    return () => clearTimeout(t);
  }, [autoprint, session]);

  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!session) return <div className={styles.loading}>Loading audit data...</div>;

  const student = session.student;
  const matchData = session.matchResult?.data;
  const graduationCheck = session.matchResult?.graduationCheck;
  const riskReport = matchData?.riskReport;
  const primaryMajor = matchData?.primaryMajor;
  const unmatchedCore: string[] = matchData?.unmatchedCore ?? [];
  const breakdown = primaryMajor?.breakdown ?? {};
  const generatedAt = new Date(session.createdAt);

  function formatDate(d: Date) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function statusCell(matched: number | undefined, required: number | undefined) {
    if (required == null) return '—';
    if (matched == null) return `0/${required}`;
    return matched >= required ? '✓' : `${matched}/${required}`;
  }

  return (
    <div id="audit-root" className={styles.auditPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.university}>SWINBURNE UNIVERSITY OF TECHNOLOGY SARAWAK</div>
        <div className={styles.docTitle}>Student Academic Progression Audit</div>
      </div>

      <div className={styles.metaRow}>
        <span><strong>AUDIT REFERENCE</strong>&nbsp;&nbsp;{session.auditRef}</span>
        <span><strong>DATE GENERATED</strong>&nbsp;&nbsp;{formatDate(generatedAt)}, {generatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <hr className={styles.divider} />

      {/* Student Information */}
      <div className={styles.sectionTitle}>STUDENT INFORMATION</div>
      <table className={styles.infoTable}>
        <tbody>
          <tr><td className={styles.infoLabel}>Student ID</td><td>{student.studentId ?? '—'}</td></tr>
          <tr><td className={styles.infoLabel}>Name</td><td>{student.studentName ?? '—'}</td></tr>
          <tr><td className={styles.infoLabel}>Programme</td><td>{student.course ?? '—'}</td></tr>
          <tr><td className={styles.infoLabel}>Major</td><td>{primaryMajor?.majorName ?? 'Not detected'}</td></tr>
          <tr><td className={styles.infoLabel}>Enrolment Date</td><td>{student.enrollmentDate ?? '—'}</td></tr>
          <tr><td className={styles.infoLabel}>Expected Graduation</td><td>{student.graduationDate ?? '—'}</td></tr>
          <tr><td className={styles.infoLabel}>CGPA</td><td>{student.cgpa != null ? Number(student.cgpa).toFixed(2) : '—'}</td></tr>
          <tr><td className={styles.infoLabel}>Grade Level</td><td>{student.gradeLevel ?? '—'}</td></tr>
        </tbody>
      </table>

      <hr className={styles.divider} />

      {/* Credit Summary */}
      <div className={styles.sectionTitle}>CREDIT SUMMARY</div>
      <table className={styles.creditTable}>
        <thead>
          <tr><th>Category</th><th>Required</th><th>Earned</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr><td>Core Units</td><td>{breakdown?.core?.required ?? '—'}</td><td>{breakdown?.core?.matched ?? '—'}</td><td>{statusCell(breakdown?.core?.matched, breakdown?.core?.required)}</td></tr>
          <tr><td>Major Core Units</td><td>{breakdown?.majorCore?.required ?? '—'}</td><td>{breakdown?.majorCore?.matched ?? '—'}</td><td>{statusCell(breakdown?.majorCore?.matched, breakdown?.majorCore?.required)}</td></tr>
          <tr><td>Prescribed Electives</td><td>{breakdown?.prescribed?.required ?? '—'}</td><td>{breakdown?.prescribed?.matched ?? '—'}</td><td>{statusCell(breakdown?.prescribed?.matched, breakdown?.prescribed?.required)}</td></tr>
          <tr><td>Free Electives</td><td>{breakdown?.freeElective?.required ?? '—'}</td><td>{breakdown?.freeElective?.matched ?? '—'}</td><td>{statusCell(breakdown?.freeElective?.matched, breakdown?.freeElective?.required)}</td></tr>
          <tr><td>WIL</td><td>{breakdown?.wil?.required ?? '—'}</td><td>{breakdown?.wil?.matched ?? '—'}</td><td>{statusCell(breakdown?.wil?.matched, breakdown?.wil?.required)}</td></tr>
          <tr className={styles.totalRow}>
            <td><strong>TOTAL CREDITS</strong></td>
            <td><strong>{student.creditsRequired ?? '—'}</strong></td>
            <td><strong>{student.creditsCompleted ?? '—'}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <div className={styles.metaRow}>
        <span><strong>Overall Match</strong>&nbsp;&nbsp;{primaryMajor?.matchPct != null ? `${Number(primaryMajor.matchPct).toFixed(1)}%` : '—'}</span>
        <span>
          <strong>Graduation Eligibility</strong>&nbsp;&nbsp;
          <span className={graduationCheck?.isEligible ? styles.eligible : styles.notEligible}>
            {graduationCheck?.isEligible ? 'ELIGIBLE' : 'NOT YET ELIGIBLE'}
          </span>
        </span>
      </div>

      <hr className={styles.divider} />

      {/* Detection Result */}
      <div className={styles.sectionTitle}>DETECTION RESULT</div>
      <table className={styles.infoTable}>
        <tbody>
          <tr>
            <td className={styles.infoLabel}>Primary Major</td>
            <td>{primaryMajor?.majorName ?? 'Not detected'}{primaryMajor?.matchPct != null ? ` (${Number(primaryMajor.matchPct).toFixed(1)}%)` : ''}</td>
          </tr>
          <tr><td className={styles.infoLabel}>Second Major</td><td>{matchData?.secondMajor?.majorName ?? '—'}</td></tr>
          <tr><td className={styles.infoLabel}>Detection Status</td><td>{matchData?.status ?? '—'}</td></tr>
        </tbody>
      </table>

      <hr className={styles.divider} />

      {/* Missing Requirements */}
      {unmatchedCore.length > 0 && (
        <>
          <div className={styles.sectionTitle}>MISSING REQUIREMENTS</div>
          <div className={styles.missingSection}>
            <p className={styles.missingLabel}>Core Units ({unmatchedCore.length} missing)</p>
            <ul className={styles.missingList}>
              {unmatchedCore.map((u: string) => <li key={u}>{u}</li>)}
            </ul>
          </div>
          <hr className={styles.divider} />
        </>
      )}

      {/* At-Risk Assessment */}
      {riskReport && (
        <>
          <div className={styles.sectionTitle}>AT-RISK ASSESSMENT</div>
          <p className={styles.riskLevel}>Overall Level: <strong>{riskReport.level?.toUpperCase()}</strong></p>
          {riskReport.factors?.map((f: any) => (
            <div key={f.id} className={styles.riskItem}>
              <strong>{f.title}:</strong> {f.description}
            </div>
          ))}
          <hr className={styles.divider} />
        </>
      )}

      {/* Advisor Notes */}
      <div className={styles.sectionTitle}>ADVISOR NOTES</div>
      <div className={styles.notesArea} />

      <hr className={styles.divider} />

      {/* Sign-off */}
      <div className={styles.sectionTitle}>SIGN-OFF</div>
      <div className={styles.signoffGrid}>
        <div className={styles.signoffBlock}>
          <div className={styles.signoffRole}>Academic Advisor</div>
          <div className={styles.signoffLine}>Name: _______________________________&nbsp;&nbsp; Date: ___________</div>
          <div className={styles.signoffLine}>Signature: ___________________________</div>
        </div>
        <div className={styles.signoffBlock}>
          <div className={styles.signoffRole}>Head of Department <span className={styles.optional}>(if required)</span></div>
          <div className={styles.signoffLine}>Name: _______________________________&nbsp;&nbsp; Date: ___________</div>
          <div className={styles.signoffLine}>Signature: ___________________________</div>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div>This document was generated by the Study Planner System.</div>
        <div>Ref: {session.auditRef} &nbsp;|&nbsp; For internal use only. Contains academic data — handle per university privacy policy.</div>
      </div>
    </div>
  );
}

export default function GraduationAuditPage() {
  return (
    <>
      <style>{`body { margin: 0; background: #f5f5f5; } @media print { body { background: white; } }`}</style>
      <Suspense fallback={<div style={{ padding: '2rem', fontFamily: 'serif' }}>Loading...</div>}>
        <AuditContent />
      </Suspense>
    </>
  );
}
