/**
 * What an advisor really types into the AI Copilot, for every workflow.
 *
 * Written from the advisor's side, not from the workflow's side. An advisor does not know workflow names. They write short,
 * casual questions, use "uni" words ("sem 2", "WIL", "GPA", "sub"), type unit codes in lower case, leave out words, and ask
 * the same thing in different ways. Every workflow has at least four prompts in different styles:
 *   - formal and complete       "Please check whether student 102780123 is eligible to graduate."
 *   - short and casual          "can 102780123 graduate"
 *   - indirect / outcome based  "Is 102780123 done with everything?"
 *   - with the advisor's words  "sem", "sub", "GPA", "internship"
 *
 * `params` are the values that the router must extract from the text. `missing` are the required parameters that the advisor
 * did not give, so the copilot must ask for them. If a prompt here fails, change the router or the workflow description.
 * Do not change the prompt: the advisor will not change the way they write.
 */
export interface PromptCase {
  text: string;
  /** Parameters that routeAndExtract must return for this text. */
  params?: Record<string, unknown>;
  /** Required parameters that the text does not give. */
  missing?: string[];
}

export const PLANNER_A = '3f2b8c1e-9d4a-4e7b-a1c5-6d8e2f0b7a93';
export const PLANNER_B = '7a1d5e90-2c3b-4f68-b9e4-0a8c6d2e1f57';

const S1 = '102780123';
const S2 = '103456789';
const S3 = '104561237';

