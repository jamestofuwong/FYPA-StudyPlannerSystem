export type UnitSourceKind =
  | 'official_unit_page'
  | 'sarawak_unit_page'
  | 'mpu_catalogue'
  | 'course_planner'
  | 'course_handbook'
  | 'historical_schedule'
  | 'equivalent_unit_page'
  | 'equivalence_evidence'

export type UnitSourceOverride = {
  url?: string
  sourceKind?: UnitSourceKind
  referenceUrl?: string
  referenceKind?: 'course_planner' | 'course_handbook' | 'historical_schedule'
  verifiedEquivalentCode?: string
  equivalenceEvidenceUrl?: string
  notes?: string
}

const MPU_CATALOGUE_URL = 'https://www.swinburne.edu.my/study/admission/general-studies-mata-pelajaran-umum-mpu/'

export const UNIT_SOURCE_OVERRIDES: Record<string, UnitSourceOverride> = {
  COS10082: {
    url: 'https://www.swinburne.edu.my/courses/units-of-study/applied-analytics-business/',
    sourceKind: 'sarawak_unit_page',
  },
  COS20083: {
    url: 'https://www.swinburne.edu.my/courses/units-of-study/advanced-data-analytics/',
    sourceKind: 'sarawak_unit_page',
    notes: 'The source audit flagged prerequisite differences between official sources; this collector does not import requisites.',
  },
  INF10003: {
    url: 'https://www.swinburne.edu.my/courses/units-of-study/international-business-operations/',
    sourceKind: 'sarawak_unit_page',
    notes: 'The source audit flagged historical/code-context ambiguity for manual review.',
  },
  MPU3112: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3122: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3142: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3143: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3152: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3172: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3182: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3183: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3192: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3193: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3212: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3222: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3272: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3273: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3312: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  MPU3412: { url: MPU_CATALOGUE_URL, sourceKind: 'mpu_catalogue' },
  COS30047: {
    referenceUrl: 'https://www.swinburne.edu.my/wp-content/uploads/so-media/docs/study-planner/2024/24-Sep-ICTNTr3.pdf',
    referenceKind: 'course_planner',
  },
  SWE30011: {
    referenceUrl: 'https://www.swinburne.edu.au/course/undergraduate/bachelor-of-computer-science/handbook/',
    referenceKind: 'course_handbook',
  },
  SWE30012: {
    referenceUrl: 'https://www.swinburne.edu.au/app/student-admin-files/docs/fees-higher-education/2020/2020-higher-education-unit-delivery-schedule.pdf',
    referenceKind: 'historical_schedule',
  },
}

export const UNIT_EQUIVALENCES: Record<string, { code: string; evidenceUrl: string }> = {
  COS10011: { code: 'COS10026', evidenceUrl: 'https://www.swinburne.edu.au/course/unit/c/cos10026/' },
  COS20001: { code: 'ICT20025', evidenceUrl: 'https://www.swinburne.edu.au/course/unit/i/ict20025/' },
  ICT30005: { code: 'INF20028', evidenceUrl: 'https://www.swinburne.edu.au/course/unit/i/inf20028/' },
  INF30020: { code: 'INF20031', evidenceUrl: 'https://www.swinburne.edu.au/course/unit/i/inf20031/' },
}
