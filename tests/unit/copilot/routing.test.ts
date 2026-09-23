/**
 * Copilot routing tests
 *
 * Verifies that each test prompt:
 *   1. Pre-filters to include the expected workflow
 *   2. Routes to the correct workflow ID (LLM mocked to return expected ID)
 *   3. Extracts the expected params via regex without a second LLM call
 *
 * The Ollama HTTP call is mocked — these tests do NOT require Ollama to be running.
 */

import { routeAndExtract } from '../../../core/services/copilot/copilotService';
import type { Workflow } from '../../../core/services/copilot/types';

// ---------------------------------------------------------------------------
// Minimal workflow stubs — only id / description / params are used by routing.
// No execute() needed, no DB or portal imports.
// ---------------------------------------------------------------------------
const WORKFLOWS: Workflow<any, any>[] = [
  // Student
  {
    id: 'search_student',
    description: 'Searches for students by name or student ID. Returns matching student IDs and names.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_major',
    description: 'Returns the student\'s enrolled major and course.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_progress',
    description: 'Returns student CGPA, credits completed, grade level, and graduation date.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'check_graduation_status',
    description: 'Checks whether a student has met all graduation requirements based on completed credits, CGPA, and failed units.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_units',
    description: 'Returns all units taken by a student with grades and terms.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_failed_units',
    description: 'Returns units the student has failed or is at academic risk in.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_enrollment_history',
    description: 'Returns all enrollment records across the student\'s history.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_grade_for_unit',
    description: 'Returns the grade a student received for a specific unit.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'unitCode', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'did_student_pass_unit',
    description: 'Checks whether a student has ever passed a given unit.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'unitCode', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'check_student_wil_status',
    description: 'Checks whether the student has completed a WIL or internship unit.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_repeated_units',
    description: 'Returns units the student has attempted more than once.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_prerequisite_violations',
    description: 'Checks for prerequisite, corequisite, or antirequisite violations in the student\'s unit history.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_student_elective_options',
    description: 'Returns which elective groups the student has satisfied or still needs.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  // Unit
  {
    id: 'get_unit_details',
    description: 'Returns full details for a unit: name, credits, offerings, requisites.',
    params: [{ name: 'unitCode', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_units_by_semester',
    description: 'Lists all units offered in a given semester.',
    params: [{ name: 'semester', type: 'number', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_units_by_prefix',
    description: 'Lists all units that share a given unit code prefix (e.g. all COS units, all SWE units).',
    params: [{ name: 'prefix', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_units_with_no_prerequisites',
    description: 'Lists all units that have no prerequisite requirements.',
    params: [],
    execute: jest.fn(),
  },
  {
    id: 'get_units_requiring_unit',
    description: 'Finds all units that require a given unit as a prerequisite.',
    params: [{ name: 'unitCode', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'is_unit_offered_this_semester',
    description: 'Checks whether a specific unit is offered in a given semester.',
    params: [
      { name: 'unitCode', type: 'string', required: true, description: '' },
      { name: 'semester', type: 'number', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  // Planner
  {
    id: 'list_planners',
    description: 'Lists all available study planners with basic metadata.',
    params: [],
    execute: jest.fn(),
  },
  {
    id: 'find_planner_by_major',
    description: 'Searches study planners by major name.',
    params: [{ name: 'majorName', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_planner_details',
    description: 'Returns the full unit list for a planner grouped by year and semester.',
    params: [{ name: 'plannerId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_planner_unit_count',
    description: 'Returns the total number of units in a planner broken down by category.',
    params: [{ name: 'plannerId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_planner_score_breakdown',
    description: 'Returns the scoring breakdown of a planner\'s unit categories.',
    params: [{ name: 'plannerId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_planners_by_intake_year',
    description: 'Lists all study planners available for a specific intake year.',
    params: [{ name: 'intakeYear', type: 'number', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_planners_containing_unit',
    description: 'Finds all study planners that include a specific unit.',
    params: [{ name: 'unitCode', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'get_unit_category_in_planner',
    description: 'Checks what category a unit appears as in a given study planner.',
    params: [
      { name: 'plannerId', type: 'string', required: true, description: '' },
      { name: 'unitCode', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'compare_two_planners',
    description: 'Compares two study planners and shows shared and unique units.',
    params: [
      { name: 'plannerId1', type: 'string', required: true, description: '' },
      { name: 'plannerId2', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  // Cross-entity
  {
    id: 'compare_student_to_planner',
    description: 'Maps a student\'s completed units against a planner\'s requirements.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'plannerId', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'get_planner_missing_units',
    description: 'Returns units in a planner that a student has not yet completed.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'plannerId', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'can_student_take_unit',
    description: 'Checks whether a student has met prerequisites to enrol in a specific unit.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'unitCode', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'get_available_units_for_student',
    description: 'Lists all units a student is currently eligible to enrol in.',
    params: [{ name: 'studentId', type: 'string', required: true, description: '' }],
    execute: jest.fn(),
  },
  {
    id: 'is_student_on_track',
    description: 'Determines whether a student is on track to graduate based on a planner.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'plannerId', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'get_student_available_units_from_planner',
    description: 'Shows which units in a study planner a student has not yet completed.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'plannerId', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  {
    id: 'get_plan_switch_impact',
    description: 'Shows the impact of a student switching to a different study planner.',
    params: [
      { name: 'studentId', type: 'string', required: true, description: '' },
      { name: 'newPlannerId', type: 'string', required: true, description: '' },
    ],
    execute: jest.fn(),
  },
  // System
  {
    id: 'get_portal_status',
    description: 'Checks whether the student portal session is currently active and loaded.',
    params: [],
    execute: jest.fn(),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PLANNER_UUID   = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const PLANNER_UUID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

/** Simulate Ollama /api/generate returning a specific workflow ID. */
function mockLLM(workflowId: string): void {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ response: workflowId }),
  });
}

function msg(content: string) {
  return [{ role: 'user' as const, content }];
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
interface TestCase {
  category: string;
  prompt: string;
  expectedWorkflow: string;
  expectedParams: Record<string, unknown>;
  missingParams?: string[];
}

const TEST_CASES: TestCase[] = [
  // ── Student ──────────────────────────────────────────────────────────────
  {
    category: 'Student',
    prompt: 'Find student 102780123',
    expectedWorkflow: 'search_student',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'What major is student 102780123 enrolled in?',
    expectedWorkflow: 'get_student_major',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: "What is student 102780123's CGPA and how many credits have they completed?",
    expectedWorkflow: 'get_student_progress',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'Has student 102780123 met all graduation requirements?',
    expectedWorkflow: 'check_graduation_status',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'Show me all units taken by student 102780123 with their grades',
    expectedWorkflow: 'get_student_units',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'Which units has student 102780123 failed?',
    expectedWorkflow: 'get_student_failed_units',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'Show the enrollment history for student 102780123',
    expectedWorkflow: 'get_student_enrollment_history',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'What grade did student 102780123 get for COS30049?',
    expectedWorkflow: 'get_student_grade_for_unit',
    expectedParams: { studentId: '102780123', unitCode: 'COS30049' },
  },
  {
    category: 'Student',
    prompt: 'Did student 102780123 pass COS20007?',
    expectedWorkflow: 'did_student_pass_unit',
    expectedParams: { studentId: '102780123', unitCode: 'COS20007' },
  },
  {
    category: 'Student',
    prompt: 'Has student 102780123 completed their WIL or internship unit?',
    expectedWorkflow: 'check_student_wil_status',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'Which units has student 102780123 repeated or attempted more than once?',
    expectedWorkflow: 'get_student_repeated_units',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'Does student 102780123 have any prerequisite violations?',
    expectedWorkflow: 'get_student_prerequisite_violations',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Student',
    prompt: 'What elective groups has student 102780123 completed and what do they still need?',
    expectedWorkflow: 'get_student_elective_options',
    expectedParams: { studentId: '102780123' },
  },

  // ── Unit ─────────────────────────────────────────────────────────────────
  {
    category: 'Unit',
    prompt: 'Give me the details for unit COS30049',
    expectedWorkflow: 'get_unit_details',
    expectedParams: { unitCode: 'COS30049' },
  },
  {
    category: 'Unit',
    prompt: 'Which units are offered in Semester 1?',
    expectedWorkflow: 'get_units_by_semester',
    expectedParams: { semester: 1 },
  },
  {
    category: 'Unit',
    prompt: 'List all COS units',
    expectedWorkflow: 'get_units_by_prefix',
    expectedParams: { prefix: 'COS' },
  },
  {
    category: 'Unit',
    prompt: 'What units have no prerequisites?',
    expectedWorkflow: 'get_units_with_no_prerequisites',
    expectedParams: {},
  },
  {
    category: 'Unit',
    prompt: 'Which units require COS10002 as a prerequisite?',
    expectedWorkflow: 'get_units_requiring_unit',
    expectedParams: { unitCode: 'COS10002' },
  },
  {
    category: 'Unit',
    prompt: 'Is COS30049 offered in Semester 2?',
    expectedWorkflow: 'is_unit_offered_this_semester',
    expectedParams: { unitCode: 'COS30049', semester: 2 },
  },

  // ── Planner ───────────────────────────────────────────────────────────────
  {
    category: 'Planner',
    prompt: 'Show me all available study planners',
    expectedWorkflow: 'list_planners',
    expectedParams: {},
  },
  {
    category: 'Planner',
    prompt: "Find a study planner for 'Computer Science'",
    expectedWorkflow: 'find_planner_by_major',
    expectedParams: { majorName: 'Computer Science' },
  },
  {
    category: 'Planner',
    prompt: `What units are in planner ${PLANNER_UUID}?`,
    expectedWorkflow: 'get_planner_details',
    expectedParams: { plannerId: PLANNER_UUID },
  },
  {
    category: 'Planner',
    prompt: `How many units are in planner ${PLANNER_UUID}?`,
    expectedWorkflow: 'get_planner_unit_count',
    expectedParams: { plannerId: PLANNER_UUID },
  },
  {
    category: 'Planner',
    prompt: `Show the score breakdown for planner ${PLANNER_UUID}`,
    expectedWorkflow: 'get_planner_score_breakdown',
    expectedParams: { plannerId: PLANNER_UUID },
  },
  {
    category: 'Planner',
    prompt: 'What programs are available for 2024 intake?',
    expectedWorkflow: 'get_planners_by_intake_year',
    expectedParams: { intakeYear: 2024 },
  },
  {
    category: 'Planner',
    prompt: 'Which programs include COS30049?',
    expectedWorkflow: 'get_planners_containing_unit',
    expectedParams: { unitCode: 'COS30049' },
  },
  {
    category: 'Planner',
    prompt: `Is COS30049 a core or elective unit in planner ${PLANNER_UUID}?`,
    expectedWorkflow: 'get_unit_category_in_planner',
    expectedParams: { plannerId: PLANNER_UUID, unitCode: 'COS30049' },
  },
  {
    category: 'Planner',
    prompt: `What is the difference between planner ${PLANNER_UUID} and planner ${PLANNER_UUID_2}?`,
    expectedWorkflow: 'compare_two_planners',
    expectedParams: { plannerId1: PLANNER_UUID, plannerId2: PLANNER_UUID_2 },
  },

  // ── Cross-entity ──────────────────────────────────────────────────────────
  {
    category: 'Cross-entity',
    prompt: `How does student 102780123 compare against planner ${PLANNER_UUID}?`,
    expectedWorkflow: 'compare_student_to_planner',
    expectedParams: { studentId: '102780123', plannerId: PLANNER_UUID },
  },
  {
    category: 'Cross-entity',
    prompt: `What units in planner ${PLANNER_UUID} has student 102780123 not completed yet?`,
    expectedWorkflow: 'get_planner_missing_units',
    expectedParams: { studentId: '102780123', plannerId: PLANNER_UUID },
  },
  {
    category: 'Cross-entity',
    prompt: 'Can student 102780123 take COS30049 next semester?',
    expectedWorkflow: 'can_student_take_unit',
    expectedParams: { studentId: '102780123', unitCode: 'COS30049' },
  },
  {
    category: 'Cross-entity',
    prompt: 'What units is student 102780123 eligible to enrol in right now?',
    expectedWorkflow: 'get_available_units_for_student',
    expectedParams: { studentId: '102780123' },
  },
  {
    category: 'Cross-entity',
    prompt: `Is student 102780123 on track to graduate based on planner ${PLANNER_UUID}?`,
    expectedWorkflow: 'is_student_on_track',
    expectedParams: { studentId: '102780123', plannerId: PLANNER_UUID },
  },
  {
    category: 'Cross-entity',
    prompt: `What units in planner ${PLANNER_UUID} does student 102780123 still need to complete?`,
    expectedWorkflow: 'get_student_available_units_from_planner',
    expectedParams: { studentId: '102780123', plannerId: PLANNER_UUID },
  },
  {
    category: 'Cross-entity',
    prompt: `If student 102780123 switches to planner ${PLANNER_UUID}, what would change?`,
    expectedWorkflow: 'get_plan_switch_impact',
    expectedParams: { studentId: '102780123', newPlannerId: PLANNER_UUID },
  },

  // ── System ────────────────────────────────────────────────────────────────
  {
    category: 'System',
    prompt: 'Is the student portal connected?',
    expectedWorkflow: 'get_portal_status',
    expectedParams: {},
  },
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
beforeAll(() => {
  global.fetch = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Copilot routing — workflow selection and param extraction', () => {
  const categories = [...new Set(TEST_CASES.map((t) => t.category))];

  for (const category of categories) {
    describe(category, () => {
      const cases = TEST_CASES.filter((t) => t.category === category);

      for (const tc of cases) {
        test(`${tc.expectedWorkflow}: "${tc.prompt}"`, async () => {
          // Arrange — mock LLM to return the expected workflow ID
          mockLLM(tc.expectedWorkflow);

          // Act
          const result = await routeAndExtract(msg(tc.prompt), WORKFLOWS);

          // Assert — routing
          expect(result.canHandle).toBe(true);
          expect(result.workflowId).toBe(tc.expectedWorkflow);

          // Assert — param extraction
          for (const [key, value] of Object.entries(tc.expectedParams)) {
            expect(result.params[key]).toEqual(value);
          }

          // Assert — no required params are missing
          if (!tc.missingParams) {
            expect(result.missingParams).toHaveLength(0);
          } else {
            expect(result.missingParams).toEqual(expect.arrayContaining(tc.missingParams));
          }
        });
      }
    });
  }
});

describe('Copilot routing — unrecognised request', () => {
  test('returns canHandle: false when LLM returns "none"', async () => {
    mockLLM('none');
    const result = await routeAndExtract(msg('What is the weather today?'), WORKFLOWS);
    expect(result.canHandle).toBe(false);
    expect(result.workflowId).toBeNull();
  });

  test('returns canHandle: false when LLM returns an unknown workflow ID', async () => {
    mockLLM('some_unknown_workflow');
    const result = await routeAndExtract(msg('Do something random'), WORKFLOWS);
    expect(result.canHandle).toBe(false);
    expect(result.workflowId).toBeNull();
  });
});
