import type { PlannerSummary, PlannerDetail, Unit } from '../types'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function u(
  plannerId: string,
  year: number,
  semester: number,
  code: string,
  name: string,
  category: Unit['category'],
  isElectiveSlot = false,
  slotIndex?: number,
): Unit {
  const id = isElectiveSlot
    ? `slot-${plannerId}-${slotIndex ?? 0}`
    : `${plannerId}-y${year}s${semester}-${code}`
  return {
    id,
    code,
    name,
    category,
    creditPoints: 12.5,
    yearLevel: year,
    semester,
    isElectiveSlot,
  }
}

// ---------------------------------------------------------------------------
// Planner 1 — BCS Artificial Intelligence
// ---------------------------------------------------------------------------
const BCS_AI_ID = 'bcs-ai-2024-1'

const bcsAiSemesters = [
  {
    year: 1,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BCS_AI_ID, 1, 1, 'COS10009', 'Introduction to Programming', 'core'),
      { ...u(BCS_AI_ID, 1, 1, 'COS10026', 'Next Step Programming', 'core'), prerequisites: ['COS10009'] },
      u(BCS_AI_ID, 1, 1, 'MTH10006', 'Mathematics for Computing', 'core'),
      u(BCS_AI_ID, 1, 1, 'INF10003', 'Business Information Systems', 'prescribed_elective'),
      u(BCS_AI_ID, 1, 1, 'MPU3113', 'Bahasa Melayu Komunikasi 2', 'mpu'),
    ],
  },
  {
    year: 1,
    semester: 2,
    label: 'Semester 2',
    units: [
      { ...u(BCS_AI_ID, 1, 2, 'COS20007', 'Object Oriented Programming', 'core'), prerequisites: ['COS10009'] },
      { ...u(BCS_AI_ID, 1, 2, 'COS20019', 'Cloud Computing Architecture', 'core'), prerequisites: ['COS10026'] },
      u(BCS_AI_ID, 1, 2, 'MTH20011', 'Introduction to Statistics', 'core'),
      u(BCS_AI_ID, 1, 2, 'COS20016', 'Technical Documentation', 'core'),
      u(BCS_AI_ID, 1, 2, 'MPU3153', 'Hubungan Etnik', 'mpu'),
    ],
  },
  {
    year: 2,
    semester: 1,
    label: 'Semester 1',
    units: [
      { ...u(BCS_AI_ID, 2, 1, 'COS30008', 'Data Structures and Patterns', 'core'), prerequisites: ['COS20007'] },
      { ...u(BCS_AI_ID, 2, 1, 'COS30018', 'Intelligent Systems', 'major_core'), prerequisites: ['COS20007'] },
      { ...u(BCS_AI_ID, 2, 1, 'COS30049', 'Computing Technology Innovation Project', 'major_core'), prerequisites: ['COS10009', 'COS10026'] },
      u(BCS_AI_ID, 2, 1, 'INF30029', 'IT Project Management', 'core'),
    ],
  },
  {
    year: 2,
    semester: 2,
    label: 'Semester 2',
    units: [
      { ...u(BCS_AI_ID, 2, 2, 'COS30014', 'Artificial Intelligence', 'major_core'), prerequisites: ['COS30018'] },
      { ...u(BCS_AI_ID, 2, 2, 'COS30082', 'Machine Learning', 'major_core'), prerequisites: ['COS30018'] },
      u(BCS_AI_ID, 2, 2, 'COS30043', 'Interface Design and Development', 'prescribed_elective'),
      u(BCS_AI_ID, 2, 2, 'COS30045', 'Data Visualisation', 'prescribed_elective'),
    ],
  },
  {
    year: 3,
    semester: 1,
    label: 'Semester 1',
    units: [
      { ...u(BCS_AI_ID, 3, 1, 'COS40005', 'Computing Project', 'major_core'), prerequisites: ['COS30049'] },
      { ...u(BCS_AI_ID, 3, 1, 'COS40007', 'Capstone Project 1', 'core'), prerequisites: ['COS30008'] },
      { ...u(BCS_AI_ID, 3, 1, 'COS40006', 'Deep Learning', 'major_core'), prerequisites: ['COS30082'] },
      { ...u(BCS_AI_ID, 3, 1, 'COS40003', 'Data Analysis', 'major_core'), prerequisites: ['COS30082'] },
    ],
  },
  {
    year: 3,
    semester: 2,
    label: 'Semester 2',
    units: [
      { ...u(BCS_AI_ID, 3, 2, 'COS40008', 'Capstone Project 2', 'core'), prerequisites: ['COS40007'] },
      { ...u(BCS_AI_ID, 3, 2, 'COS40019', 'Natural Language Processing', 'major_core'), prerequisites: ['COS30082'] },
      u(BCS_AI_ID, 3, 2, 'FTE30001', 'Work Integrated Learning', 'wil'),
      u(BCS_AI_ID, 3, 2, 'ELE', 'Free Elective', 'elective', true, 1),
    ],
  },
]

