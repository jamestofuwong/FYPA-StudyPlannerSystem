export type UnitType = 'core' | 'elective' | 'mpu' | 'industrial-training';

export interface PlannerUnit {
  code: string;
  name: string;
  credits: number;
  type: UnitType;
}

export interface PlannerSemester {
  year: number;
  semester: number;
  units: PlannerUnit[];
}

export interface Planner {
  id: string;
  courseCode: string;
  courseName: string;
  majorCode: string;
  majorName: string;
  intakeYear: number;
  totalSemesters: number;
  totalUnits: number;
  totalCredits: number;
  status: 'active' | 'archived' | 'draft';
  parsedAt: string;
  semesters: PlannerSemester[];
}

export interface ParseRun {
  id: string;
  triggeredAt: string;
  completedAt: string | null;
  status: 'success' | 'failed' | 'partial' | 'running';
  source: string;
  plannersScanned: number;
  plannersNew: number;
  plannersUpdated: number;
  plannersUnchanged: number;
  durationMs: number | null;
  errorMessage: string | null;
  logs: string[];
}

export const MOCK_PLANNERS: Planner[] = [
  {
    id: '1',
    courseCode: 'CT000-3-3',
    courseName: 'Bachelor of Computer Science (Hons)',
    majorCode: 'SE',
    majorName: 'Software Engineering',
    intakeYear: 2023,
    totalSemesters: 8,
    totalUnits: 34,
    totalCredits: 124,
    status: 'active',
    parsedAt: '2025-05-10T08:12:00Z',
    semesters: [
      {
        year: 1, semester: 1,
        units: [
          { code: 'CT001-3-1', name: 'Introduction to Programming', credits: 3, type: 'core' },
          { code: 'CT002-3-1', name: 'Computer Organisation', credits: 3, type: 'core' },
          { code: 'CT003-3-1', name: 'Discrete Mathematics', credits: 3, type: 'core' },
          { code: 'MPU3113', name: 'Bahasa Kebangsaan A', credits: 3, type: 'mpu' },
          { code: 'MPU3123', name: 'Pengurusan Dalam Islam / Moral Studies', credits: 2, type: 'mpu' },
        ],
      },
      {
        year: 1, semester: 2,
        units: [
          { code: 'CT011-3-2', name: 'Data Structures & Algorithms', credits: 3, type: 'core' },
          { code: 'CT012-3-2', name: 'Object-Oriented Programming', credits: 3, type: 'core' },
          { code: 'CT013-3-2', name: 'Probability & Statistics', credits: 3, type: 'core' },
          { code: 'CT014-3-2', name: 'Database Systems', credits: 3, type: 'core' },
          { code: 'MPU3143', name: 'English for Academic Communication', credits: 2, type: 'mpu' },
        ],
      },
      {
        year: 2, semester: 1,
        units: [
          { code: 'CT021-3-3', name: 'Software Engineering Principles', credits: 3, type: 'core' },
          { code: 'CT022-3-3', name: 'Operating Systems', credits: 3, type: 'core' },
          { code: 'CT023-3-3', name: 'Web Technologies', credits: 3, type: 'core' },
          { code: 'CT024-3-3', name: 'Software Testing & Quality', credits: 3, type: 'core' },
        ],
      },
      {
        year: 2, semester: 2,
        units: [
          { code: 'CT031-3-4', name: 'Software Architecture & Design', credits: 3, type: 'core' },
          { code: 'CT032-3-4', name: 'Mobile Application Development', credits: 3, type: 'core' },
          { code: 'CT033-3-4', name: 'Computer Networks', credits: 3, type: 'core' },
          { code: 'CT034-3-4', name: 'Human Computer Interaction', credits: 3, type: 'core' },
        ],
      },
      {
        year: 3, semester: 1,
        units: [
          { code: 'CT041-3-5', name: 'Final Year Project I', credits: 3, type: 'core' },
          { code: 'CT042-3-5', name: 'Cloud Computing', credits: 3, type: 'core' },
          { code: 'CT043-3-5', name: 'Elective I', credits: 3, type: 'elective' },
          { code: 'CT044-3-5', name: 'Elective II', credits: 3, type: 'elective' },
        ],
      },
      {
        year: 3, semester: 2,
        units: [
          { code: 'CT051-3-6', name: 'Final Year Project II', credits: 6, type: 'core' },
          { code: 'CT052-3-6', name: 'Professional Ethics in Computing', credits: 2, type: 'core' },
          { code: 'CT053-3-6', name: 'Elective III', credits: 3, type: 'elective' },
        ],
      },
    ],
  },
  {
    id: '2',
    courseCode: 'CT000-3-3',
    courseName: 'Bachelor of Computer Science (Hons)',
    majorCode: 'AI',
    majorName: 'Artificial Intelligence',
    intakeYear: 2023,
    totalSemesters: 8,
    totalUnits: 33,
    totalCredits: 122,
    status: 'active',
    parsedAt: '2025-05-10T08:14:00Z',
    semesters: [
      {
        year: 1, semester: 1,
        units: [
          { code: 'CT001-3-1', name: 'Introduction to Programming', credits: 3, type: 'core' },
          { code: 'CT002-3-1', name: 'Computer Organisation', credits: 3, type: 'core' },
          { code: 'CT003-3-1', name: 'Discrete Mathematics', credits: 3, type: 'core' },
          { code: 'MPU3113', name: 'Bahasa Kebangsaan A', credits: 3, type: 'mpu' },
          { code: 'MPU3123', name: 'Pengurusan Dalam Islam / Moral Studies', credits: 2, type: 'mpu' },
        ],
      },
      {
        year: 1, semester: 2,
        units: [
          { code: 'CT011-3-2', name: 'Data Structures & Algorithms', credits: 3, type: 'core' },
          { code: 'CT012-3-2', name: 'Object-Oriented Programming', credits: 3, type: 'core' },
          { code: 'AI013-3-2', name: 'Linear Algebra for AI', credits: 3, type: 'core' },
          { code: 'AI014-3-2', name: 'Probability & Statistics for AI', credits: 3, type: 'core' },
          { code: 'MPU3143', name: 'English for Academic Communication', credits: 2, type: 'mpu' },
        ],
      },
    ],
  },
  {
    id: '3',
    courseCode: 'IT000-3-3',
    courseName: 'Bachelor of Information Technology (Hons)',
    majorCode: 'NET',
    majorName: 'Networking & Security',
    intakeYear: 2022,
    totalSemesters: 8,
    totalUnits: 32,
    totalCredits: 120,
    status: 'archived',
    parsedAt: '2024-11-02T09:30:00Z',
    semesters: [],
  },
  {
    id: '4',
    courseCode: 'IT000-3-3',
    courseName: 'Bachelor of Information Technology (Hons)',
    majorCode: 'DS',
    majorName: 'Data Science',
    intakeYear: 2023,
    totalSemesters: 8,
    totalUnits: 33,
    totalCredits: 121,
    status: 'active',
    parsedAt: '2025-05-10T08:20:00Z',
    semesters: [],
  },
  {
    id: '5',
    courseCode: 'BM000-3-3',
    courseName: 'Bachelor of Business Management (Hons)',
    majorCode: 'FIN',
    majorName: 'Finance',
    intakeYear: 2023,
    totalSemesters: 8,
    totalUnits: 30,
    totalCredits: 115,
    status: 'draft',
    parsedAt: '2025-05-09T14:00:00Z',
    semesters: [],
  },
];

