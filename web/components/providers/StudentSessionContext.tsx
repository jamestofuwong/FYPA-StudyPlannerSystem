'use client';

import {
  createContext, useContext, useEffect, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import type { ScrapedStudent } from '../../../core/shared/types/student';
import type {
  CustomSemesterBucket,
  PlanWarning,
  SchedulableUnit,
} from '../../../core/services/scheduling/customPlannerScheduler';
import type { CategoryRequirement } from '../../../core/shared/scheduling/planValidator';

type LoadedStudent = { student: ScrapedStudent; studentId: string };
type DataSource = 'scrape' | 'import_xlsx' | 'import_manual' | 'import_paste';
type CustomPlanStart = { year: number; semester: 1 | 2 };

/**
 * A plan restored from an exported file, with no real student behind it.
 * Kept separate from scrapedStudent/dashboardData/studentLoaded so the
 * dashboard (and every other page) never mistakes it for a real student;
 * only the pathway page's own substitution point reads this.
 */
export type RestoredSession = {
  scrapedStudent: LoadedStudent;
  dashboardData: any;
  /** ISO date the source file was exported on, for the "snapshot" banner. */
  exportDate: string;
  /**
   * The saved plan's start position, same kind as customPlanStart and the
   * /api/custom-planner response's own startYear/startSemester: a slot
   * "year of study" counter (1, 2, 3, ...), not a calendar year, and a slot
   * semester (1 | 2), not a calendar term. Regenerate must send these
   * explicitly for a restored session, since its synthetic transcript has
   * no terms for the server's own resolveNextStudyTerm to derive them from.
   */
  startYear: number;
  startSemester: 1 | 2;
};

export type StudentSessionState = {
  scrapedStudent: LoadedStudent | null;
  setScrapedStudent: Dispatch<SetStateAction<LoadedStudent | null>>;
  studentLoaded: boolean;
  setStudentLoaded: Dispatch<SetStateAction<boolean>>;
  dashboardData: any;
  setDashboardData: Dispatch<SetStateAction<any>>;
  selectedPlannerIdx: number;
  setSelectedPlannerIdx: Dispatch<SetStateAction<number>>;
  manualPlanner: any;
  setManualPlanner: Dispatch<SetStateAction<any>>;
  isImported: boolean;
  setIsImported: Dispatch<SetStateAction<boolean>>;
  dataSource: DataSource;
  setDataSource: Dispatch<SetStateAction<DataSource>>;
  customPlan: any;
  setCustomPlan: Dispatch<SetStateAction<any>>;
  customPlanStart: CustomPlanStart | null;
  setCustomPlanStart: Dispatch<SetStateAction<CustomPlanStart | null>>;
  retakeUnitCodes: Set<string>;
  setRetakeUnitCodes: Dispatch<SetStateAction<Set<string>>>;
  concededPassRetakeWarnings: PlanWarning[];
  setConcededPassRetakeWarnings: Dispatch<SetStateAction<PlanWarning[]>>;
  injectedMinors: Set<string>;
  setInjectedMinors: Dispatch<SetStateAction<Set<string>>>;
  /** Offering and requisite data for every unit the plan could contain. */
  planUnits: SchedulableUnit[];
  setPlanUnits: Dispatch<SetStateAction<SchedulableUnit[]>>;
  /** From the planner's intake month, so the page never re-derives that rule. */
  planIntakeSemester: 1 | 2;
  setPlanIntakeSemester: Dispatch<SetStateAction<1 | 2>>;
  /** Units the student already passed, which still count toward the totals. */
  planCompletedUnits: SchedulableUnit[];
  setPlanCompletedUnits: Dispatch<SetStateAction<SchedulableUnit[]>>;
  /**
   * Units the advisor added from the catalogue, which are on no planner. They
   * belong here so validatePlan can see their offerings and requisites.
   */
  planExtraUnits: SchedulableUnit[];
  setPlanExtraUnits: Dispatch<SetStateAction<SchedulableUnit[]>>;
  /**
   * The planner's elective-group units, offered when an advisor chooses or
   * swaps an elective. They are on the planner but not in the plan pool.
   */
  planElectiveCandidates: SchedulableUnit[];
  setPlanElectiveCandidates: Dispatch<SetStateAction<SchedulableUnit[]>>;
  /** Per-category credit point totals the planner requires. */
  planRequirements: CategoryRequirement[];
  setPlanRequirements: Dispatch<SetStateAction<CategoryRequirement[]>>;
  /** The scheduler's own output, kept so edits can be reset. */
  generatedSemesters: CustomSemesterBucket[];
  setGeneratedSemesters: Dispatch<SetStateAction<CustomSemesterBucket[]>>;
  isPlanEdited: boolean;
  setIsPlanEdited: Dispatch<SetStateAction<boolean>>;

  availableDoubleMajors: any[];
  setAvailableDoubleMajors: React.Dispatch<React.SetStateAction<any[]>>;
  selectedDoubleMajorId: string | null;
  setSelectedDoubleMajorId: React.Dispatch<React.SetStateAction<string | null>>;
  availableMinors: any[];
  setAvailableMinors: (minors: any[]) => void;
  breakMilestones: any[];
  setBreakMilestones: (milestones: any[]) => void;
  customWilSlot: string | null;
  setCustomWilSlot: (slot: string | null) => void;

  removedUnitSlots: Record<string, { year: number; semester: 1 | 2 }>;
  setRemovedUnitSlots: React.Dispatch<React.SetStateAction<Record<string, { year: number; semester: 1 | 2 }>>>;

  customMpuList: { code: string; name: string }[] | null;
  setCustomMpuList: React.Dispatch<React.SetStateAction<{ code: string; name: string }[] | null>>;
  allDatabaseMpus: { code: string; name: string }[];
  setAllDatabaseMpus: React.Dispatch<React.SetStateAction<{ code: string; name: string }[]>>;

  restoredSession: RestoredSession | null;
  setRestoredSession: Dispatch<SetStateAction<RestoredSession | null>>;
};

const StudentSessionContext = createContext<StudentSessionState | null>(null);

// The loaded student, matched planners and custom plan, shared by Major Detection
// and Student Pathway. REQ-SEC-101: React state only, never written to storage.
export function StudentSessionProvider({ children }: { children: ReactNode }) {
  const [scrapedStudent, setScrapedStudent] = useState<LoadedStudent | null>(null);
  const [studentLoaded, setStudentLoaded] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [selectedPlannerIdx, setSelectedPlannerIdx] = useState(0); // -1 = manual planner active
  const [manualPlanner, setManualPlanner] = useState<any>(null);
  const [isImported, setIsImported] = useState(false);
  const [dataSource, setDataSource] = useState<DataSource>('scrape');
  const [customPlan, setCustomPlan] = useState<any>(null);
  const [customPlanStart, setCustomPlanStart] = useState<CustomPlanStart | null>(null);
  // Units in the generated pathway that are repeat attempts after a failed grade
  const [retakeUnitCodes, setRetakeUnitCodes] = useState<Set<string>>(new Set());
  // Why a retake was substituted for a Conceded Pass that blocked a prerequisite,
  // set once at generation time, alongside retakeUnitCodes; see generateCustomPlan.
  const [concededPassRetakeWarnings, setConcededPassRetakeWarnings] = useState<PlanWarning[]>([]);
  const [injectedMinors, setInjectedMinors] = useState<Set<string>>(new Set());
  const [planUnits, setPlanUnits] = useState<SchedulableUnit[]>([]);
  const [planIntakeSemester, setPlanIntakeSemester] = useState<1 | 2>(1);
  const [planCompletedUnits, setPlanCompletedUnits] = useState<SchedulableUnit[]>([]);
  const [planExtraUnits, setPlanExtraUnits] = useState<SchedulableUnit[]>([]);
  const [planElectiveCandidates, setPlanElectiveCandidates] = useState<SchedulableUnit[]>([]);
  const [planRequirements, setPlanRequirements] = useState<CategoryRequirement[]>([]);
  const [generatedSemesters, setGeneratedSemesters] = useState<CustomSemesterBucket[]>([]);
  const [isPlanEdited, setIsPlanEdited] = useState(false);

  const [availableDoubleMajors, setAvailableDoubleMajors] = useState<any[]>([]);
  const [selectedDoubleMajorId, setSelectedDoubleMajorId] = useState<string | null>(null);
  const [availableMinors, setAvailableMinors] = useState<any[]>([]);
  const [breakMilestones, setBreakMilestones] = useState<any[]>([]);
  const [customWilSlot, setCustomWilSlot] = useState<string | null>(null);
  const [removedUnitSlots, setRemovedUnitSlots] = useState<Record<string, { year: number; semester: 1 | 2 }>>({});
  const [customMpuList, setCustomMpuList] = useState<{ code: string; name: string }[] | null>(null);
  const [allDatabaseMpus, setAllDatabaseMpus] = useState<{ code: string; name: string }[]>([]);
  const [restoredSession, setRestoredSession] = useState<RestoredSession | null>(null);


  // Switching planner discards the custom plan built for the previous one. This runs
  // here rather than in a page so that revisiting a page does not clear the plan.
  useEffect(() => {
    const planner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!planner?.units) return;
    setCustomPlan(null);
    setCustomPlanStart(null);
    setRetakeUnitCodes(new Set());
    setConcededPassRetakeWarnings([]);
    setInjectedMinors(new Set());
    setPlanUnits([]);
    setPlanIntakeSemester(1);
    setPlanCompletedUnits([]);
    setPlanExtraUnits([]);
    setPlanElectiveCandidates([]);
    setPlanRequirements([]);
    setGeneratedSemesters([]);
    setIsPlanEdited(false);
    setAvailableDoubleMajors([]);
    setSelectedDoubleMajorId(null);
    setCustomMpuList(null);
    setRestoredSession(null);
  }, [selectedPlannerIdx, dashboardData, manualPlanner]);

  return (
    <StudentSessionContext.Provider
      value={{
        scrapedStudent, setScrapedStudent,
        studentLoaded, setStudentLoaded,
        dashboardData, setDashboardData,
        selectedPlannerIdx, setSelectedPlannerIdx,
        manualPlanner, setManualPlanner,
        isImported, setIsImported,
        dataSource, setDataSource,
        customPlan, setCustomPlan,
        customPlanStart, setCustomPlanStart,
        retakeUnitCodes, setRetakeUnitCodes,
        concededPassRetakeWarnings, setConcededPassRetakeWarnings,
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
        removedUnitSlots, setRemovedUnitSlots,
        customMpuList, setCustomMpuList,
        allDatabaseMpus, setAllDatabaseMpus,
        restoredSession, setRestoredSession,
      }}
    >
      {children}
    </StudentSessionContext.Provider>
  );
}

export function useStudentSession(): StudentSessionState {
  const ctx = useContext(StudentSessionContext);
  if (!ctx) throw new Error('useStudentSession must be used inside StudentSessionProvider');
  return ctx;
}