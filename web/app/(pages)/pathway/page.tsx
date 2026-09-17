'use client';

import { useState } from 'react';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { useStudentSession } from '../../../components/providers/StudentSessionContext';
import { Badge, InlineCode } from '../../../components/common/Primitives';
import MinorProgressCard, { getMinorProgress } from '../../../components/common/MinorProgressCard';
import {
  getCompletedUnitCodes,
  normaliseUnitCode,
  resolveUnitStates,
} from '../../../../core/shared/constants/grades';

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className={styles.panel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, opacity: 0.25 }}>🧭</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{message}</div>
      </div>
    </div>
  );
}

export default function PathwayPage() {
  const { showToast } = useToast();
  const {
    scrapedStudent,
    studentLoaded,
    dashboardData,
    selectedPlannerIdx,
    manualPlanner,
    customPlan, setCustomPlan,
    setCustomPlanStart,
    retakeUnitCodes, setRetakeUnitCodes,
    injectedMinors, setInjectedMinors,
  } = useStudentSession();
  const [customPlanLoading, setCustomPlanLoading] = useState(false);

  const generateCustomPlan = async (overrideInjections?: Set<string>) => {
    const effectiveInjections = overrideInjections ?? injectedMinors;
    const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!activePlanner || !dashboardData) return;

    const courseList: any[] = scrapedStudent?.student?.courseList ?? [];
    const mpuCourseList: any[] = dashboardData.mpuCourseList ?? [];

    const allTranscriptRows = [...courseList, ...mpuCourseList];

    // Only exclude passed and in-progress units. Future pre-enrollments go back
    // into the pool so the scheduler can repack them as the single source of
    // truth, and so do failed units (N / SN) so they get rescheduled as retakes.
    const completedForScheduler = getCompletedUnitCodes(allTranscriptRows);

    // Units the student attempted and failed, so the pathway can mark them as retakes.
    const transcriptStates = resolveUnitStates(allTranscriptRows);
    const retakeCodes = new Set(
      [...transcriptStates].filter(([, state]) => state === 'must_retake').map(([code]) => code)
    );

    const plannerUnits: any[] = activePlanner.units ?? [];

    // Anchor start semester on Current units only.
    // Using max(Complete ∪ Current) would jump past Year 3 Sem 2 if the
    // student completed any out-of-sequence unit that the planner places there.
    const currentOnlyCodes = new Set(
      courseList
        .filter((u: any) => u.status === 'Current')
        .map((u: any) => u.courseId?.trim().toUpperCase())
        .filter(Boolean)
    );

    const activeTermUnits = plannerUnits.filter(
      (u: any) => u.unit && currentOnlyCodes.has(u.unit.unit_code?.trim().toUpperCase())
    );

    let startYear = 1;
    let startSemester: 1 | 2 = 1;

    if (activeTermUnits.length > 0) {
      // Start immediately after the semester the student is currently enrolled in
      const maxYear = Math.max(...activeTermUnits.map((u: any) => u.year_level));
      const maxSemInYear = Math.max(
        ...activeTermUnits.filter((u: any) => u.year_level === maxYear).map((u: any) => u.semester)
      );
      if (maxSemInYear === 1) {
        startYear = maxYear;
        startSemester = 2;
      } else {
        startYear = maxYear + 1;
        startSemester = 1;
      }
    } else {
      // No Current units, so fall back to the semester after the last passed unit.
      // Passed only: a failed unit must not push the start semester forward.
      const courseListStates = resolveUnitStates(courseList);
      const completeCodes = new Set(
        [...courseListStates].filter(([, state]) => state === 'passed').map(([code]) => code)
      );
      const completedPlannerUnits = plannerUnits.filter(
        (u: any) => u.unit && completeCodes.has(u.unit.unit_code?.trim().toUpperCase())
      );
      if (completedPlannerUnits.length > 0) {
        const maxYear = Math.max(...completedPlannerUnits.map((u: any) => u.year_level));
        const maxSemInYear = Math.max(
          ...completedPlannerUnits.filter((u: any) => u.year_level === maxYear).map((u: any) => u.semester)
        );
        startYear = maxSemInYear === 1 ? maxYear : maxYear + 1;
        startSemester = maxSemInYear === 1 ? 2 : 1;
      } else {
        // Student has no history at all, so start from the planner's first slot
        const allYearSems = [...new Set(plannerUnits.map((u: any) => `${u.year_level}-${u.semester}`))].sort();
        if (allYearSems.length > 0) {
          const [y, s] = (allYearSems[0] as string).split('-');
          startYear = parseInt(y);
          startSemester = parseInt(s) as 1 | 2;
        }
      }
    }

    setCustomPlanLoading(true);
    try {
      const res = await fetch('/api/custom-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerId: activePlanner.id,
          completedUnitCodes: completedForScheduler,
          startYear,
          startSemester,
          injectedMinorIds: [...effectiveInjections],
        }),
      });
      if (!res.ok) { showToast('Failed to generate custom pathway.', 'error'); return; }
      const data = await res.json();
      if (data.success) {
        setCustomPlan(data.data);
        setCustomPlanStart({ year: startYear, semester: startSemester });
        setRetakeUnitCodes(retakeCodes);
      } else {
        showToast('Failed to generate custom pathway.', 'error');
      }
    } catch {
      showToast('Failed to generate custom pathway.', 'error');
    } finally {
      setCustomPlanLoading(false);
    }
  };

  const toggleMinorInjection = (minorId: string) => {
    const next = new Set(injectedMinors);
    if (next.has(minorId)) next.delete(minorId); else next.add(minorId);
    setInjectedMinors(next);
    // If a plan is already showing, regenerate immediately with the new set
    if (customPlan) generateCustomPlan(next);
  };

  const selectedPlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];

  if (!studentLoaded || !dashboardData || !selectedPlanner) {
    return (
      <EmptyState
        title="No student loaded"
        message="Search for a student on the Major Detection page first."
      />
    );
  }

  // Major Detection shows only the course list for an MPU enrollment, with no pathway.
  if ((scrapedStudent?.student?.selectedEnrollment ?? '').includes('Mata Pelajaran Umum')) {
    return (
      <EmptyState
        title="No pathway for an MPU enrollment"
        message="Search the student's main enrollment on the Major Detection page."
      />
    );
  }

  return (
    <div className={styles.panel}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{scrapedStudent?.studentId}</span>
        {' · '}
        {selectedPlanner.major?.name ?? selectedPlanner.course?.name ?? 'Selected planner'}
        . Change the student or planner on the Major Detection page.
      </div>

      {/* Minors & Specializations */}
      {(() => {
        const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
        const minors: any[] = activePlanner?.minors ?? [];
        if (minors.length === 0) return null;

        const doneCodes = new Set(
          getCompletedUnitCodes(
            [...(scrapedStudent?.student?.courseList ?? []), ...(dashboardData?.mpuCourseList ?? [])]
          )
        );

        // How many free elective slots the student still needs to fill
        const remainingElectiveSlots = (activePlanner?.units ?? []).filter(
          (u: any) => u.category === 'elective' &&
            (u.unit === null || !doneCodes.has(u.unit?.unit_code?.toUpperCase()))
        ).length;

        return (
          <div>
            <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Minors & Specializations</div>
            {minors.map((minor: any) => {
              const { missing } = getMinorProgress(minor, doneCodes);
              const isInjected = injectedMinors.has(minor.id);
              const wouldExceedCredits = missing > 0 && remainingElectiveSlots === 0;

              return (
                <div
                  key={minor.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    paddingLeft: 8,
                    borderLeft: `2px solid ${isInjected ? 'rgba(197,134,192,0.6)' : 'transparent'}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <MinorProgressCard minor={minor} doneCodes={doneCodes} />
                    {(isInjected || wouldExceedCredits) && (
                      <div style={{ marginTop: -4, marginBottom: 10 }}>
                        {isInjected && (
                          <div style={{ fontSize: 10, color: 'var(--accent-purple)', marginTop: 6 }}>
                            {missing} missing unit{missing !== 1 ? 's' : ''} will be injected into the custom pathway.
                          </div>
                        )}
                        {wouldExceedCredits && (
                          <div style={{ fontSize: 10, color: 'var(--accent-orange)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>⚠</span>
                            <span>
                              {isInjected
                                ? 'No free elective slots remain — these units will exceed standard degree credits (extra units added to pathway).'
                                : 'Note: No free elective slots remain. Including this minor will exceed standard degree credits.'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {missing > 0 && (
                    <button
                      className={isInjected ? styles.btnDanger : styles.btnSecondary}
                      style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 12 }}
                      onClick={() => toggleMinorInjection(minor.id)}
                      disabled={customPlanLoading}
                    >
                      {isInjected ? '✕ Remove from Plan' : '+ Include in Custom Plan'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Custom Study Pathway */}
      {(() => {
        const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
        if (!activePlanner) return null;

        const allTranscriptUnits = [
          ...(scrapedStudent?.student?.courseList ?? []),
          ...(dashboardData?.mpuCourseList ?? []),
        ];

        const transcriptStates = resolveUnitStates(allTranscriptUnits);
        const completeCodes = new Set(
          [...transcriptStates].filter(([, state]) => state === 'passed').map(([code]) => code)
        );
        const currentCodes = new Set(
          [...transcriptStates].filter(([, state]) => state === 'in_progress').map(([code]) => code)
        );
        // Units that are neither complete nor actively enrolled = truly unplanned
        const takenCodes = new Set([...completeCodes, ...currentCodes]);

        const isReqUnit = (u: any) =>
          u.unit !== null &&
          (u.category === 'core' || u.category === 'major_core' || u.category === 'prescribed_elective');

        const unplannedUnits = (activePlanner?.units ?? []).filter(
          (u: any) => isReqUnit(u) && !takenCodes.has(u.unit.unit_code?.toUpperCase())
        );
        const inProgressUnits = (activePlanner?.units ?? []).filter(
          (u: any) => isReqUnit(u) && currentCodes.has(u.unit.unit_code?.toUpperCase())
        );

        // Minor units the student has opted-in to but hasn't taken yet
        const injectedMinorMissingCount = (activePlanner?.minors ?? [])
          .filter((m: any) => injectedMinors.has(m.id))
          .reduce((sum: number, m: any) => {
            const missingFromMinor = m.units.filter(
              (mu: any) => !takenCodes.has(mu.unit?.unit_code?.trim().toUpperCase())
            ).length;
            return sum + missingFromMinor;
          }, 0);

        const totalUnplanned = unplannedUnits.length + injectedMinorMissingCount;
        if (totalUnplanned === 0) return null;

        return (
          <div>
            <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Extended Study Plan</div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(244,135,113,0.35)', borderRadius: 4, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-orange)' }}>{totalUnplanned}</span> unplanned unit{totalUnplanned !== 1 ? 's' : ''}
                {inProgressUnits.length > 0 && (
                  <span style={{ color: 'var(--accent-green)' }}> · {inProgressUnits.length} in progress this semester</span>
                )}.{' '}
                Generate a custom pathway to complete this degree.
              </div>
              <button
                className={styles.btnPrimary}
                style={{ fontSize: 12 }}
                onClick={() => generateCustomPlan()}
                disabled={customPlanLoading}
              >
                {customPlanLoading
                  ? 'Generating…'
                  : customPlan
                  ? 'Regenerate Pathway'
                  : 'Generate Custom Pathway'}
              </button>
            </div>

            {customPlan && (
              <div>
                {customPlan.semesters.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>
                    No semesters could be generated — all remaining units may have unresolvable prerequisite or offering conflicts.
                  </div>
                ) : (
                  customPlan.semesters.map((sem: any) => (
                    <div
                      key={`cp-${sem.year}-${sem.semester}`}
                      style={{ marginBottom: 8, border: '1px solid rgba(244,135,113,0.3)', borderRadius: 4, overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(244,135,113,0.06)' }}>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>
                          YEAR {sem.year} · SEM {sem.semester}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                          {sem.units.length} unit{sem.units.length !== 1 ? 's' : ''} · Custom
                        </span>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                          <colgroup>
                            <col style={{ width: 110 }} />
                            <col style={{ width: 'auto' }} />
                            <col style={{ width: 200 }} />
                          </colgroup>
                          <thead>
                            <tr><th>Unit Code</th><th>Unit Name</th><th>Type</th></tr>
                          </thead>
                          <tbody>
                            {sem.units.map((u: any) => (
                              <tr key={u.code}>
                                <td>
                                  <InlineCode red={u.category === 'core' || u.category === 'major_core'}>
                                    {u.code}
                                  </InlineCode>
                                </td>
                                <td>
                                  {u.name}
                                  {retakeUnitCodes.has(normaliseUnitCode(u.code)) && (
                                    <span
                                      title="Previously attempted and failed — this is a repeat attempt."
                                      style={{
                                        marginLeft: 6,
                                        fontSize: 9,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--accent-orange)',
                                        letterSpacing: '0.05em',
                                      }}
                                    >
                                      RETAKE
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <Badge
                                    label={u.category === 'minor' ? 'minor elective' : u.category.replace(/_/g, ' ')}
                                    cls={
                                      u.category === 'core' ? 'badgeRed' :
                                      u.category === 'major_core' ? 'badgeOrange' :
                                      u.category === 'mpu' ? 'badgeBlue' :
                                      u.category === 'minor' ? 'badgeYellow' :
                                      'badgePurple'
                                    }
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}

                {customPlan.unschedulableUnits.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--accent-orange)', padding: '8px 2px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span>⚠</span>
                    <span>
                      {customPlan.unschedulableUnits.length} unit{customPlan.unschedulableUnits.length !== 1 ? 's' : ''} could
                      not be automatically scheduled due to prerequisite or semester-offering conflicts:{' '}
                      {customPlan.unschedulableUnits.map((u: any) => u.code).join(', ')}.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