const bcsAiDetail: PlannerDetail = {
  id: BCS_AI_ID,
  courseName: 'Bachelor of Computer Science',
  majorName: 'Artificial Intelligence',
  intakeYear: 2024,
  intakeMonth: 3,
  intakeLabel: 'March 2024',

  durationYears: 3,
  totalUnits: 24,
  semesters: bcsAiSemesters,
  requirements: {
    core: { count: 10 },
    major: { count: 8 },
    elective: { count: 2 },
    wil: { count: 1 },
  },
  electivePool: [
    { id: 'pool-1', code: 'COS30001', name: 'Database Management',            category: 'elective', creditPoints: 12.5, yearLevel: 3, semester: 1, isElectiveSlot: false, prerequisites: undefined,             availability: ['March', 'August'] },
    { id: 'pool-2', code: 'COS30017', name: 'Internet of Things',              category: 'elective', creditPoints: 12.5, yearLevel: 3, semester: 2, isElectiveSlot: false, prerequisites: ['COS20007'],          availability: ['August'] },
    { id: 'pool-3', code: 'COS30033', name: 'Computer Networks',               category: 'elective', creditPoints: 12.5, yearLevel: 3, semester: 1, isElectiveSlot: false, prerequisites: ['COS20007'],          availability: ['March', 'August'] },
    { id: 'pool-4', code: 'COS30041', name: 'Digital Forensics',               category: 'elective', creditPoints: 12.5, yearLevel: 3, semester: 2, isElectiveSlot: false, prerequisites: ['COS10009'],          availability: ['August'] },
    { id: 'pool-5', code: 'SWE30011', name: 'Software Testing & Quality',      category: 'elective', creditPoints: 12.5, yearLevel: 3, semester: 1, isElectiveSlot: false, prerequisites: ['COS20007'],          availability: ['March'] },
    { id: 'pool-6', code: 'COS30043', name: 'Interface Design & Development',  category: 'elective', creditPoints: 12.5, yearLevel: 3, semester: 1, isElectiveSlot: false, prerequisites: undefined,             availability: ['March', 'August'] },
  ],
}

// ---------------------------------------------------------------------------
// Planner 2 — BCS Cybersecurity
// ---------------------------------------------------------------------------
const BCS_CY_ID = 'bcs-cy-2024-1'

