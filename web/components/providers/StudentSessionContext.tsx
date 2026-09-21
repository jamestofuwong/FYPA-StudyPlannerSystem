'use client';

import {
  createContext, useContext, useEffect, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from 'react';
import type { ScrapedStudent } from '../../../core/shared/types/student';
import type {
  CustomSemesterBucket,
  SchedulableUnit,
} from '../../../core/services/scheduling/customPlannerScheduler';

type LoadedStudent = { student: ScrapedStudent; studentId: string };
type DataSource = 'scrape' | 'import_xlsx' | 'import_manual' | 'import_paste';
type CustomPlanStart = { year: number; semester: 1 | 2 };

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
  injectedMinors: Set<string>;
  setInjectedMinors: Dispatch<SetStateAction<Set<string>>>;
  /** Offering and requisite data for every unit the plan could contain. */
  planUnits: SchedulableUnit[];
  setPlanUnits: Dispatch<SetStateAction<SchedulableUnit[]>>;
  /** From the planner's intake month, so the page never re-derives that rule. */
  planIntakeSemester: 1 | 2;
  setPlanIntakeSemester: Dispatch<SetStateAction<1 | 2>>;
  /** The scheduler's own output, kept so edits can be reset. */
  generatedSemesters: CustomSemesterBucket[];
  setGeneratedSemesters: Dispatch<SetStateAction<CustomSemesterBucket[]>>;
  isPlanEdited: boolean;
  setIsPlanEdited: Dispatch<SetStateAction<boolean>>;
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
  const [injectedMinors, setInjectedMinors] = useState<Set<string>>(new Set());
  const [planUnits, setPlanUnits] = useState<SchedulableUnit[]>([]);
  const [planIntakeSemester, setPlanIntakeSemester] = useState<1 | 2>(1);
  const [generatedSemesters, setGeneratedSemesters] = useState<CustomSemesterBucket[]>([]);
  const [isPlanEdited, setIsPlanEdited] = useState(false);

  // Switching planner discards the custom plan built for the previous one. This runs
  // here rather than in a page so that revisiting a page does not clear the plan.
  useEffect(() => {
    const planner = selectedPlannerIdx === -1 ? manualPlanner : dashboardData?.planners?.[selectedPlannerIdx];
    if (!planner?.units) return;
    setCustomPlan(null);
    setCustomPlanStart(null);
    setRetakeUnitCodes(new Set());
    setInjectedMinors(new Set());
    setPlanUnits([]);
    setPlanIntakeSemester(1);
    setGeneratedSemesters([]);
    setIsPlanEdited(false);
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
        injectedMinors, setInjectedMinors,
        planUnits, setPlanUnits,
        planIntakeSemester, setPlanIntakeSemester,
        generatedSemesters, setGeneratedSemesters,
        isPlanEdited, setIsPlanEdited,
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