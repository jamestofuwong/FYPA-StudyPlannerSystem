export type UnitCategory =
  | 'core'
  | 'major_core'
  | 'prescribed_elective'
  | 'elective'
  | 'wil'
  | 'mpu'

export interface Unit {
  id: string
  code: string
  name: string
  category: UnitCategory
  creditPoints: number
  yearLevel: number
  semester: number
  isElectiveSlot: boolean
  prerequisites?: string[]
  availability?: string[]
}

export interface SemesterBlock {
  year: number
  semester: number
  label: string
  units: Unit[]
}

export interface UnitListing {
  code: string
  name: string
  creditPoints: number
  prerequisites?: string[]
  corequisites?: string[]
  antirequisites?: string[]
  availability?: string[]
}

export interface AssessmentItem {
  title: string
  type: string
  weight: number
  ulos: number[]
}

export interface UnitDetail extends UnitListing {
  overview: string
  learningOutcomes: string[]
  content: string[]
  assessment: AssessmentItem[]
}

export interface PlannerSummary {
  id: string
  courseName: string
  majorName: string | null
  intakeYear: number
  intakeMonth: number | null
  intakeLabel: string
  courseType: string
  durationSemesters: number
  totalUnits: number
}

export interface PlannerDetail extends PlannerSummary {
  semesters: SemesterBlock[]
  requirements: {
    core: { count: number | null }
    major: { count: number | null }
    elective: { count: number | null }
    wil: { count: number | null }
  }
  electivePool: Unit[]
}