const bcsCySemesters = [
  {
    year: 1,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BCS_CY_ID, 1, 1, 'COS10009', 'Introduction to Programming', 'core'),
      u(BCS_CY_ID, 1, 1, 'COS10026', 'Next Step Programming', 'core'),
      u(BCS_CY_ID, 1, 1, 'MTH10006', 'Mathematics for Computing', 'core'),
      u(BCS_CY_ID, 1, 1, 'INF10003', 'Business Information Systems', 'prescribed_elective'),
      u(BCS_CY_ID, 1, 1, 'MPU3113', 'Bahasa Melayu Komunikasi 2', 'mpu'),
    ],
  },
  {
    year: 1,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BCS_CY_ID, 1, 2, 'COS20007', 'Object Oriented Programming', 'core'),
      u(BCS_CY_ID, 1, 2, 'COS20019', 'Cloud Computing Architecture', 'core'),
      u(BCS_CY_ID, 1, 2, 'MTH20011', 'Introduction to Statistics', 'core'),
      u(BCS_CY_ID, 1, 2, 'COS20016', 'Technical Documentation', 'core'),
      u(BCS_CY_ID, 1, 2, 'MPU3153', 'Hubungan Etnik', 'mpu'),
    ],
  },
  {
    year: 2,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BCS_CY_ID, 2, 1, 'COS30008', 'Data Structures and Patterns', 'core'),
      u(BCS_CY_ID, 2, 1, 'COS30017', 'Internet of Things', 'major_core'),
      u(BCS_CY_ID, 2, 1, 'COS30049', 'Computing Technology Innovation Project', 'major_core'),
      u(BCS_CY_ID, 2, 1, 'INF30029', 'IT Project Management', 'core'),
    ],
  },
  {
    year: 2,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BCS_CY_ID, 2, 2, 'COS30022', 'Network Security', 'major_core'),
      u(BCS_CY_ID, 2, 2, 'COS30044', 'Ethical Hacking', 'major_core'),
      u(BCS_CY_ID, 2, 2, 'NET30001', 'Network Fundamentals', 'prescribed_elective'),
      u(BCS_CY_ID, 2, 2, 'NET30002', 'Advanced Networking', 'prescribed_elective'),
    ],
  },
  {
    year: 3,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BCS_CY_ID, 3, 1, 'COS40005', 'Computing Project', 'major_core'),
      u(BCS_CY_ID, 3, 1, 'COS40007', 'Capstone Project 1', 'core'),
      u(BCS_CY_ID, 3, 1, 'SEC40001', 'Penetration Testing', 'major_core'),
      u(BCS_CY_ID, 3, 1, 'NET40001', 'Network Architecture', 'major_core'),
    ],
  },
  {
    year: 3,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BCS_CY_ID, 3, 2, 'COS40008', 'Capstone Project 2', 'core'),
      u(BCS_CY_ID, 3, 2, 'SEC40002', 'Digital Forensics', 'major_core'),
      u(BCS_CY_ID, 3, 2, 'FTE30001', 'Work Integrated Learning', 'wil'),
      u(BCS_CY_ID, 3, 2, 'ELE', 'Free Elective', 'elective', true, 1),
    ],
  },
]

