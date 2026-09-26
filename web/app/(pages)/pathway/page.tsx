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
  normaliseCode,
  DEFAULT_SCHEDULER_CONFIG,
  type CustomSemesterBucket,
  type PlanWarning,
  type SchedulableUnit,
} from '../../../../core/services/scheduling/customPlannerScheduler';
import { carryForwardWarnings, validatePlan } from '../../../../core/shared/scheduling/planValidator';
import type { CatalogueUnit } from '../../api/custom-planner/catalogue/route';
import {
  addSemester,
  addUnit,
  moveUnit,
  removeUnit,
} from '../../../../core/shared/scheduling/planEdits';

/**
 * Calendar terms named by the months they run in.
 *
 * "Semester 2" is ambiguous on this page: the header counts slots from the
 * student's intake, while an offering term is a calendar term, and for a
 * September intake the two are swapped. Months belong to neither counting, so
 * they say the same thing to every reader.
 */
const TERM_MONTHS: Record<number, string> = { 1: 'Feb/Mar', 2: 'Aug/Sep', 3: 'summer', 4: 'winter' };

const monthsOf = (term: number) => TERM_MONTHS[term] ?? `term ${term}`;

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
    planRequirements, setPlanRequirements,
    generatedSemesters, setGeneratedSemesters,
    isPlanEdited, setIsPlanEdited,
    availableDoubleMajors, setAvailableDoubleMajors,
    selectedDoubleMajorId, setSelectedDoubleMajorId,
  } = useStudentSession();
  const [availableMinors, setAvailableMinors] = useState<any[]>([]);
  const [customPlanLoading, setCustomPlanLoading] = useState(false);

  // Catalogue state. The units are fetched the first time a picker is opened,
  // not with the plan, which is already a large response.
  const [catalogue, setCatalogue] = useState<CatalogueUnit[]>([]);
  const [cataloguePrefixes, setCataloguePrefixes] = useState<string[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueLoaded, setCatalogueLoaded] = useState(false);
  const [openCatalogueSlot, setOpenCatalogueSlot] = useState<string | null>(null);
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [cataloguePrefix, setCataloguePrefix] = useState('ALL');

  /** Regenerating throws away hand edits, so make the advisor say so first. */
  const confirmDiscardEdits = () =>
    !isPlanEdited || window.confirm('This will replace your edits with a newly generated plan.');

  const applyEdit = (next: CustomSemesterBucket[]) => {
    setCustomPlan({ ...customPlan, semesters: next });
    setIsPlanEdited(true);
  };

  const openCatalogue = async (slot: string) => {
    if (openCatalogueSlot === slot) {
      setOpenCatalogueSlot(null);
      return;
    }
    setOpenCatalogueSlot(slot);
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
      setOpenCatalogueSlot(null);
    } finally {
      setCatalogueLoading(false);
    }
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
        setCustomPlanStart({ year: data.startYear, semester: data.startSemester });
        setRetakeUnitCodes(retakeCodes);
        setPlanUnits(data.units ?? []);
        setPlanIntakeSemester(data.intakeSemester === 2 ? 2 : 1);
        setPlanCompletedUnits(data.completedUnits ?? []);
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
              // one as no_offering_data and never check its requisites.
              const unitData = new Map(
                [...planUnits, ...planCompletedUnits, ...planExtraUnits].map((u) => [normaliseCode(u.code), u])
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

              const addFromCatalogue = (unit: CatalogueUnit, bucket: CustomSemesterBucket) => {
                // Kept in the session as well as the plan, so validatePlan can
                // still read its offerings and requisites after the edit.
                setPlanExtraUnits((current) =>
                  current.some((u) => normaliseCode(u.code) === normaliseCode(unit.code))
                    ? current
                    : [...current, unit]
                );
                applyEdit(addUnit(semesters, unit, bucket.year, bucket.semester));
                setOpenCatalogueSlot(null);
                setCatalogueSearch('');
              };

              // The route drops units the planner template names, but the pool
              // also holds recommended electives and injected minor units, which
              // the picker beside this one already offers. Filtering on the pool
              // covers all three without the route having to know about them.
              const pooledCodes = new Set(planUnits.map((u) => normaliseCode(u.code)));

              const catalogueMatches = (term: 1 | 2) => {
                const query = catalogueSearch.trim().toLowerCase();
                return catalogue
                  .filter((u) => cataloguePrefix === 'ALL' || u.prefix === cataloguePrefix)
                  .filter((u) => !placedCodes.has(normaliseCode(u.code)))
                  .filter((u) => !pooledCodes.has(normaliseCode(u.code)))
                  .filter(
                    (u) =>
                      query === '' ||
                      u.code.toLowerCase().includes(query) ||
                      u.name.toLowerCase().includes(query)
                  )
                  .map((u) => ({
                    unit: u,
                    offered:
                      u.offeringSemesters.length === 0
                        ? 'offering unknown'
                        : u.offeringSemesters.includes(term)
                          ? ''
                          : 'not offered this term',
                  }));
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
                    return (
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
                            const offered = u.offeringSemesters.length === 0
                              ? ' · offering unknown'
                              : u.offeringSemesters.includes(calendarTerm)
                                ? ''
                                : ' · not offered this term';
                            return (
                              <option key={u.code} value={u.code}>
                                {u.code} · {u.name}{offered}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          className={styles.catalogueBtn}
                          onClick={() => openCatalogue(slotKey)}
                          title="Add a unit that is not on this planner, including units from another course"
                        >
                          + Add from catalogue
                        </button>
                      </div>
                      {openCatalogueSlot === slotKey && (
                        <div className={styles.cataloguePanel}>
                          {catalogueLoading ? (
                            <div className={styles.catalogueEmpty}>Loading units…</div>
                          ) : (
                            <>
                              <div className={styles.catalogueControls}>
                                <input
                                  className={styles.catalogueSearch}
                                  type="search"
                                  value={catalogueSearch}
                                  placeholder="Search by code or name"
                                  aria-label="Search the unit catalogue"
                                  onChange={(e) => setCatalogueSearch(e.target.value)}
                                />
                                <select
                                  className={styles.catalogueFilter}
                                  value={cataloguePrefix}
                                  aria-label="Filter by unit code prefix"
                                  onChange={(e) => setCataloguePrefix(e.target.value)}
                                >
                                  <option value="ALL">All prefixes</option>
                                  {cataloguePrefixes.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </div>
                              <ul className={styles.catalogueList}>
                                {catalogueMatches(calendarTerm).map(({ unit, offered }) => (
                                  <li key={unit.code}>
                                    <button
                                      type="button"
                                      className={styles.catalogueItem}
                                      onClick={() => addFromCatalogue(unit, sem)}
                                    >
                                      <span className={styles.catalogueCode}>{unit.code}</span>
                                      <span className={styles.catalogueName}>{unit.name}</span>
                                      {offered && <span className={styles.catalogueHint}>· {offered}</span>}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                              {catalogueMatches(calendarTerm).length === 0 && (
                                <div className={styles.catalogueEmpty}>No units match that search.</div>
                              )}
                            </>
                          )}
                        </div>
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
                                      <select
                                        className={styles.moveSelect}
                                        value={`${sem.year}-${sem.semester}`}
                                        onChange={(e) => moveUnitToSlot(u.code, e.target.value)}
                                        title="Move to another semester"
                                      >
                                        {semesters.map((target) => (
                                          <option
                                            key={`${target.year}-${target.semester}`}
                                            value={`${target.year}-${target.semester}`}
                                          >
                                            Y{target.year} S{target.semester}
                                          </option>
                                        ))}
                                      </select>
                                    <button
                                      type="button"
                                      className={styles.removeBtn}
                                      onClick={() => applyEdit(removeUnit(semesters, u.code))}
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
                      </li>
                    ))}
                  </ul>
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

                {/* Summer / Winter Term Units (Optional Break Periods) */}
                {(() => {
                  const shortTermWarnings = (customPlan.warnings ?? []).filter(
                    (w: any) => w.kind === 'short_term_only'
                  );
                  const shortTermCodes = new Set(shortTermWarnings.map((w: any) => normaliseCode(w.unitCode)));
                  const shortTermUnits = (customPlan.unschedulableUnits ?? []).filter((u: any) =>
                    shortTermCodes.has(normaliseCode(u.code))
                  );

                  if (shortTermUnits.length === 0) return null;

                  return (
                    <div className={styles.mpuSection} style={{ marginBottom: 16 }}>
                      <div className={styles.mpuHeader}>
                        <div className={styles.sectionTitle} style={{ margin: 0, fontSize: 13 }}>
                          Summer / Winter Term Units ({shortTermUnits.length})
                        </div>
                        <span className={styles.mpuSubtitle}>
                          Offered during semester breaks · Optional acceleration
                        </span>
                      </div>

                      <div className={styles.mpuTableWrap}>
                        <table className={styles.table} style={{ tableLayout: 'fixed', width: '100%' }}>
                          <colgroup>
                            <col style={{ width: 140 }} />
                            <col style={{ width: 'auto' }} />
                            <col style={{ width: 160 }} />
                            <col style={{ width: 140 }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Unit Code</th>
                              <th>Unit Title</th>
                              <th>Offering Term</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shortTermUnits.map((u: any) => {
                              const isOptionalProject = u.code.includes('ICT20016');
                              return (
                                <tr key={u.code}>
                                  <td>
                                    <InlineCode>{u.code}</InlineCode>
                                  </td>
                                  <td style={{ whiteSpace: 'normal' }}>
                                    {u.name}
                                    {isOptionalProject && (
                                      <span
                                        style={{
                                          marginLeft: 6,
                                          fontSize: 9,
                                          fontFamily: 'var(--font-mono)',
                                          color: 'var(--accent-purple)',
                                          letterSpacing: '0.05em',
                                        }}
                                        title="25 Credit Points · Equivalent to 2 elective units"
                                      >
                                        25 CP · REPLACES 2 ELECTIVES
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    <Badge label="Winter Term" cls="badgePurple" />
                                  </td>
                                  <td>
                                    <span className={styles.statusPending}>Optional Break Term</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
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
    </div>
  );
}
