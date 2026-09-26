'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { useToast } from '../../../components/providers/ToastProvider';
import { useStudentSession } from '../../../components/providers/StudentSessionContext';
import { panelToPath } from '../../../lib/navigation';
import { Badge, InlineCode } from '../../../components/common/Primitives';
import MinorProgressCard, { getMinorProgress } from '../../../components/common/MinorProgressCard';
import {
  getCompletedUnitCodes,
  getConcededPassUnitCodes,
  normaliseUnitCode,
  resolveUnitStates,
} from '../../../../core/shared/constants/grades';
import {
  calendarTermFor,
  normalLoadFor,
  normaliseCode,
  DEFAULT_SCHEDULER_CONFIG,
  type CustomSemesterBucket,
  type PlanWarning,
  type SchedulableUnit,
} from '../../../../core/services/scheduling/customPlannerScheduler';
import { carryForwardWarnings, validatePlan } from '../../../../core/shared/scheduling/planValidator';
import type { CatalogueUnit } from '../../api/custom-planner/catalogue/route';
import ElectivePicker, { type PickerSlot, type PickerSource } from './ElectivePicker';
import { monthsOf, offeringHint } from './terms';
import {
  addSemester,
  addUnit,
  moveUnit,
  removeUnit,
  replaceUnit,
} from '../../../../core/shared/scheduling/planEdits';

const CATEGORY_NAMES: Record<string, string> = {
  core: 'Core units',
  major: 'Major core units',
  major_core: 'Major core units',
  elective: 'Electives',
  prescribed_elective: 'Prescribed electives',
  wil: 'Work-Integrated Learning',
  mpu: 'MPU units',
};

function listCodes(codes: string[]): string {
  if (codes.length <= 1) return codes.join('');
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
}

function describeWarning(w: PlanWarning, maxSemesters: number, intakeSemester: 1 | 2): string | null {
  switch (w.kind) {
    case 'requisite_violation': {
      const parts: string[] = [];
      const concededPass = new Set(w.concededPass ?? []);
      const notInPlan = w.missing.filter((c) => !concededPass.has(c));
      if (notInPlan.length > 0) {
        parts.push(`needs ${listCodes(notInPlan)}, which ${notInPlan.length === 1 ? 'is' : 'are'} not in this plan`);
      }
      if (concededPass.size > 0) {
        parts.push(`needs ${listCodes([...concededPass])}, but a Conceded Pass cannot satisfy a prerequisite`);
      }
      if (w.conflictsWith?.length) {
        parts.push(`cannot be taken with ${listCodes(w.conflictsWith)}, which is already taken`);
      }
      if (w.creditPointsNeeded !== undefined) {
        parts.push(`needs ${w.creditPointsNeeded} credit points, which this plan never reaches`);
      }
      return `${w.unitCode} ${parts.length > 0 ? parts.join('; ') : 'has requisites that cannot be met'}`;
    }
    case 'not_offered': {
      const runsIn = listCodes(w.offeringTerms.map(monthsOf));
      // placedIn means an advisor put it there by hand, so the scheduler's
      // "could not be fitted" wording would be wrong.
      if (w.placedIn) {
        const slotMonths = monthsOf(calendarTermFor(w.placedIn.semester, intakeSemester));
        return `${w.unitCode} only runs in ${runsIn}, but Y${w.placedIn.year} S${w.placedIn.semester} is a ${slotMonths} term for this student`;
      }
      const noSuchTerm = w.offeringTerms.length === 1
        ? `no ${runsIn} term was available`
        : 'none of those terms was available';
      return `${w.unitCode} only runs in ${runsIn}, and ${noSuchTerm} within the plan`;
    }
    case 'short_term_only':
      return `${w.unitCode} is only offered in summer/winter, which this plan does not schedule`;
    case 'budget_exhausted':
      return `${w.unitCodes.length} unit${w.unitCodes.length !== 1 ? 's' : ''} could not be placed within ${maxSemesters} semesters: ${w.unitCodes.join(', ')}`;
    case 'no_offering_data':
      return `${w.unitCode} has no offering data, so its placement is unverified`;
    case 'duplicate_placement':
      return `${w.unitCode} appears in ${w.positions.length} semesters: ${w.positions.map((p) => `Y${p.year} S${p.semester}`).join(', ')}`;
    case 'compulsory_missing':
      return `${listCodes(w.unitCodes)} ${w.unitCodes.length === 1 ? 'is' : 'are'} required to graduate but ${w.unitCodes.length === 1 ? 'is' : 'are'} not in this plan`;
    case 'requirement_shortfall':
      return `${CATEGORY_NAMES[w.category] ?? w.category} total ${w.have} credit points, but ${w.need} are required to graduate`;
    case 'requirement_excess':
      return `${CATEGORY_NAMES[w.category] ?? w.category} total ${w.have} credit points, ${w.have - w.need} more than the ${w.need} required`;
    default:
      // over_capacity is shown on the semester it concerns
      return null;
  }
}

function warningUnitCode(w: PlanWarning): string | null {
  return 'unitCode' in w ? w.unitCode : null;
}