const bcsCyDetail: PlannerDetail = {
  id: BCS_CY_ID,
  courseName: 'Bachelor of Computer Science',
  majorName: 'Cybersecurity',
  intakeYear: 2024,
  intakeMonth: 3,
  intakeLabel: 'March 2024',

  durationYears: 3,
  totalUnits: 24,
  semesters: bcsCySemesters,
  requirements: {
    core: { count: 10 },
    major: { count: 8 },
    elective: { count: 2 },
    wil: { count: 1 },
  },
  electivePool: [
    {
      id: 'pool-cy-1',
      code: 'COS30014',
      name: 'Artificial Intelligence',
      category: 'elective',
      creditPoints: 12.5,
      yearLevel: 3,
      semester: 1,
      isElectiveSlot: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Planner 3 — BCS Software Development
// ---------------------------------------------------------------------------
const BCS_SD_ID = 'bcs-sd-2024-1'

const bcsSdSemesters = [
  {
    year: 1,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BCS_SD_ID, 1, 1, 'COS10009', 'Introduction to Programming', 'core'),
      u(BCS_SD_ID, 1, 1, 'COS10026', 'Next Step Programming', 'core'),
      u(BCS_SD_ID, 1, 1, 'MTH10006', 'Mathematics for Computing', 'core'),
      u(BCS_SD_ID, 1, 1, 'INF10003', 'Business Information Systems', 'prescribed_elective'),
      u(BCS_SD_ID, 1, 1, 'MPU3113', 'Bahasa Melayu Komunikasi 2', 'mpu'),
    ],
  },
  {
    year: 1,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BCS_SD_ID, 1, 2, 'COS20007', 'Object Oriented Programming', 'core'),
      u(BCS_SD_ID, 1, 2, 'COS20019', 'Cloud Computing Architecture', 'core'),
      u(BCS_SD_ID, 1, 2, 'MTH20011', 'Introduction to Statistics', 'core'),
      u(BCS_SD_ID, 1, 2, 'COS20016', 'Technical Documentation', 'core'),
      u(BCS_SD_ID, 1, 2, 'MPU3153', 'Hubungan Etnik', 'mpu'),
    ],
  },
  {
    year: 2,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BCS_SD_ID, 2, 1, 'COS30008', 'Data Structures and Patterns', 'core'),
      u(BCS_SD_ID, 2, 1, 'COS30049', 'Computing Technology Innovation Project', 'major_core'),
      u(BCS_SD_ID, 2, 1, 'SWE30001', 'Software Requirements Engineering', 'major_core'),
      u(BCS_SD_ID, 2, 1, 'INF30029', 'IT Project Management', 'core'),
    ],
  },
  {
    year: 2,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BCS_SD_ID, 2, 2, 'SWE30002', 'Software Design and Architecture', 'major_core'),
      u(BCS_SD_ID, 2, 2, 'SWE30003', 'Software Testing and Quality', 'major_core'),
      u(BCS_SD_ID, 2, 2, 'COS30043', 'Interface Design and Development', 'prescribed_elective'),
      u(BCS_SD_ID, 2, 2, 'COS30045', 'Data Visualisation', 'prescribed_elective'),
    ],
  },
  {
    year: 3,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BCS_SD_ID, 3, 1, 'COS40005', 'Computing Project', 'major_core'),
      u(BCS_SD_ID, 3, 1, 'COS40007', 'Capstone Project 1', 'core'),
      u(BCS_SD_ID, 3, 1, 'SWE40001', 'Advanced Software Engineering', 'major_core'),
      u(BCS_SD_ID, 3, 1, 'SWE40002', 'DevOps and CI/CD', 'major_core'),
    ],
  },
  {
    year: 3,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BCS_SD_ID, 3, 2, 'COS40008', 'Capstone Project 2', 'core'),
      u(BCS_SD_ID, 3, 2, 'SWE40003', 'Software Project Management', 'major_core'),
      u(BCS_SD_ID, 3, 2, 'FTE30001', 'Work Integrated Learning', 'wil'),
      u(BCS_SD_ID, 3, 2, 'ELE', 'Free Elective', 'elective', true, 1),
    ],
  },
]

const bcsSdDetail: PlannerDetail = {
  id: BCS_SD_ID,
  courseName: 'Bachelor of Computer Science',
  majorName: 'Software Development',
  intakeYear: 2024,
  intakeMonth: 3,
  intakeLabel: 'March 2024',

  durationYears: 3,
  totalUnits: 24,
  semesters: bcsSdSemesters,
  requirements: {
    core: { count: 10 },
    major: { count: 8 },
    elective: { count: 2 },
    wil: { count: 1 },
  },
  electivePool: [],
}

// ---------------------------------------------------------------------------
// Planner 4 — BBus Business Analytics
// ---------------------------------------------------------------------------
const BBUS_BA_ID = 'bbus-ba-2024-1'