export const PROMPTS_BY_WORKFLOW: Record<string, PromptCase[]> = {
  // ───────────────────────────── students: lookup and profile ─────────────────────────────
  search_student: [
    { text: `Look up student ${S1}`, params: { studentId: S1 } },
    { text: `find ${S2}`, params: { studentId: S2 } },
    { text: `Can you search for the student with ID ${S3}?`, params: { studentId: S3 } },
    { text: 'I need to find a student, where do I start?', missing: ['studentId'] },
    { text: `who is ${S1}`, params: { studentId: S1 } },
  ],
  get_student_major: [
    { text: `What major is ${S1} in?`, params: { studentId: S1 } },
    { text: `which major does student ${S2} belong to`, params: { studentId: S2 } },
    { text: `What is the detected major for ${S3}?`, params: { studentId: S3 } },
    { text: `what program is ${S1} enrolled in right now`, params: { studentId: S1 } },
    { text: 'What major is this student?', missing: ['studentId'] },
  ],
  get_student_progress: [
    { text: `How is ${S1} doing?`, params: { studentId: S1 } },
    { text: `What is the GPA of ${S2}?`, params: { studentId: S2 } },
    { text: `Show me the academic progress of student ${S3}`, params: { studentId: S3 } },
    { text: `how many credits has ${S1} completed so far`, params: { studentId: S1 } },
    { text: `What is ${S2}'s CGPA and expected graduation date?`, params: { studentId: S2 } },
  ],
  get_student_enrollment_history: [
    { text: `Show the enrollment history of ${S1}`, params: { studentId: S1 } },
    { text: `Has ${S2} transferred from another program?`, params: { studentId: S2 } },
    { text: `What programs has student ${S3} been enrolled in before?`, params: { studentId: S3 } },
    { text: `does ${S1} have more than one enrollment`, params: { studentId: S1 } },
    { text: `Did ${S2} change course at any point?`, params: { studentId: S2 } },
  ],

  // ───────────────────────────── students: units and grades ─────────────────────────────
  get_student_units: [
    { text: `List all units completed by ${S1}`, params: { studentId: S1 } },
    { text: `What subjects has ${S2} taken?`, params: { studentId: S2 } },
    { text: `show me the transcript of ${S3}`, params: { studentId: S3 } },
    { text: `give me all the grades for student ${S1}`, params: { studentId: S1 } },
    { text: `what is the course history of ${S2}`, params: { studentId: S2 } },
  ],
  get_student_failed_units: [
    { text: `Which units has ${S1} failed?`, params: { studentId: S1 } },
    { text: `Did ${S2} fail any subjects?`, params: { studentId: S2 } },
    { text: `what does student ${S3} need to repeat`, params: { studentId: S3 } },
    { text: `show me the poor grades of ${S1}`, params: { studentId: S1 } },
    { text: `Has ${S2} withdrawn from any unit?`, params: { studentId: S2 } },
  ],
  get_student_grade_for_unit: [
    { text: `What grade did ${S1} get in COS10009?`, params: { studentId: S1, unitCode: 'COS10009' } },
    { text: `grade for ${S2} in swe20001`, params: { studentId: S2, unitCode: 'SWE20001' } },
    { text: `How did student ${S3} do in COS20007?`, params: { studentId: S3, unitCode: 'COS20007' } },
    { text: `Has ${S1} taken COS30019 yet, and what was the result?`, params: { studentId: S1, unitCode: 'COS30019' } },
    { text: `what mark does ${S2} have for ICT10001`, params: { studentId: S2, unitCode: 'ICT10001' } },
  ],
  did_student_pass_unit: [
    { text: `Did ${S1} pass COS20007?`, params: { studentId: S1, unitCode: 'COS20007' } },
    { text: `has ${S2} completed swe30003`, params: { studentId: S2, unitCode: 'SWE30003' } },
    { text: `Is COS10009 done for student ${S3}?`, params: { studentId: S3, unitCode: 'COS10009' } },
    { text: `Does ${S1} meet the COS20031 prerequisite already? Did they pass it?`, params: { studentId: S1, unitCode: 'COS20031' } },
    { text: `passed cos10004? student ${S2}`, params: { studentId: S2, unitCode: 'COS10004' } },
  ],
  get_student_repeated_units: [
    { text: `Which units did ${S1} repeat?`, params: { studentId: S1 } },
    { text: `Has ${S2} retaken any subjects?`, params: { studentId: S2 } },
    { text: `how many times has student ${S3} attempted a unit more than once`, params: { studentId: S3 } },
    { text: `show repeated attempts for ${S1}`, params: { studentId: S1 } },
    { text: `any retakes for ${S2}?`, params: { studentId: S2 } },
  ],
  check_student_wil_status: [
    { text: `Has ${S1} completed the work placement?`, params: { studentId: S1 } },
    { text: `did ${S2} do their internship`, params: { studentId: S2 } },
    { text: `What is the WIL status of student ${S3}?`, params: { studentId: S3 } },
    { text: `Has ${S1} finished the industry placement yet?`, params: { studentId: S1 } },
    { text: `wil done for ${S2}?`, params: { studentId: S2 } },
  ],
  get_student_prerequisite_violations: [
    { text: `Does ${S1} have any prerequisite violations?`, params: { studentId: S1 } },
    { text: `Did ${S2} take any units out of order?`, params: { studentId: S2 } },
    { text: `check student ${S3} for rule violations`, params: { studentId: S3 } },
    { text: `are there antirequisite problems in the history of ${S1}`, params: { studentId: S1 } },
    { text: `Did ${S2} enrol in a unit without meeting the prerequisite?`, params: { studentId: S2 } },
  ],

  // ───────────────────────────── students: eligibility and what comes next ─────────────────────────────
  can_student_take_unit: [
    { text: `Can ${S1} take COS30019 next semester?`, params: { studentId: S1, unitCode: 'COS30019' } },
    { text: `is ${S2} allowed to enrol in swe30003`, params: { studentId: S2, unitCode: 'SWE30003' } },
    { text: `Has student ${S3} met the requirements for COS20007?`, params: { studentId: S3, unitCode: 'COS20007' } },
    { text: `can they take COS30019?`, params: { unitCode: 'COS30019' }, missing: ['studentId'] },
    { text: `Is ${S1} eligible for ICT30005 or are they missing a prerequisite?`, params: { studentId: S1, unitCode: 'ICT30005' } },
  ],
  get_available_units_for_student: [
    { text: `Which units can ${S1} take now?`, params: { studentId: S1 } },
    { text: `what can student ${S2} enrol in`, params: { studentId: S2 } },
    { text: `What are the options for ${S3} next semester?`, params: { studentId: S3 } },
    { text: `which units are open to ${S1} based on what they passed`, params: { studentId: S1 } },
    { text: `Show me the units ${S2} is eligible for`, params: { studentId: S2 } },
  ],
  get_student_elective_options: [
    { text: `What electives can ${S1} still choose?`, params: { studentId: S1 }, missing: ['plannerId'] },
    { text: `which electives are left for student ${S2}`, params: { studentId: S2 }, missing: ['plannerId'] },
    { text: `Show the free elective options for ${S3}`, params: { studentId: S3 }, missing: ['plannerId'] },
    { text: `what elective units is ${S1} eligible to pick`, params: { studentId: S1 }, missing: ['plannerId'] },
    { text: `${S2} still needs electives, what are the choices?`, params: { studentId: S2 }, missing: ['plannerId'] },
  ],
  check_graduation_status: [
    { text: `Can ${S1} graduate?`, params: { studentId: S1 } },
    { text: `Is student ${S2} eligible to graduate this year?`, params: { studentId: S2 } },
    { text: `what does ${S3} still need before graduating`, params: { studentId: S3 } },
    { text: `graduation check for ${S1}`, params: { studentId: S1 } },
    { text: `Has ${S2} met all the requirements for the degree?`, params: { studentId: S2 } },
  ],
  is_student_on_track: [
    { text: `Is ${S1} on track to graduate on time?`, params: { studentId: S1 }, missing: ['plannerId'] },
    { text: `Is student ${S2} behind in their studies?`, params: { studentId: S2 }, missing: ['plannerId'] },
    { text: `is ${S3} ahead or behind schedule`, params: { studentId: S3 }, missing: ['plannerId'] },
    { text: `Is ${S1} keeping up with the planner ${PLANNER_A}?`, params: { studentId: S1, plannerId: PLANNER_A } },
    { text: `are they on track?`, missing: ['studentId', 'plannerId'] },
  ],

  // ───────────────────────────── students against a planner ─────────────────────────────
  compare_student_to_planner: [
    { text: `Compare ${S1} to planner ${PLANNER_A}`, params: { studentId: S1, plannerId: PLANNER_A } },
    { text: `How is student ${S2} tracking against the study plan ${PLANNER_A}?`, params: { studentId: S2, plannerId: PLANNER_A } },
    { text: `show which units ${S3} has done and not done in planner ${PLANNER_B}`, params: { studentId: S3, plannerId: PLANNER_B } },
    { text: `Compare student ${S1} to the Data Science planner`, params: { studentId: S1 }, missing: ['plannerId'] },
    { text: `what is outstanding for ${S2} in ${PLANNER_A}`, params: { studentId: S2, plannerId: PLANNER_A } },
  ],
  get_student_available_units_from_planner: [
    { text: `What units does student ${S1} still need to finish in planner ${PLANNER_A}?`, params: { studentId: S1, plannerId: PLANNER_A } },
    { text: `how many units are left for ${S2} in ${PLANNER_B}`, params: { studentId: S2, plannerId: PLANNER_B } },
    { text: `Which planner units has ${S3} not completed yet? Planner ${PLANNER_A}`, params: { studentId: S3, plannerId: PLANNER_A } },
    { text: `remaining units for ${S1} in their plan`, params: { studentId: S1 }, missing: ['plannerId'] },
    { text: `What does ${S2} have left to finish from plan ${PLANNER_A}?`, params: { studentId: S2, plannerId: PLANNER_A } },
  ],
  get_planner_missing_units: [
    { text: `Which units is ${S1} missing from planner ${PLANNER_A}?`, params: { studentId: S1, plannerId: PLANNER_A } },
    { text: `what is missing for student ${S2} in ${PLANNER_B}`, params: { studentId: S2, plannerId: PLANNER_B } },
    { text: `list the units ${S3} has not taken from ${PLANNER_A}`, params: { studentId: S3, plannerId: PLANNER_A } },
    { text: `What is ${S1} missing from the Cybersecurity planner?`, params: { studentId: S1 }, missing: ['plannerId'] },
    { text: `show me what ${S2} still lacks in plan ${PLANNER_A}`, params: { studentId: S2, plannerId: PLANNER_A } },
  ],
  get_planner_score_breakdown: [
    { text: `Show the score breakdown for ${S1} against planner ${PLANNER_A}`, params: { studentId: S1, plannerId: PLANNER_A } },
    { text: `how well does ${S2} match ${PLANNER_B}`, params: { studentId: S2, plannerId: PLANNER_B } },
    { text: `What is the match percentage of student ${S3} for planner ${PLANNER_A}?`, params: { studentId: S3, plannerId: PLANNER_A } },
    { text: `why did ${S1} get that major score? planner ${PLANNER_A}`, params: { studentId: S1, plannerId: PLANNER_A } },
    { text: `core match and major core score for ${S2} in ${PLANNER_B}`, params: { studentId: S2, plannerId: PLANNER_B } },
  ],
  get_plan_switch_impact: [
    { text: `What happens if ${S1} switches to planner ${PLANNER_B}?`, params: { studentId: S1, newPlannerId: PLANNER_B } },
    { text: `if student ${S2} changes major to ${PLANNER_A}, what counts?`, params: { studentId: S2, newPlannerId: PLANNER_A } },
    { text: `Which of ${S3}'s completed units would carry over if they move to ${PLANNER_B}?`, params: { studentId: S3, newPlannerId: PLANNER_B } },
    { text: `what is the impact of ${S1} changing program`, params: { studentId: S1 }, missing: ['newPlannerId'] },
    { text: `Would any of ${S2}'s units become excess if they switch to ${PLANNER_A}?`, params: { studentId: S2, newPlannerId: PLANNER_A } },
  ],

  // ───────────────────────────── planners ─────────────────────────────
  list_planners: [
    { text: 'Which planners are available?' },
    { text: 'list all study planners' },
    { text: 'What majors do we offer?' },
    { text: 'show me every program in the system' },
    { text: 'what study plans exist' },
  ],
  find_planner_by_major: [
    { text: 'Find the planner for Data Science', params: { majorName: 'Data Science' } },
    { text: 'is there a planner for "Cybersecurity"', params: { majorName: 'Cybersecurity' } },
    { text: 'What is the planner ID for the Software Development major?' },
    { text: 'I need the planner for artificial intelligence, 2025 intake', params: { intakeYear: 2025 } },
    { text: 'where can I find the plan for the Internet of Things major' },
  ],
  get_planner_details: [
    { text: `Show the details of planner ${PLANNER_A}`, params: { plannerId: PLANNER_A } },
    { text: `what units are in ${PLANNER_B}`, params: { plannerId: PLANNER_B } },
    { text: `Give me the full structure of the study plan ${PLANNER_A}`, params: { plannerId: PLANNER_A } },
    { text: `what does year 2 look like in planner ${PLANNER_A}`, params: { plannerId: PLANNER_A } },
    { text: 'show me the Data Science planner', missing: ['plannerId'] },
  ],
  get_planner_unit_count: [
    { text: `How many units are in planner ${PLANNER_A}?`, params: { plannerId: PLANNER_A } },
    { text: `how many core units does ${PLANNER_B} have`, params: { plannerId: PLANNER_B } },
    { text: `Count the electives in the study plan ${PLANNER_A}`, params: { plannerId: PLANNER_A } },
    { text: `unit count by category for ${PLANNER_A}`, params: { plannerId: PLANNER_A } },
    { text: 'how many units does the Cybersecurity program have?', missing: ['plannerId'] },
  ],
  compare_two_planners: [
    { text: `Compare planner ${PLANNER_A} and planner ${PLANNER_B}`, params: { plannerId1: PLANNER_A, plannerId2: PLANNER_B } },
    { text: `what is the difference between ${PLANNER_A} and ${PLANNER_B}`, params: { plannerId1: PLANNER_A, plannerId2: PLANNER_B } },
    { text: `Which units do the two majors ${PLANNER_A} and ${PLANNER_B} share?`, params: { plannerId1: PLANNER_A, plannerId2: PLANNER_B } },
    { text: 'how similar are the Data Science and Cybersecurity plans', missing: ['plannerId1', 'plannerId2'] },
    { text: `unique units in ${PLANNER_A} versus ${PLANNER_B}`, params: { plannerId1: PLANNER_A, plannerId2: PLANNER_B } },
  ],
  get_planners_by_intake_year: [
    { text: 'Which planners are there for the 2025 intake?', params: { intakeYear: 2025 } },
    { text: 'what majors are available for 2024', params: { intakeYear: 2024 } },
    { text: 'How many planners exist for the 2023 intake?', params: { intakeYear: 2023 } },
    { text: 'show me the 2026 study plans', params: { intakeYear: 2026 } },
    { text: 'list programs for students who started in 2022', params: { intakeYear: 2022 } },
  ],
  get_planners_containing_unit: [
    { text: 'Which planners contain COS20007?', params: { unitCode: 'COS20007' } },
    { text: 'which majors include swe30003', params: { unitCode: 'SWE30003' } },
    { text: 'Which programs require COS10009?', params: { unitCode: 'COS10009' } },
    { text: 'is COS30019 part of any study plan, and as what category?', params: { unitCode: 'COS30019' } },
    { text: 'where is ict10001 used', params: { unitCode: 'ICT10001' } },
  ],
  get_unit_category_in_planner: [
    { text: `Is COS30019 a core or an elective unit in planner ${PLANNER_A}?`, params: { unitCode: 'COS30019', plannerId: PLANNER_A } },
    { text: `when is swe30003 scheduled in ${PLANNER_B}`, params: { unitCode: 'SWE30003', plannerId: PLANNER_B } },
    { text: `What category is COS20007 in the study plan ${PLANNER_A}?`, params: { unitCode: 'COS20007', plannerId: PLANNER_A } },
    { text: `which year and semester is COS10009 in for planner ${PLANNER_A}`, params: { unitCode: 'COS10009', plannerId: PLANNER_A } },
    { text: 'is COS30019 core in the AI major?', params: { unitCode: 'COS30019' }, missing: ['plannerId'] },
  ],

  // ───────────────────────────── units ─────────────────────────────
  get_unit_details: [
    { text: 'Tell me about the unit COS10009', params: { unitCode: 'COS10009' } },
    { text: 'what are the prerequisites of swe30003', params: { unitCode: 'SWE30003' } },
    { text: 'What does COS20007 teach, and which semesters does it run?', params: { unitCode: 'COS20007' } },
    { text: 'unit info for cos30019', params: { unitCode: 'COS30019' } },
    { text: 'what is ICT10001 called', params: { unitCode: 'ICT10001' } },
  ],
  get_units_by_prefix: [
    { text: 'List all COS units', params: { prefix: 'COS' } },
    { text: 'show me the SWE subjects', params: { prefix: 'SWE' } },
    { text: 'What MPU units do we have?', params: { prefix: 'MPU' } },
    { text: 'show me the swe units', params: { prefix: 'SWE' } },
    { text: 'Which units start with ICT?', params: { prefix: 'ICT' } },
  ],
  get_units_by_semester: [
    { text: 'Which units run in semester 2?', params: { semester: 2 } },
    { text: 'what is offered in semester one', params: { semester: 1 } },
    { text: 'List the units for the 1st semester', params: { semester: 1 } },
    { text: 'what units run in sem 2', params: { semester: 2 } },
    { text: 'Which units are offered in the summer term?', params: { semester: 3 } },
  ],
  get_units_requiring_unit: [
    { text: 'Which units require COS10009 as a prerequisite?', params: { unitCode: 'COS10009' } },
    { text: 'what does cos20007 unlock', params: { unitCode: 'COS20007' } },
    { text: 'What can a student take after completing SWE20001?', params: { unitCode: 'SWE20001' } },
    { text: 'which units depend on COS10004', params: { unitCode: 'COS10004' } },
    { text: 'what units list ICT10001 as a prerequisite', params: { unitCode: 'ICT10001' } },
  ],
  get_units_with_no_prerequisites: [
    { text: 'Which units have no prerequisites?' },
    { text: 'What can a first-year student take?' },
    { text: 'units that are open to everyone' },
    { text: 'which subjects can I enrol in without any prerequisite' },
    { text: 'list the units with no prereqs' },
  ],
  is_unit_offered_this_semester: [
    { text: 'Is COS20007 offered this semester?', params: { unitCode: 'COS20007' } },
    { text: 'does swe30003 run in semester 2', params: { unitCode: 'SWE30003', semester: 2 } },
    { text: 'Is COS30019 available in semester 1?', params: { unitCode: 'COS30019', semester: 1 } },
    { text: 'can students take COS10009 in the 2nd semester', params: { unitCode: 'COS10009', semester: 2 } },
    { text: 'is ict10001 running next sem', params: { unitCode: 'ICT10001' } },
  ],

  // ───────────────────────────── system ─────────────────────────────
  get_portal_status: [
    { text: 'Am I connected to the portal?' },
    { text: 'is the system ready' },
    { text: 'Is the AI service running, and am I logged in?' },
    { text: 'how many students are loaded' },
    { text: 'what is the current status' },
  ],
};

/** Requests that no workflow can answer. A small model must answer "none" and must not guess a workflow. */
export const OUT_OF_SCOPE_PROMPTS = [
  'What is the weather like today?',
  'Write me a poem about semester break',
  'Tell me a joke',
  'What is the capital of France?',
  'Book a meeting room for tomorrow',
  'Email the student about their results',
  'Delete the Data Science planner',
  'Change the grade of 102780123 in COS10009 to HD',
  'How do I cook nasi lemak?',
  'What is the meaning of life?',
];