function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.panel}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, opacity: 0.25 }}>🧭</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{message}</div>
        {actionLabel && onAction && (
          <button
            type="button"
            className={styles.btnPrimary}
            style={{ marginTop: 16 }}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// Helper to calculate the student's remaining MPU units
function getRemainingMpuUnits(activePlanner: any, dashboardData: any, takenCodes: Set<string>) {
  // 1. Get the MPU units specifically required by the selected degree planner
  const plannerMpuUnits = (activePlanner?.units ?? [])
    .filter((tu: any) => tu.category === 'mpu' && tu.unit)
    .map((tu: any) => ({
      code: tu.unit.unit_code?.trim().toUpperCase(),
      name: tu.unit.unit_name,
    }));

  // If the planner defines specific MPU units, use those exact ones!
  let mpuList = plannerMpuUnits;

  // Fallback only if the planner didn't list any MPU units
  if (mpuList.length === 0) {
    mpuList = (dashboardData?.mpuCourseList ?? [])
      .filter((u: any) => u.courseId)
      .map((u: any) => ({
        code: u.courseId.trim().toUpperCase(),
        name: u.courseTitle || 'MPU Unit',
      }));
  }

  // De-duplicate by code
  const mpuMap = new Map<string, string>();
  mpuList.forEach((u: any) => {
    if (u.code && !mpuMap.has(u.code)) {
      mpuMap.set(u.code, u.name);
    }
  });

  // Return only untaken MPU units
  return Array.from(mpuMap.entries())
    .filter(([code]) => !takenCodes.has(code))
    .map(([code, name]) => ({ code, name }));
}


export default function PathwayPage() {
  const { showToast } = useToast();
  const router = useRouter();
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
    planUnits, setPlanUnits,
    planIntakeSemester, setPlanIntakeSemester,
    planCompletedUnits, setPlanCompletedUnits,
    planExtraUnits, setPlanExtraUnits,
    planElectiveCandidates, setPlanElectiveCandidates,
    planRequirements, setPlanRequirements,
    generatedSemesters, setGeneratedSemesters,
    isPlanEdited, setIsPlanEdited,
    availableDoubleMajors, setAvailableDoubleMajors,
    selectedDoubleMajorId, setSelectedDoubleMajorId,
    availableMinors, setAvailableMinors,
    breakMilestones, setBreakMilestones,
    customWilSlot, setCustomWilSlot,
  } = useStudentSession();
  const [customPlanLoading, setCustomPlanLoading] = useState(false);
  const [unitToRemove, setUnitToRemove] = useState<{ code: string; name: string; category: string } | null>(null);

  // Catalogue state. The units are fetched the first time a picker is opened,
  // not with the plan, which is already a large response.
  const [catalogue, setCatalogue] = useState<CatalogueUnit[]>([]);
  const [cataloguePrefixes, setCataloguePrefixes] = useState<string[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  // Where the open picker will put the unit chosen in it. A replace names the row
  // being swapped; an add is filling a gap and lets the advisor pick the semester.
  const [picker, setPicker] = useState<
    | { mode: 'replace'; oldCode: string; year: number; semester: 1 | 2 }
    | { mode: 'add' }
    | null
  >(null);
  const [pickerSlotKey, setPickerSlotKey] = useState('');

  /** Regenerating throws away hand edits, so make the advisor say so first. */
  const confirmDiscardEdits = () =>
    !isPlanEdited || window.confirm('This will replace your edits with a newly generated plan.');

  const applyEdit = (next: CustomSemesterBucket[]) => {
    setCustomPlan({ ...customPlan, semesters: next });
    setIsPlanEdited(true);
  };

  // Fetched the first time any picker opens, not with the plan, which is
  // already a large response.
  const loadCatalogue = async () => {
    if (catalogueLoaded || catalogueLoading) return;

    const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    setCatalogueLoading(true);
    try {
      const params = new URLSearchParams();
      if (activePlanner?.id) params.set('plannerId', String(activePlanner.id));
      const completed: string[] = dashboardData?.completedCodes ?? [];
      if (completed.length > 0) params.set('completed', completed.join(','));

      const res = await fetch(`/api/custom-planner/catalogue?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to load the catalogue');
      setCatalogue(data.units ?? []);
      setCataloguePrefixes(data.prefixes ?? []);
      setCatalogueLoaded(true);
    } catch {
      showToast('Could not load the unit catalogue.', 'error');
    } finally {
      setCatalogueLoading(false);
    }
  };

  const openPicker = (target: NonNullable<typeof picker>) => {
    setPicker(target);
    void loadCatalogue();
  };

  const resetToGenerated = () => {
    setCustomPlan({ ...customPlan, semesters: generatedSemesters });
    setIsPlanEdited(false);
  };

  const generateCustomPlan = async (
    overrideInjections?: Set<string>,
    overrideDoubleMajorId?: string | null
  ) => {
    const effectiveInjections = overrideInjections ?? injectedMinors;
    const effectiveDoubleMajorId =
      overrideDoubleMajorId !== undefined ? overrideDoubleMajorId : selectedDoubleMajorId;
    const activePlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!activePlanner || !dashboardData) return;

    const courseList: any[] = scrapedStudent?.student?.courseList ?? [];
    const mpuCourseList: any[] = dashboardData.mpuCourseList ?? [];

    const allTranscriptRows = [...courseList, ...mpuCourseList];

    // Only exclude passed and in-progress units. Future pre-enrollments go back
    // into the pool so the scheduler can repack them as the single source of
    // truth, and so do failed units (N / SN) so they get rescheduled as retakes.
    const rawCompletedCodes = getCompletedUnitCodes(allTranscriptRows);
    const concededPassCodes = getConcededPassUnitCodes(allTranscriptRows);
    const passedSet = new Set(rawCompletedCodes);

    // Identify all remaining units the student has NOT passed yet
    const unpassedPlannerUnits = (activePlanner?.units ?? []).filter(
      (tu: any) => tu.unit && !passedSet.has(tu.unit.unit_code?.trim().toUpperCase())
    );

    // Collect all unit codes that act as prerequisites for those remaining units
    const activePrereqCodes = new Set<string>();
    for (const tu of unpassedPlannerUnits) {
      for (const group of tu.unit.requisite_groups ?? []) {
        for (const cond of group.conditions ?? []) {
          if (cond.type === 'unit' && cond.unit?.unit_code) {
            const reqType = cond.requisite_type ?? 'prerequisite';
            if (reqType === 'prerequisite' || reqType === 'corequisite') {
              activePrereqCodes.add(cond.unit.unit_code.trim().toUpperCase());
            }
          }
        }
      }
    }

    // A Conceded Pass only needs to be retaken if it is an active prerequisite
    const blockingConcededPasses = new Set(
      concededPassCodes.filter((cpCode) => activePrereqCodes.has(normaliseCode(cpCode)))
    );

    // Completed for scheduler: Keep non-blocking CP as completed; only retake blocking CP
    const completedForScheduler = rawCompletedCodes.filter(
      (code) => !blockingConcededPasses.has(normaliseCode(code))
    );

    const transcriptStates = resolveUnitStates(allTranscriptRows);
    const retakeCodes = new Set([
      ...[...transcriptStates].filter(([, state]) => state === 'must_retake').map(([code]) => code),
      ...blockingConcededPasses,
    ]);

    const effectiveConcededPasses = concededPassCodes.filter(
      (code) => !blockingConcededPasses.has(normaliseCode(code))
    );

    setCustomPlanLoading(true);
    try {
      const res = await fetch('/api/custom-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerId: activePlanner.id,
          completedUnitCodes: completedForScheduler,
          concededPassUnitCodes: effectiveConcededPasses,
          courseList: scrapedStudent?.student?.courseList ?? [],
          injectedMinorIds: [...effectiveInjections],
          selectedDoubleMajorId: effectiveDoubleMajorId,
        }),
      });

      if (!res.ok) { showToast('Failed to generate custom pathway.', 'error'); return; }
      const data = await res.json();
      if (data.success) {
        setCustomPlan(data.data);
        setBreakMilestones(data.breakMilestones ?? []);
        setCustomWilSlot(null);
        setCustomPlanStart({ year: data.startYear, semester: data.startSemester });
        setRetakeUnitCodes(retakeCodes);
        setPlanUnits(data.units ?? []);
        setPlanIntakeSemester(data.intakeSemester === 2 ? 2 : 1);
        setPlanCompletedUnits(data.completedUnits ?? []);
        setPlanElectiveCandidates(data.electiveCandidates ?? []);
        setPlanRequirements(data.requirements ?? []);
        setGeneratedSemesters(data.data.semesters);
        setAvailableDoubleMajors(data.availableDoubleMajors ?? []);
        setAvailableMinors(data.availableMinors ?? []);
        setIsPlanEdited(false);
      } else {
        showToast('Failed to generate custom pathway.', 'error');
      }
    } catch {
      showToast('Failed to generate custom pathway.', 'error');
    } finally {
      setCustomPlanLoading(false);
    }
  };

  const toggleDoubleMajor = (plannerId: string) => {
    if (customPlan && !confirmDiscardEdits()) return;
    const next = selectedDoubleMajorId === plannerId ? null : plannerId;
    setSelectedDoubleMajorId(next);
    generateCustomPlan(injectedMinors, next);
  };

  const toggleMinorInjection = (minorId: string) => {
    if (customPlan && !confirmDiscardEdits()) return;
    const next = new Set(injectedMinors);
    if (next.has(minorId)) next.delete(minorId);
    else next.add(minorId);
    setInjectedMinors(next);
    generateCustomPlan(next, selectedDoubleMajorId);
  };

  const selectedPlanner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];

  if (!studentLoaded || !dashboardData || !selectedPlanner) {
    return (
      <EmptyState
        title="No student loaded"
        message="Search for a student on the Major Detection page first."
        actionLabel="Go to Major Detection"
        onAction={() => router.push(panelToPath('dashboard'))}
      />
    );
  }

  // Major Detection shows only the course list for an MPU enrollment, with no pathway.
  if ((scrapedStudent?.student?.selectedEnrollment ?? '').includes('Mata Pelajaran Umum')) {
    return (
      <EmptyState
        title="No pathway for an MPU enrollment"
        message="Search the student's main enrollment on the Major Detection page."
        actionLabel="Go to Major Detection"
        onAction={() => router.push(panelToPath('dashboard'))}
      />
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.planActions} style={{ marginTop: 0 }}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => router.push(panelToPath('dashboard'))}
        >
          ← Back to Major Detection
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{scrapedStudent?.studentId}</span>
        {' · '}
        {selectedPlanner.major?.name ?? selectedPlanner.course?.name ?? 'Selected planner'}
        . Change the student or planner on the Major Detection page.
      </div>

      {/* Double Major Opportunities */}
      {(availableDoubleMajors.length > 0 || selectedDoubleMajorId !== null) && (
        <div className={styles.pathwaySection}>
          <div className={styles.sectionTitle}>Double Major Opportunities</div>
          <div className={styles.doubleMajorGrid}>
            {availableDoubleMajors.map((dm) => {
              const isSelected = selectedDoubleMajorId === dm.plannerId;

              return (
                <div
                  key={dm.plannerId}
                  className={`${styles.doubleMajorCard} ${isSelected ? styles.doubleMajorCardActive : ''}`}
                >
                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardTitle}>{dm.majorName}</span>
                      <Badge label="Double Major" cls="badgeYellow" />
                    </div>

                    <div className={styles.cardSubtitle}>
                      Requires <span className={styles.highlightCount}>{dm.neededCount}</span> unit{dm.neededCount !== 1 ? 's' : ''} to complete this major:
                    </div>

                    <div className={styles.chipList}>
                      {dm.units.map((u: any) => (
                        <span
                          key={u.code}
                          className={`${styles.unitChip}`}
                          title={u.name}
                        >
                          {u.code} · {u.name}
                        </span>
                      ))}
                    </div>

                    {isSelected && (
                      <div className={styles.injectedNotice}>
                        ✓ {dm.neededCount} core unit{dm.neededCount !== 1 ? 's' : ''} swapped into custom pathway elective slots.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`${isSelected ? styles.btnDanger : styles.btnSecondary} ${styles.cardActionBtn}`}
                    onClick={() => toggleDoubleMajor(dm.plannerId)}
                    disabled={customPlanLoading || (!isSelected && !dm.canFitInRemainingBudget)}
                    title={
                      !isSelected && !dm.canFitInRemainingBudget
                        ? `Not enough elective slots (needs ${dm.netNewUnitsNeeded ?? dm.neededCount}, only ${dm.remainingElectiveBudget ?? 0} available)`
                        : undefined
                    }
                  >
                    {isSelected
                      ? '✕ Remove from Plan'
                      : !dm.canFitInRemainingBudget
                      ? `Not enough slots (${dm.remainingElectiveBudget ?? 0} left)`
                      : '+ Include in Custom Plan'}
                  </button>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Minors & Specializations */}
      {(availableMinors.length > 0 || injectedMinors.size > 0) && (
        <div className={styles.pathwaySection}>
          <div className={styles.sectionTitle}>Minors & Specializations</div>
          <div className={styles.doubleMajorGrid}>
            {availableMinors.map((minor) => {
              const isInjected = injectedMinors.has(minor.minorId);

              return (
                <div
                  key={minor.minorId}
                  className={`${styles.doubleMajorCard} ${isInjected ? styles.doubleMajorCardActive : ''}`}
                >
                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardTitle}>{minor.minorName}</span>
                      <Badge label="Minor" cls="badgeYellow" />
                    </div>

                    <div className={styles.cardSubtitle}>
                      Requires <span className={styles.highlightCount}>{minor.neededCount}</span> unit{minor.neededCount !== 1 ? 's' : ''} to complete this specialization:
                    </div>

                    <div className={styles.chipList}>
                      {minor.units.map((u: any) => (
                        <span
                          key={u.code}
                          className={styles.unitChip}
                          title={u.name}
                        >
                          {u.code} · {u.name}
                        </span>
                      ))}
                    </div>

                    {isInjected && (
                      <div className={styles.injectedNotice}>
                        ✓ {minor.neededCount} unit{minor.neededCount !== 1 ? 's' : ''} will be injected into the custom pathway.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={`${isInjected ? styles.btnDanger : styles.btnSecondary} ${styles.cardActionBtn}`}
                    onClick={() => toggleMinorInjection(minor.minorId)}
                    disabled={customPlanLoading || (!isInjected && !minor.canFitInRemainingBudget)}
                    title={
                      !isInjected && !minor.canFitInRemainingBudget
                        ? `Not enough elective slots (needs ${minor.netNewUnitsNeeded ?? minor.neededCount}, only ${minor.remainingElectiveBudget ?? 0} available)`
                        : undefined
                    }
                  >
                    {isInjected
                      ? '✕ Remove from Plan'
                      : !minor.canFitInRemainingBudget
                      ? `Not enough slots (${minor.remainingElectiveBudget ?? 0} left)`
                      : '+ Include in Custom Plan'}
                  </button>

                </div>
              );
            })}
          </div>
        </div>
      )}

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
          u.category !== 'mpu' &&
          (u.category === 'core' || u.category === 'major_core' || u.category === 'prescribed_elective' || u.category === 'elective');

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
            <div className={styles.sectionTitle} style={{ marginTop: 20 }}>
              Extended Study Plan
              {isPlanEdited && <span className={styles.editedTag}>edited</span>}
            </div>

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
                onClick={() => {
                  if (confirmDiscardEdits()) {
                    // Reset all active selections when regenerating the baseline pathway
                    setSelectedDoubleMajorId(null);
                    setInjectedMinors(new Set());
                    generateCustomPlan(new Set(), null);
                  }
                }}
                disabled={customPlanLoading}
              >
                {customPlanLoading
                  ? 'Generating…'
                  : customPlan
                  ? 'Regenerate Pathway'
                  : 'Generate Custom Pathway'}
              </button>
            </div>

            {customPlan && (() => {
              const semesters: CustomSemesterBucket[] = customPlan.semesters ?? [];
              // Completed units are in here too, so the requirement totals can
              // credit what the student has already passed. Catalogue units are
              // on no planner, so without them validatePlan would report every
              // one as no_offering_data and never check its requisites. The planner's
              // elective list is here for the same reason, and goes first so an entry
              // the plan already holds for a unit is never overridden by its copy.
              const unitData = new Map(
                [...planElectiveCandidates, ...planUnits, ...planCompletedUnits, ...planExtraUnits].map((u) => [normaliseCode(u.code), u])
              );
              const placedCodes = new Set(
                semesters.flatMap((s) => s.units.map((u) => normaliseCode(u.code)))
              );
              const unplacedUnits = planUnits.filter(
                (u) => u.category !== 'mpu' && !placedCodes.has(normaliseCode(u.code))
              );

              // Exclude units placed in the custom plan from completed history to avoid double-counting retakes
              const validatedCompletedCodes = (dashboardData?.completedCodes ?? []).filter(
                (code: string) => !placedCodes.has(normaliseCode(code))
              );

              const validatedConcededPassCodes = getConcededPassUnitCodes(allTranscriptUnits).filter(
                (code: string) => !placedCodes.has(normaliseCode(code))
              );

              const validation = validatePlan({
                semesters,
                completedUnitCodes: validatedCompletedCodes,
                concededPassUnitCodes: validatedConcededPassCodes,
                intakeSemester: planIntakeSemester,

                // Every prescribed elective is treated as compulsory. A Swinburne
                // planner stars the compulsory ones ("* Compulsory Pre-scribed
                // Elective"), but the seed records no star, and a unit that is a
                // prescribed elective on one planner is major core on another. So
                // this errs towards warning: if one is really optional the advisor
                // sees a false "required to graduate", which is visible and easy to
                // dismiss, where the other way round a student silently skips a
                // compulsory unit. Revisit if the client says only starred ones are.
                requiredUnits: planUnits.filter(
                  (u) =>
                    u.category === 'core' ||
                    u.category === 'major_core' ||
                    u.category === 'prescribed_elective'
                ),
                unitData,
                requirements: planRequirements,
              });

              // A freshly generated plan already carries the scheduler's own
              // warnings. Once edited, the arrangement is the advisor's, so it
              // has to be re-checked.
              const warnings: PlanWarning[] = isPlanEdited
                ? [
                    ...validation,
                    // The generator's findings about units it never placed stay
                    // true until the advisor places them
                    ...carryForwardWarnings(customPlan.warnings ?? [], semesters),
                  ]
                : [
                    ...(customPlan.warnings ?? []),
                    // The scheduler places what it is given and never counts the
                    // total, so a plan short of a category's credit points comes
                    // out clean. That shortfall is worth saying before any edit.
                    ...validation.filter(
                      (w) => w.kind === 'requirement_shortfall' || w.kind === 'requirement_excess',
                    ),
                  ];

              const overCapacity = new Map<string, Extract<PlanWarning, { kind: 'over_capacity' }>>();
              const byUnit = new Map<string, string[]>();
              const messages: string[] = [];
              // Messages that get a Choose elective button: an elective shortfall has no
              // row left to swap, so this is where an advisor fills the gap.
              const chooseElectiveMessages = new Set<string>();
              for (const w of warnings) {
                // Identify which unit this warning is about (if any)
                const unitCode = warningUnitCode(w);
                const targetCode = unitCode ? normaliseCode(unitCode) : null;
                const targetUnit = targetCode ? unitData.get(targetCode) : null;

                // Suppress all warnings for MPU units
                if (
                  (targetUnit && targetUnit.category === 'mpu') ||
                  (targetCode && targetCode.startsWith('MPU')) ||
                  ('category' in w && (w as any).category === 'mpu') ||
                  ('unitCodes' in w && (w as any).unitCodes?.every((c: string) => c.startsWith('MPU')))
                ) {
                  continue; // Skip this warning completely
                }

                if (w.kind === 'short_term_only') {
                  continue;
                }

                // Normal warning handling continues below...
                const message = describeWarning(w, DEFAULT_SCHEDULER_CONFIG.maxSemesters, planIntakeSemester);
                if (message && w.kind === 'requirement_shortfall' && w.category === 'elective') {
                  chooseElectiveMessages.add(message);
                }
                if (w.kind === 'over_capacity') {
                  overCapacity.set(`${w.year}-${w.semester}`, w);
                  continue;
                }
                // A warning about a unit that is not in the plan has no row to
                // sit on, so it belongs in the list below instead of vanishing
                const code = unitCode && placedCodes.has(normaliseCode(unitCode)) ? unitCode : null;
                if (code && message) {
                  const key = normaliseCode(code);
                  byUnit.set(key, [...(byUnit.get(key) ?? []), message]);
                } else if (message) {
                  messages.push(message);
                }
              }

              const addUnitToSemester = (code: string, bucket: CustomSemesterBucket) => {
                const unit = planUnits.find((u) => normaliseCode(u.code) === normaliseCode(code));
                if (unit) applyEdit(addUnit(semesters, unit, bucket.year, bucket.semester));
              };

              const completedKeys = new Set(
                (dashboardData?.completedCodes ?? []).map((code: string) => normaliseCode(code))
              );
              const isMpuCode = (code: string) => normaliseCode(code).startsWith('MPU');
              const poolCategory = new Map(planUnits.map((u) => [normaliseCode(u.code), u.category]));
              const candidateKeys = new Set(planElectiveCandidates.map((u) => normaliseCode(u.code)));

              // Section one is the planner's own elective list. A prescribed elective
              // or a double major unit that the plan already names has its own place,
              // and choosing it here would quietly change its category.
              const pickerPlannerUnits = planElectiveCandidates.filter((u) => {
                const key = normaliseCode(u.code);
                const named = poolCategory.get(key);
                return (
                  !placedCodes.has(key) &&
                  !completedKeys.has(key) &&
                  !isMpuCode(u.code) &&
                  (named === undefined || named === 'elective')
                );
              });

              // Section two is everything else. The route drops what the planner
              // template names, but the pool also holds recommended electives and
              // injected minor units, which the "+ Add unit" dropdown already
              // offers, so the pool is filtered here too. Units in section one
              // stay out, so no unit is offered twice.
              const pickerCatalogueUnits = catalogue.filter((u) => {
                const key = normaliseCode(u.code);
                return (
                  !placedCodes.has(key) &&
                  !poolCategory.has(key) &&
                  !candidateKeys.has(key) &&
                  !completedKeys.has(key) &&
                  !isMpuCode(u.code)
                );
              });

              // Semesters as the plan shows them, for the picker that lets the
              // advisor choose one. The default is the earliest with room under
              // the normal load, else the last, where the over-capacity note will say so.
              const normalLoad = normalLoadFor(DEFAULT_SCHEDULER_CONFIG);
              const shownSemesters = semesters.filter(
                (sem) => sem.units.some((u) => u.category !== 'mpu') || isPlanEdited
              );
              const pickerSlots: PickerSlot[] = shownSemesters.map((sem) => {
                const term = calendarTermFor(sem.semester, planIntakeSemester);
                return {
                  key: `${sem.year}-${sem.semester}`,
                  label: `Y${sem.year} S${sem.semester} · ${monthsOf(term)}`,
                  term,
                };
              });
              const roomy = shownSemesters.find(
                (sem) => sem.units.filter((u) => u.category !== 'mpu').length < normalLoad
              ) ?? shownSemesters[shownSemesters.length - 1];
              const defaultSlotKey = roomy ? `${roomy.year}-${roomy.semester}` : '';
              const activeSlotKey = pickerSlots.some((slot) => slot.key === pickerSlotKey)
                ? pickerSlotKey
                : defaultSlotKey;
              const activeSlot = pickerSlots.find((slot) => slot.key === activeSlotKey);

              const chooseElective = (
                unit: SchedulableUnit,
                source: PickerSource,
                year: number,
                semester: 1 | 2
              ) => {
                if (!picker) return;
                // The advisor's own choice, so never a recommendation. Only a unit
                // from outside the planner is tagged as such.
                const chosen = {
                  ...unit,
                  category: 'elective',
                  recommended: false,
                  outsidePlanner: source === 'catalogue',
                };
                if (source === 'catalogue') {
                  // Kept in the session as well as the plan, so validatePlan can
                  // still read its offerings and requisites after the edit.
                  setPlanExtraUnits((current) =>
                    current.some((u) => normaliseCode(u.code) === normaliseCode(unit.code))
                      ? current
                      : [...current, chosen]
                  );
                }
                applyEdit(
                  picker.mode === 'replace'
                    ? replaceUnit(semesters, picker.oldCode, chosen, { year, semester })
                    : addUnit(semesters, chosen, year, semester)
                );
                setPicker(null);
              };

              const moveUnitToSlot = (code: string, slot: string) => {
                const [year, semester] = slot.split('-').map(Number);
                applyEdit(moveUnit(semesters, code, year, semester as 1 | 2));
              };

              return (
              <div>
                {semesters.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 0' }}>
                    No semesters could be generated. The reasons are listed below.
                  </div>
                ) : (
                  semesters
                  .filter((sem) => sem.units.some((u) => u.category !== 'mpu') || isPlanEdited)
                  .map((sem) => {
                    const slotKey = `${sem.year}-${sem.semester}`;
                    const capacity = overCapacity.get(slotKey);
                    const calendarTerm = calendarTermFor(sem.semester, planIntakeSemester);
                    const primaryMilestone = breakMilestones[0];
                    const activeWilSlot = customWilSlot ?? primaryMilestone?.insertBeforeSlotKey;
                    const isWilSlot = primaryMilestone && activeWilSlot === slotKey;

                    // Derive dynamic title based on the active position
                    const currentBreakOption = primaryMilestone?.availableBreakSlots?.find((b: any) => b.slotKey === slotKey);
                    const dynamicBreakTitle = currentBreakOption
                      ? currentBreakOption.termType === 'summer'
                        ? `YEAR ${currentBreakOption.year} · SUMMER BREAK (Dec – Feb)`
                        : `YEAR ${currentBreakOption.year} · WINTER BREAK (June – July)`
                      : primaryMilestone?.breakTermName;

                    return (
                    <div key={`sem-wrap-${slotKey}`}>
                      {/* Chronological Break Milestone Strip for WIL with Move Dropdown */}
                      {isWilSlot && (
                        <div className={styles.breakMilestoneStrip}>
                          <div className={styles.breakMilestoneHeader}>
                            <span className={styles.breakMilestoneTitle}>
                              {currentBreakOption?.termType === 'winter'} {dynamicBreakTitle} · Intensive Break Period
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Advisor dropdown to switch break term location */}
                              {primaryMilestone.availableBreakSlots?.length > 1 && (
                                <select
                                  className={styles.breakMoveSelect}
                                  value={activeWilSlot}
                                  onChange={(e) => setCustomWilSlot(e.target.value)}
                                  title="Change which break period to take this placement"
                                >
                                  {primaryMilestone.availableBreakSlots.map((opt: any) => (
                                    <option key={opt.slotKey} value={opt.slotKey}>
                                      Move to: {opt.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <Badge label="Summer / Winter" cls="badgePurple" />
                            </div>
                          </div>
                          <div className={styles.breakMilestoneBody}>
                            <InlineCode>{primaryMilestone.unitCode}</InlineCode>
                            <span className={styles.breakMilestoneName}>{primaryMilestone.unitName}</span>
                            <span className={styles.breakMilestoneTag}>
                              {primaryMilestone.unitCode?.toUpperCase().includes('OPTIONAL') ? (
                                `${primaryMilestone.creditPoints ?? 25} CP · REPLACES 2 ELECTIVES`
                              ) : primaryMilestone.creditPoints === 0 ? (
                                '0 CP · COMPULSORY ACCREDITATION HURDLE'
                              ) : (
                                `${primaryMilestone.creditPoints ?? 25} CP · COMPULSORY WIL`
                              )}
                            </span>

                          </div>
                        </div>
                      )}

                    <div
                      key={`cp-${sem.year}-${sem.semester}`}
                      style={{ marginBottom: 8, border: '1px solid rgba(244,135,113,0.3)', borderRadius: 4, overflow: 'hidden' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(244,135,113,0.06)' }}>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>
                          YEAR {sem.year} · SEM {sem.semester} · {monthsOf(calendarTerm)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                          {sem.units.filter((u) => u.category !== 'mpu').length} units · Custom
                        </span>
                        {capacity && (
                          <span
                            className={styles.capacityTag}
                            title={`${capacity.count} standard units, above the normal load of ${capacity.limit}`}
                          >
                            ⚠ {capacity.count} units, over the normal load of {capacity.limit}
                          </span>
                        )}
                        <select
                          className={styles.addUnitSelect}
                          style={capacity ? undefined : { marginLeft: 'auto' }}
                          value=""
                          disabled={unplacedUnits.length === 0}
                          onChange={(e) => { addUnitToSemester(e.target.value, sem); e.currentTarget.value = ''; }}
                          title={unplacedUnits.length === 0 ? 'Every remaining unit is already placed' : 'Add a unit to this semester'}
                        >
                          <option value="">+ Add unit</option>
                          {unplacedUnits.map((u) => {
                            const hint = offeringHint(u, calendarTerm);
                            return (
                              <option key={u.code} value={u.code}>
                                {u.code} · {u.name}{hint ? ` · ${hint}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {picker?.mode === 'replace' && picker.year === sem.year && picker.semester === sem.semester && (
                        <ElectivePicker
                          title={picker.oldCode === 'ELECTIVE' ? 'Choose an elective' : `Swap ${picker.oldCode}`}
                          plannerUnits={pickerPlannerUnits}
                          catalogueUnits={pickerCatalogueUnits}
                          prefixes={cataloguePrefixes}
                          loading={catalogueLoading}
                          term={calendarTerm}
                          onChoose={(unit, source) => chooseElective(unit, source, sem.year, sem.semester)}
                          onClose={() => setPicker(null)}
                        />
                      )}
                      <div style={{ overflowX: 'auto' }}>
                        <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                          <colgroup>
                            <col style={{ width: 110 }} />
                            <col style={{ width: 'auto' }} />
                            <col style={{ width: 185 }} />
                            <col style={{ width: 150 }} />
                          </colgroup>
                          <thead>
                            <tr><th>Unit Code</th><th>Unit Name</th><th>Type</th><th>Edit</th></tr>
                          </thead>
                          <tbody>
                            {sem.units
                            .filter((u) => u.category !== 'mpu')
                            .map((u) => {
                              const unitMessages = byUnit.get(normaliseCode(u.code)) ?? [];
                              return (
                              <tr key={u.code} className={unitMessages.length > 0 ? styles.rowFlagged : undefined}>
                                <td>
                                  <InlineCode red={u.category === 'core' || u.category === 'major_core'}>
                                    {u.code}
                                  </InlineCode>
                                </td>
                                <td style={{ whiteSpace: 'normal' }}>
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
                                  {u.recommended && u.code !== 'ELECTIVE' && (
                                    <span
                                      title="Not named by the planner — chosen from its elective groups to fill an empty elective slot."
                                      style={{
                                        marginLeft: 6,
                                        fontSize: 9,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--accent-purple)',
                                        letterSpacing: '0.05em',
                                      }}
                                    >
                                      RECOMMENDED
                                    </span>
                                  )}
                                  {u.outsidePlanner && (
                                    <span
                                      title="Added from the catalogue, not on this planner. Counted as an elective."
                                      style={{
                                        marginLeft: 6,
                                        fontSize: 9,
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--accent-blue)',
                                        letterSpacing: '0.05em',
                                      }}
                                    >
                                      OUTSIDE PLANNER
                                    </span>
                                  )}
                                  {unitMessages.map((message) => (
                                    <div key={message} className={styles.rowWarning} title={message}>
                                      <span aria-hidden="true">⚠</span> {message}.
                                    </div>
                                  ))}
                                </td>
                                <td>
                                  <Badge
                                    label={
                                      u.code === 'ELECTIVE' ? 'Elective Slot' :
                                      u.category === 'double_major' ? 'Double Major' :
                                      u.category === 'prescribed_elective' ? 'Prescribed Elec' :
                                      u.category === 'minor' ? 'minor elective' :
                                      u.category.replace(/_/g, ' ')
                                    }
                                    cls={
                                      u.code === 'ELECTIVE' ? 'badgePurple' :
                                      u.category === 'core' ? 'badgeRed' :
                                      u.category === 'major_core' ? 'badgeOrange' :
                                      u.category === 'double_major' ? 'badgeYellow' :
                                      u.category === 'mpu' ? 'badgeBlue' :
                                      u.category === 'minor' ? 'badgeYellow' :
                                      'badgePurple'
                                    }
                                  />
                                </td>
                                <td>
                                  <div className={styles.rowActions}>
                                    {u.code === 'ELECTIVE' ? (
                                          <button
                                            type="button"
                                            className={styles.btnSecondary}
                                            style={{ fontSize: 11, padding: '3px 8px', borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }}
                                            onClick={() => {
                                              openPicker({ mode: 'replace', oldCode: u.code, year: sem.year, semester: sem.semester });
                                            }}
                                            title="Click to select an elective from the catalogue"
                                          >
                                            + Select Unit
                                          </button>
                                    ) : (
                                    <select
                                      className={styles.moveSelect}
                                      value={`${sem.year}-${sem.semester}`}
                                      onChange={(e) => moveUnitToSlot(u.code, e.target.value)}
                                      title="Move to another semester"
                                    >
                                      {semesters.map((target) => {
                                        const targetCalTerm = calendarTermFor(target.semester, planIntakeSemester);
                                        const targetUnitMeta = unitData.get(normaliseCode(u.code));
                                        const offeringTerms = targetUnitMeta?.offeringSemesters ?? (u as any).offeringSemesters ?? [];
                                        
                                        // Empty means unrestricted (available in both semesters)
                                        const isOffered = offeringTerms.length === 0 || offeringTerms.includes(targetCalTerm);
                                        const isCurrent = target.year === sem.year && target.semester === sem.semester;

                                        return (
                                          <option
                                            key={`${target.year}-${target.semester}`}
                                            value={`${target.year}-${target.semester}`}
                                            disabled={!isOffered && !isCurrent}
                                            title={!isOffered ? `Not offered in ${monthsOf(targetCalTerm)}` : `Move to Y${target.year} S${target.semester}`}
                                          >
                                            {isOffered || isCurrent
                                              ? `Y${target.year} S${target.semester}`
                                              : `⚠ Y${target.year} S${target.semester}`}
                                          </option>
                                        );
                                      })}
                                    </select>

                                    )}
                                    {u.category === 'elective' && u.code !== 'ELECTIVE' && (
                                      <button
                                        type="button"
                                        className={styles.swapBtn}
                                        onClick={() => openPicker({ mode: 'replace', oldCode: u.code, year: sem.year, semester: sem.semester })}
                                        title={`Swap ${u.code} for another elective`}
                                        aria-label={`Swap ${u.code}`}
                                      >
                                        Swap
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className={styles.removeBtn}
                                      onClick={() => setUnitToRemove({ code: u.code, name: u.name, category: u.category })}
                                      title={`Remove ${u.code} from this plan`}
                                      aria-label={`Remove ${u.code}`}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                            {sem.units.filter((u) => u.category !== 'mpu').length === 0 && (
                              <tr>
                                <td colSpan={4} style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                  No units in this semester yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      </div>
                    </div>
                    );
                  })
                )}

                <div className={styles.planActions}>
                  <button
                    className={styles.btnSecondary}
                    style={{ fontSize: 11 }}
                    onClick={() => applyEdit(addSemester(semesters))}
                  >
                    + Add semester
                  </button>
                  {isPlanEdited && (
                    <button
                      className={styles.btnSecondary}
                      style={{ fontSize: 11 }}
                      onClick={resetToGenerated}
                      title="Discard edits and show the scheduler's plan again"
                    >
                      ↺ Reset to generated plan
                    </button>
                  )}
                </div>

                {messages.length > 0 && (
                  <ul className={styles.warningList}>
                    {messages.map((message) => (
                      <li key={message} className={styles.warningItem}>
                        <span aria-hidden="true">⚠</span>
                        <span>{message}.</span>
                        {chooseElectiveMessages.has(message) && (
                          <button
                            type="button"
                            className={styles.swapBtn}
                            onClick={() => {
                              setPickerSlotKey('');
                              if (picker?.mode === 'add') setPicker(null);
                              else openPicker({ mode: 'add' });
                            }}
                          >
                            Choose elective
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {picker?.mode === 'add' && activeSlot && (
                  <ElectivePicker
                    title="Choose an elective"
                    plannerUnits={pickerPlannerUnits}
                    catalogueUnits={pickerCatalogueUnits}
                    prefixes={cataloguePrefixes}
                    loading={catalogueLoading}
                    term={activeSlot.term}
                    slots={pickerSlots}
                    slotKey={activeSlotKey}
                    onSlotChange={setPickerSlotKey}
                    onChoose={(unit, source) => {
                      const [year, semester] = activeSlotKey.split('-').map(Number);
                      chooseElective(unit, source, year, semester as 1 | 2);
                    }}
                    onClose={() => setPicker(null)}
                  />
                )}

                {(() => {
                  // Collect codes for optional break units (summer/winter only)
                  const breakTermCodes = new Set(
                    (customPlan.warnings ?? [])
                      .filter((w: any) => w.kind === 'short_term_only')
                      .map((w: any) => normaliseCode(w.unitCode))
                  );

                  // Filter out MPU units and optional break units (which are displayed in their own table below)
                  const nonMpuUnschedulable = (customPlan.unschedulableUnits ?? []).filter(
                    (u: any) =>
                      u.category !== 'mpu' &&
                      !u.code?.toUpperCase().startsWith('MPU') &&
                      !breakTermCodes.has(normaliseCode(u.code))
                  );

                  if (!isPlanEdited && messages.length === 0 && nonMpuUnschedulable.length > 0) {
                    return (
                      <div className={styles.warningItem}>
                        <span aria-hidden="true">⚠</span>
                        <span>
                          {nonMpuUnschedulable.length} unit{nonMpuUnschedulable.length !== 1 ? 's' : ''} could
                          not be scheduled: {nonMpuUnschedulable.map((u: any) => u.code).join(', ')}.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Remaining MPU units */}
                {(() => {
                  const remainingMpus = getRemainingMpuUnits(activePlanner, dashboardData, takenCodes);

                  return (
                    <div className={styles.mpuSection}>
                      <div className={styles.mpuHeader}>
                        <div className={styles.sectionTitle} style={{ margin: 0, fontSize: 13 }}>
                          Remaining MPU Units ({remainingMpus.length})
                        </div>
                        <span className={styles.mpuSubtitle}>
                          -
                        </span>
                      </div>

                      {remainingMpus.length === 0 ? (
                        <div className={styles.mpuEmptyAlert}>
                          ✓ All required MPU units have been completed or are currently in progress!
                        </div>
                      ) : (
                        <div className={styles.mpuTableWrap}>
                          <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                            <colgroup>
                              <col style={{ width: 120 }} />
                              <col style={{ width: 'auto' }} />
                              <col style={{ width: 140 }} />
                              <col style={{ width: 140 }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>Unit Code</th>
                                <th>Unit Title</th>
                                <th>Type</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {remainingMpus.map((mpu) => {
                                const isCurrent = currentCodes.has(mpu.code);
                                return (
                                  <tr key={mpu.code}>
                                    <td>
                                      <InlineCode>{mpu.code}</InlineCode>
                                    </td>
                                    <td style={{ whiteSpace: 'normal' }}>{mpu.name}</td>
                                    <td>
                                      <Badge label="MPU" cls="badgeBlue" />
                                    </td>
                                    <td>
                                      {isCurrent ? (
                                        <span className={styles.statusInProgress}>● In Progress</span>
                                      ) : (
                                        <span className={styles.statusPending}>Pending</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              );
            })()}
          </div>
        );
      })()}
      {/* Unit Removal Confirmation Modal */}
      {unitToRemove && (() => {
        const isCore = unitToRemove.category === 'core' || unitToRemove.category === 'major_core';
        const isElective = unitToRemove.category === 'elective' || unitToRemove.category === 'prescribed_elective';
        
        // Check if any other planned unit depends on this one as a prerequisite
        const allPlannedUnits = (customPlan?.semesters ?? []).flatMap((s: any) => s.units);
        const dependentUnits = allPlannedUnits.filter((other: any) => {
          if (other.code === unitToRemove.code) return false;
          const meta = planUnits.find((pu: any) => normaliseCode(pu.code) === normaliseCode(other.code));
          return meta?.requisiteGroups?.some((g: any) =>
            g.some((c: any) => c.unitCode && normaliseCode(c.unitCode) === normaliseCode(unitToRemove.code))
          );
        });

        return (
          <div className={styles.modalOverlay} onClick={() => setUnitToRemove(null)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <span className={styles.modalTitle}>
                  <span aria-hidden="true">⚠</span> Remove Unit from Pathway?
                </span>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => setUnitToRemove(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: 13 }}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div>
                  Are you sure you want to remove <InlineCode>{unitToRemove.code}</InlineCode> (<strong>{unitToRemove.name}</strong>) from this study plan?
                </div>

                <div className={styles.modalWarningBox}>
                  <strong>Consequences of Removal:</strong>
                  <ul>
                    {isCore && (
                      <li>
                        <strong>Compulsory Core Unit:</strong> Required to satisfy degree requirements. Removing it will block graduation until completed.
                      </li>
                    )}
                    {isElective && (
                      <li>
                        <strong>Credit Shortfall:</strong> Removing this elective reduces total earned credits and may leave the plan short of the graduation requirement.
                      </li>
                    )}
                    {dependentUnits.length > 0 && (
                      <li>
                        <strong>Broken Prerequisite Chain:</strong> {dependentUnits.length} other planned unit{dependentUnits.length !== 1 ? 's' : ''} ({dependentUnits.map((d: any) => d.code).join(', ')}) depend on this unit!
                      </li>
                    )}
                    <li>
                      The unit will be returned to the unplaced pool and can be re-added later.
                    </li>
                  </ul>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setUnitToRemove(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => {
                    const code = unitToRemove.code;
                    applyEdit(removeUnit(customPlan.semesters, code));
                    setUnitToRemove(null);
                    showToast(`Removed ${code} from study pathway.`, 'info');
                  }}
                >
                  Remove Unit
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