const bbusBaSemesters = [
  {
    year: 1,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BBUS_BA_ID, 1, 1, 'ACC10007', 'Accounting Fundamentals', 'core'),
      u(BBUS_BA_ID, 1, 1, 'ECO10005', 'Introduction to Economics', 'core'),
      u(BBUS_BA_ID, 1, 1, 'MGT10001', 'Management Principles', 'core'),
      u(BBUS_BA_ID, 1, 1, 'MKT10001', 'Marketing Fundamentals', 'prescribed_elective'),
      u(BBUS_BA_ID, 1, 1, 'MPU3113', 'Bahasa Melayu Komunikasi 2', 'mpu'),
    ],
  },
  {
    year: 1,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BBUS_BA_ID, 1, 2, 'ACC20015', 'Financial Accounting', 'core'),
      u(BBUS_BA_ID, 1, 2, 'ECO20001', 'Microeconomics', 'core'),
      u(BBUS_BA_ID, 1, 2, 'MGT20022', 'Organisational Behaviour', 'core'),
      u(BBUS_BA_ID, 1, 2, 'STA10003', 'Business Statistics', 'core'),
      u(BBUS_BA_ID, 1, 2, 'MPU3153', 'Hubungan Etnik', 'mpu'),
    ],
  },
  {
    year: 2,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BBUS_BA_ID, 2, 1, 'ACC30017', 'Management Accounting', 'core'),
      u(BBUS_BA_ID, 2, 1, 'BUS30001', 'Business Analytics Fundamentals', 'major_core'),
      u(BBUS_BA_ID, 2, 1, 'MGT30006', 'Strategic Management', 'core'),
      u(BBUS_BA_ID, 2, 1, 'STA20001', 'Statistical Analysis', 'major_core'),
    ],
  },
  {
    year: 2,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BBUS_BA_ID, 2, 2, 'BUS30002', 'Data Mining for Business', 'major_core'),
      u(BBUS_BA_ID, 2, 2, 'MGT30007', 'Operations Management', 'prescribed_elective'),
      u(BBUS_BA_ID, 2, 2, 'STA30001', 'Predictive Analytics', 'major_core'),
      u(BBUS_BA_ID, 2, 2, 'INF30029', 'IT Project Management', 'prescribed_elective'),
    ],
  },
  {
    year: 3,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BBUS_BA_ID, 3, 1, 'BUS40001', 'Advanced Business Analytics', 'major_core'),
      u(BBUS_BA_ID, 3, 1, 'MGT40001', 'Business Intelligence', 'major_core'),
      u(BBUS_BA_ID, 3, 1, 'STA40001', 'Machine Learning for Business', 'major_core'),
      u(BBUS_BA_ID, 3, 1, 'ELE', 'Free Elective', 'elective', true, 1),
    ],
  },
  {
    year: 3,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BBUS_BA_ID, 3, 2, 'BUS40002', 'Analytics Capstone', 'major_core'),
      u(BBUS_BA_ID, 3, 2, 'MGT40002', 'Strategic Analytics', 'major_core'),
      u(BBUS_BA_ID, 3, 2, 'FTE30001', 'Work Integrated Learning', 'wil'),
      u(BBUS_BA_ID, 3, 2, 'ELE', 'Free Elective', 'elective', true, 2),
    ],
  },
]