export const MOCK_PARSE_HISTORY: ParseRun[] = [
  {
    id: 'run-001',
    triggeredAt: '2025-05-10T08:00:00Z',
    completedAt: '2025-05-10T08:21:33Z',
    status: 'success',
    source: 'APU Academic Portal',
    plannersScanned: 18,
    plannersNew: 2,
    plannersUpdated: 1,
    plannersUnchanged: 15,
    durationMs: 1293000,
    errorMessage: null,
    logs: [
      '[08:00:01] Starting scheduled parse run...',
      '[08:00:02] Fetching planner index from portal...',
      '[08:02:14] Found 18 planners to process.',
      '[08:04:30] CT000-3-3 / SE / 2023 — NEW',
      '[08:07:18] CT000-3-3 / AI / 2023 — NEW',
      '[08:11:05] IT000-3-3 / DS / 2023 — UPDATED (2 units changed)',
      '[08:21:30] All planners processed successfully.',
      '[08:21:33] Run complete. Duration: 21m 33s',
    ],
  },
  {
    id: 'run-002',
    triggeredAt: '2025-05-09T08:00:00Z',
    completedAt: '2025-05-09T08:18:44Z',
    status: 'success',
    source: 'APU Academic Portal',
    plannersScanned: 16,
    plannersNew: 0,
    plannersUpdated: 0,
    plannersUnchanged: 16,
    durationMs: 1124000,
    errorMessage: null,
    logs: [
      '[08:00:01] Starting scheduled parse run...',
      '[08:00:03] Fetching planner index from portal...',
      '[08:18:44] No changes detected. Run complete.',
    ],
  },
  {
    id: 'run-003',
    triggeredAt: '2025-05-08T08:00:00Z',
    completedAt: '2025-05-08T08:05:12Z',
    status: 'partial',
    source: 'APU Academic Portal',
    plannersScanned: 16,
    plannersNew: 0,
    plannersUpdated: 0,
    plannersUnchanged: 14,
    durationMs: 312000,
    errorMessage: '2 planners failed to parse (timeout).',
    logs: [
      '[08:00:01] Starting scheduled parse run...',
      '[08:00:03] Fetching planner index from portal...',
      '[08:03:44] WARN: Timeout fetching IT000-3-3 / NET / 2022 (retrying...)',
      '[08:04:55] ERROR: IT000-3-3 / NET / 2022 — failed after 3 retries',
      '[08:05:10] WARN: BM000-3-3 / FIN / 2023 — failed (parse error)',
      '[08:05:12] Run complete with errors. 14/16 planners processed.',
    ],
  },
  {
    id: 'run-004',
    triggeredAt: '2025-05-07T08:00:00Z',
    completedAt: '2025-05-07T08:01:03Z',
    status: 'failed',
    source: 'APU Academic Portal',
    plannersScanned: 0,
    plannersNew: 0,
    plannersUpdated: 0,
    plannersUnchanged: 0,
    durationMs: 63000,
    errorMessage: 'Failed to authenticate with portal. Check credentials.',
    logs: [
      '[08:00:01] Starting scheduled parse run...',
      '[08:00:03] Fetching planner index from portal...',
      '[08:01:01] ERROR: Authentication failed (HTTP 401)',
      '[08:01:03] Run aborted.',
    ],
  },
  {
    id: 'run-005',
    triggeredAt: '2025-05-06T08:00:00Z',
    completedAt: '2025-05-06T08:16:20Z',
    status: 'success',
    source: 'APU Academic Portal',
    plannersScanned: 16,
    plannersNew: 3,
    plannersUpdated: 2,
    plannersUnchanged: 11,
    durationMs: 980000,
    errorMessage: null,
    logs: [
      '[08:00:01] Starting scheduled parse run...',
      '[08:16:20] Run complete. 5 planners changed.',
    ],
  },
];