const bbusBaDetail: PlannerDetail = {
  id: BBUS_BA_ID,
  courseName: 'Bachelor of Business',
  majorName: 'Business Analytics',
  intakeYear: 2024,
  intakeMonth: 3,
  intakeLabel: 'March 2024',

  durationYears: 3,
  totalUnits: 24,
  semesters: bbusBaSemesters,
  requirements: {
    core: { count: 10 },
    major: { count: 8 },
    elective: { count: 2 },
    wil: { count: 1 },
  },
  electivePool: [
    {
      id: 'pool-ba-1',
      code: 'MKT30001',
      name: 'Digital Marketing Analytics',
      category: 'elective',
      creditPoints: 12.5,
      yearLevel: 3,
      semester: 1,
      isElectiveSlot: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Planner 5 — BBus Finance
// ---------------------------------------------------------------------------
const BBUS_FI_ID = 'bbus-fi-2024-1'

const bbusFiSemesters = [
  {
    year: 1,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BBUS_FI_ID, 1, 1, 'ACC10007', 'Accounting Fundamentals', 'core'),
      u(BBUS_FI_ID, 1, 1, 'ECO10005', 'Introduction to Economics', 'core'),
      u(BBUS_FI_ID, 1, 1, 'MGT10001', 'Management Principles', 'core'),
      u(BBUS_FI_ID, 1, 1, 'FIN10001', 'Introduction to Finance', 'major_core'),
      u(BBUS_FI_ID, 1, 1, 'MPU3113', 'Bahasa Melayu Komunikasi 2', 'mpu'),
    ],
  },
  {
    year: 1,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BBUS_FI_ID, 1, 2, 'ACC20015', 'Financial Accounting', 'core'),
      u(BBUS_FI_ID, 1, 2, 'ECO20001', 'Microeconomics', 'core'),
      u(BBUS_FI_ID, 1, 2, 'FIN20001', 'Corporate Finance', 'major_core'),
      u(BBUS_FI_ID, 1, 2, 'FIN20002', 'Financial Markets', 'major_core'),
      u(BBUS_FI_ID, 1, 2, 'MPU3153', 'Hubungan Etnik', 'mpu'),
    ],
  },
  {
    year: 2,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BBUS_FI_ID, 2, 1, 'ACC30017', 'Management Accounting', 'core'),
      u(BBUS_FI_ID, 2, 1, 'FIN30001', 'Investment Analysis', 'major_core'),
      u(BBUS_FI_ID, 2, 1, 'FIN30002', 'Risk Management', 'major_core'),
      u(BBUS_FI_ID, 2, 1, 'ECO30001', 'Macroeconomics', 'core'),
    ],
  },
  {
    year: 2,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BBUS_FI_ID, 2, 2, 'FIN30003', 'Portfolio Management', 'major_core'),
      u(BBUS_FI_ID, 2, 2, 'FIN30004', 'Financial Modelling', 'major_core'),
      u(BBUS_FI_ID, 2, 2, 'MGT30006', 'Strategic Management', 'prescribed_elective'),
      u(BBUS_FI_ID, 2, 2, 'INF30029', 'IT Project Management', 'prescribed_elective'),
    ],
  },
  {
    year: 3,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BBUS_FI_ID, 3, 1, 'FIN40001', 'Advanced Corporate Finance', 'major_core'),
      u(BBUS_FI_ID, 3, 1, 'FIN40002', 'Derivatives and Futures', 'major_core'),
      u(BBUS_FI_ID, 3, 1, 'ELE', 'Free Elective', 'elective', true, 1),
      u(BBUS_FI_ID, 3, 1, 'ELE', 'Free Elective', 'elective', true, 2),
    ],
  },
  {
    year: 3,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BBUS_FI_ID, 3, 2, 'FIN40003', 'Finance Capstone', 'core'),
      u(BBUS_FI_ID, 3, 2, 'FIN40004', 'Fintech and Digital Finance', 'major_core'),
      u(BBUS_FI_ID, 3, 2, 'FTE30001', 'Work Integrated Learning', 'wil'),
      u(BBUS_FI_ID, 3, 2, 'ELE', 'Free Elective', 'elective', true, 3),
    ],
  },
]

const bbusFiDetail: PlannerDetail = {
  id: BBUS_FI_ID,
  courseName: 'Bachelor of Business',
  majorName: 'Finance',
  intakeYear: 2024,
  intakeMonth: 3,
  intakeLabel: 'March 2024',

  durationYears: 3,
  totalUnits: 24,
  semesters: bbusFiSemesters,
  requirements: {
    core: { count: 8 },
    major: { count: 10 },
    elective: { count: 3 },
    wil: { count: 1 },
  },
  electivePool: [
    {
      id: 'pool-fi-1',
      code: 'ACC40001',
      name: 'Advanced Taxation',
      category: 'elective',
      creditPoints: 12.5,
      yearLevel: 4,
      semester: 1,
      isElectiveSlot: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Planner 6 — BEng Civil Engineering
// ---------------------------------------------------------------------------
const BENG_CE_ID = 'beng-ce-2024-1'

const bengCeSemesters = [
  {
    year: 1,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BENG_CE_ID, 1, 1, 'ENG10001', 'Engineering Fundamentals', 'core'),
      u(BENG_CE_ID, 1, 1, 'MTH10006', 'Mathematics for Computing', 'core'),
      u(BENG_CE_ID, 1, 1, 'MTH10007', 'Engineering Mathematics 1', 'core'),
      u(BENG_CE_ID, 1, 1, 'ENG10002', 'Engineering Drawing and Design', 'core'),
      u(BENG_CE_ID, 1, 1, 'MPU3113', 'Bahasa Melayu Komunikasi 2', 'mpu'),
    ],
  },
  {
    year: 1,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BENG_CE_ID, 1, 2, 'ENG10003', 'Mechanics of Materials', 'core'),
      u(BENG_CE_ID, 1, 2, 'MTH20011', 'Engineering Mathematics 2', 'core'),
      u(BENG_CE_ID, 1, 2, 'PHY10001', 'Engineering Physics', 'core'),
      u(BENG_CE_ID, 1, 2, 'ENG10004', 'Engineering Computing', 'core'),
      u(BENG_CE_ID, 1, 2, 'MPU3153', 'Hubungan Etnik', 'mpu'),
    ],
  },
  {
    year: 2,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BENG_CE_ID, 2, 1, 'CVL20001', 'Structural Analysis', 'core'),
      u(BENG_CE_ID, 2, 1, 'CVL20002', 'Fluid Mechanics', 'core'),
      u(BENG_CE_ID, 2, 1, 'MTH20012', 'Engineering Mathematics 3', 'core'),
      u(BENG_CE_ID, 2, 1, 'ENG20001', 'Engineering Materials', 'core'),
    ],
  },
  {
    year: 2,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BENG_CE_ID, 2, 2, 'CVL20003', 'Geotechnical Engineering', 'core'),
      u(BENG_CE_ID, 2, 2, 'CVL20004', 'Transportation Engineering', 'core'),
      u(BENG_CE_ID, 2, 2, 'CVL20005', 'Environmental Engineering', 'core'),
      u(BENG_CE_ID, 2, 2, 'ENG20002', 'Engineering Economics', 'core'),
    ],
  },
  {
    year: 3,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BENG_CE_ID, 3, 1, 'CVL30001', 'Structural Design', 'core'),
      u(BENG_CE_ID, 3, 1, 'CVL30002', 'Foundation Engineering', 'core'),
      u(BENG_CE_ID, 3, 1, 'CVL30003', 'Hydraulics and Hydrology', 'core'),
      u(BENG_CE_ID, 3, 1, 'ENG30001', 'Engineering Project Management', 'core'),
    ],
  },
  {
    year: 3,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BENG_CE_ID, 3, 2, 'CVL30004', 'Construction Technology', 'core'),
      u(BENG_CE_ID, 3, 2, 'CVL30005', 'Engineering Ethics and Safety', 'core'),
      u(BENG_CE_ID, 3, 2, 'ENG30002', 'Professional Engineering Practice', 'core'),
      u(BENG_CE_ID, 3, 2, 'ENG30003', 'Research Methods', 'core'),
    ],
  },
  {
    year: 4,
    semester: 1,
    label: 'Semester 1',
    units: [
      u(BENG_CE_ID, 4, 1, 'CVL40001', 'Advanced Structural Engineering', 'core'),
      u(BENG_CE_ID, 4, 1, 'CVL40002', 'Civil Engineering Design Project 1', 'core'),
      u(BENG_CE_ID, 4, 1, 'CVL40003', 'Infrastructure Planning', 'core'),
      u(BENG_CE_ID, 4, 1, 'ELE', 'Free Elective', 'elective', true, 1),
    ],
  },
  {
    year: 4,
    semester: 2,
    label: 'Semester 2',
    units: [
      u(BENG_CE_ID, 4, 2, 'CVL40004', 'Civil Engineering Design Project 2', 'core'),
      u(BENG_CE_ID, 4, 2, 'ENG40001', 'Engineering Capstone', 'core'),
      u(BENG_CE_ID, 4, 2, 'FTE30001', 'Work Integrated Learning', 'wil'),
      u(BENG_CE_ID, 4, 2, 'ELE', 'Free Elective', 'elective', true, 2),
    ],
  },
]

const bengCeDetail: PlannerDetail = {
  id: BENG_CE_ID,
  courseName: 'Bachelor of Engineering (Civil)',
  majorName: null,
  intakeYear: 2024,
  intakeMonth: 3,
  intakeLabel: 'March 2024',

  durationYears: 4,
  totalUnits: 32,
  semesters: bengCeSemesters,
  requirements: {
    core: { count: 28 },
    major: { count: 0 },
    elective: { count: 2 },
    wil: { count: 1 },
  },
  electivePool: [
    {
      id: 'pool-eng-1',
      code: 'CVL40005',
      name: 'Bridge Engineering',
      category: 'elective',
      creditPoints: 12.5,
      yearLevel: 4,
      semester: 1,
      isElectiveSlot: false,
    },
    {
      id: 'pool-eng-2',
      code: 'CVL40006',
      name: 'Coastal Engineering',
      category: 'elective',
      creditPoints: 12.5,
      yearLevel: 4,
      semester: 2,
      isElectiveSlot: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export const MOCK_PLANNERS: PlannerSummary[] = [
  {
    id: BCS_AI_ID,
    courseName: 'Bachelor of Computer Science',
    majorName: 'Artificial Intelligence',
    intakeYear: 2024,
    intakeMonth: 3,
    intakeLabel: 'March 2024',
  
    durationYears: 3,
    totalUnits: 24,
  },
  {
    id: BCS_CY_ID,
    courseName: 'Bachelor of Computer Science',
    majorName: 'Cybersecurity',
    intakeYear: 2024,
    intakeMonth: 3,
    intakeLabel: 'March 2024',
  
    durationYears: 3,
    totalUnits: 24,
  },
  {
    id: BCS_SD_ID,
    courseName: 'Bachelor of Computer Science',
    majorName: 'Software Development',
    intakeYear: 2024,
    intakeMonth: 3,
    intakeLabel: 'March 2024',
  
    durationYears: 3,
    totalUnits: 24,
  },
  {
    id: BBUS_BA_ID,
    courseName: 'Bachelor of Business',
    majorName: 'Business Analytics',
    intakeYear: 2024,
    intakeMonth: 3,
    intakeLabel: 'March 2024',
  
    durationYears: 3,
    totalUnits: 24,
  },
  {
    id: BBUS_FI_ID,
    courseName: 'Bachelor of Business',
    majorName: 'Finance',
    intakeYear: 2024,
    intakeMonth: 3,
    intakeLabel: 'March 2024',
  
    durationYears: 3,
    totalUnits: 24,
  },
  {
    id: BENG_CE_ID,
    courseName: 'Bachelor of Engineering (Civil)',
    majorName: null,
    intakeYear: 2024,
    intakeMonth: 3,
    intakeLabel: 'March 2024',
  
    durationYears: 4,
    totalUnits: 32,
  },
]

export const MOCK_PLANNER_DETAILS: Record<string, PlannerDetail> = {
  [BCS_AI_ID]: bcsAiDetail,
  [BCS_CY_ID]: bcsCyDetail,
  [BCS_SD_ID]: bcsSdDetail,
  [BBUS_BA_ID]: bbusBaDetail,
  [BBUS_FI_ID]: bbusFiDetail,
  [BENG_CE_ID]: bengCeDetail,
}
