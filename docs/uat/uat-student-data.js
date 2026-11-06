// The single source of the UAT plan for the student website. `npm run docs:uat` builds docs/UAT-student.md (the plan) and
// docs/UAT-student-form.html (the form the testers fill in) from this file. Edit this file, never the two outputs.
// The plan for the desktop app is docs/uat/uat-data.js.
//
// This plan is short on purpose. It covers what students use: the planners, the units, the Plan Builder and the Help page.
// The CMS, and the use of the website on a phone and with a keyboard only, are not part of it.
//
// A case has: id, title, req (requirement ids), priority ("Must", "Agreed" or "Supporting"), steps, expected.
//   Must   = a job that the website must do, or a rule that keeps data safe. Each one must pass.
//   Agreed = useful and agreed with the client. Each is tested and reported, and the client decides on a failure.

const SOURCE = { team: 'Team proposal, client agreed (R11 of the main UAT plan)' };

const requirements = [
  { id: 'S1', source: SOURCE.team, priority: 'Must', text: 'Browse the study planners by course, major and intake year, and read the full plan, semester by semester.' },
  { id: 'S2', source: SOURCE.team, priority: 'Must', text: 'Look up a unit: its details, its requisites and when it runs, and open its official page on the university website.' },
  { id: 'S3', source: SOURCE.team, priority: 'Must', text: 'Build a personal study plan from a planner and the units already completed, and the plan follows the unit rules.' },
  { id: 'S4', source: SOURCE.team, priority: 'Must', text: 'Find help without an advisor: the frequently asked questions, the contact details and the Heads of Department.' },
  { id: 'S5', source: SOURCE.team, priority: 'Must', text: 'What a student enters stays private: the website does not store it.' },
];

const modules = [
  {
    id: 'M1', session: 'A', name: 'Study planners', cases: [
      { id: 'SC-01', title: 'Find a planner', req: ['S1'], priority: 'Must',
        steps: ['Open the home page (Study Planners). Read the number of planners.', 'Type the name of a major in the search box, then clear it with the X button. Type some letters that no planner has.', 'Select one course, one major and one intake year, one group at a time. In each group, select All.'],
        expected: 'The page lists the planners as cards with the course code, the major, the intake, the length and the number of units. The number above the cards says how many are shown. The search and the three filters narrow the list and work together, and All removes only its own filter. Letters with no match show "No planners found" and no error.' },
      { id: 'SC-02', title: 'Read a planner, semester by semester', req: ['S1'], priority: 'Must',
        steps: ['Open the planner of the data pack (the card links to it).', 'Read the top of the page and the first two tables.', 'Select a unit code in a table.'],
        expected: 'The top shows the course, the major and the intake. Each table has one heading with the year and the semester and its month, such as "Year 1 Semester 1 - Mar 2026". The units have colours by type, and a legend with the totals is on the right. The prerequisites show beside each unit. The unit code opens the page of that unit.' },
    ],
  },
  {
    id: 'M2', session: 'A', name: 'Units', cases: [
      { id: 'SC-03', title: 'Search and filter the units', req: ['S2'], priority: 'Must',
        steps: ['Open Units. Search by a unit code. Then by a word of a unit name.', 'Choose a year level. Then clear the search.', 'Go to the next page of the list and back.'],
        expected: 'The search finds the units by code and by name. The year level narrows the list. The pages of the list work. A search with no match shows "No units found".' },
      { id: 'SC-04', title: 'Read the details of a unit', req: ['S2'], priority: 'Must',
        steps: ['Open the unit with full details of the data pack.', 'Read the sidebar and every section of the page.'],
        expected: 'The page shows the name, the code, the credit points, the year level and when the unit runs. The sidebar lists the prerequisite, the co-requisite and the anti-requisite. The page shows the overview, the learning outcomes, the content and the assessment table with the weights.' },
      { id: 'SC-05', title: 'Open the official unit page', req: ['S2'], priority: 'Must',
        steps: ['On the unit with full details, select "View on the university website".', 'Go back to the website tab. Open the MPU unit of the data pack.'],
        expected: 'The official page of that unit opens in a new tab on the university website, and the student website stays open in its own tab. The MPU unit has no such button, because the university site has no page of its own for it.' },
      { id: 'SC-06', title: 'A unit without details, and a wrong address', req: ['S2'], priority: 'Must',
        steps: ['Open the unit without details of the data pack.', 'In the address bar, change the end of the address to a unit code that does not exist.'],
        expected: 'The unit page says that details are not available, and still shows the code, the credit points and the requisites. It does not crash. The wrong address shows "Page not found" with links back to the main pages.' },
    ],
  },
  {
    id: 'M3', session: 'A', name: 'Plan builder', cases: [
      { id: 'SC-07', title: 'Build a plan from the start', req: ['S3'], priority: 'Must',
        steps: ['Open Plan Builder. Read the hint beside the Generate button.', 'Choose the course, the major and the intake of Student X (data pack), and select Generate Study Plan.', 'Write down the number beside Remaining in the summary.'],
        expected: 'Before a major is chosen, the page says to select a course and a major. After Generate, a plan shows for every semester of the course, with the units and their prerequisites. The summary shows the intake, the course, the major, Completed 0 and the number Remaining. A note tells the student to check with an advisor.' },
      { id: 'SC-08', title: 'Add the completed units', req: ['S3'], priority: 'Must',
        steps: ['Under Units Completed, select "+ Add unit" in Semester 1 and add the five completed units of Student X, one at a time. After each one, open the search list again.', 'Select Generate Study Plan.', 'Change the intake year.'],
        expected: 'A unit that was added is not offered in the search list again, so it cannot be added twice. The page says "5 units marked as completed". The summary shows Completed 5 units, and Remaining is 5 fewer than the number from SC-07. The five units show as completed in the plan. The change of the intake year removes the old plan, so the screen never shows a plan that does not match the choices.' },
      { id: 'SC-09', title: 'The plan follows the rules', req: ['S3'], priority: 'Must',
        steps: ['Generate the plan of SC-08 again. Check that each unit comes after its prerequisites.', 'Check that no semester has more units than the planner has for a normal semester.', 'Read the notices above the plan.'],
        expected: 'No unit comes before its prerequisite and no semester is over the normal load. A unit that runs only in summer or winter is not put in a normal semester, and a notice names it (for the planner of the data pack, MPU3212 and ICT20016).' },
      { id: 'SC-10', title: 'What the student enters is not stored', req: ['S5'], priority: 'Must',
        steps: ['Add completed units and generate a plan. Refresh the page.', 'Open the website in a private window, or another browser.', 'Close the tab and open the website again.', '(Facilitator) After the session, list the tables of the staging database.'],
        expected: 'After a refresh in the same tab the entries are still there, because the tab keeps them. In the other window and after the tab is closed, the builder is empty. The database has no table for students, transcripts or plans of students. It holds only planners, units, help content and CMS accounts.' },
    ],
  },
  {
    id: 'M4', session: 'A', name: 'Help page', cases: [
      { id: 'SC-11', title: 'Find help, and the right Head of Department', req: ['S4'], priority: 'Must',
        steps: ['Open Help. Select three questions, one after the other. Read the contact details.', 'Select the Heads of Department card. Find the head of the tester\'s own department.', 'Select the link back to Help.'],
        expected: 'Each question opens its answer, and selecting it again closes it. The contact block shows the venue, the hours and the phone and email addresses. The Heads of Department page lists the heads by faculty and department, with the name, the position and an email address that opens a new email. The link back shows the Help page.' },
    ],
  },
];

const dataPack = [
  { item: 'Staging student website', use: 'The address of the staging copy (never the production site). The tests only read the website. They change no content.' },
  { item: 'Planner of the data pack', use: 'Bachelor of Computer Science, Data Science, March 2026 intake. It has the units used in SC-02, SC-07 and SC-08.' },
  { item: 'Student X', use: 'A made-up student of that planner. Completed in Semester 1: COS10009, COS10026, COS10025, COS10003 and MPU3272. No real student record is used.' },
  { item: 'Units of the data pack', use: 'COS10009 has full details and an official page. MPU3212 is an MPU unit, so it has no official button. SWE40001 has no details. For SC-06 also make up a code that does not exist, such as XYZ99999.' },
  { item: 'Browsers', use: 'Two browsers, or one browser and a private window, for SC-10.' },
];

const sessionNames = {
  A: 'The student website: planners, units, plan builder and help',
};

const meta = {
  title: 'Student Website',
  purpose: 'Students ask advisors the same basic questions again and again: which planner fits them, what a unit is, what is left to study, and who to contact. The student website answers these questions without an advisor. This session checks that it does, one test for each requirement. The testers are students. The team watches, records and does not help. Not part of this session: the CMS for staff, and the use of the website on a phone and with a keyboard only.',
  legend: '**Must** = a job that the website must do, or a rule that keeps data safe. Every test here is a Must test, and all must pass.',
  legendHtml: '<strong>Must</strong>: a job that the website must do, or a rule that keeps data safe. Every test here is a Must test, and all must pass.',
  requirementsHeading: 'What the website must do',
  headerIntro: 'Do each test case, mark the result, and write what you saw. Your answers are saved in this browser while you work. Do not write real student IDs, names or grades.',
  roleExample: 'Student',
  versionLabel: 'Website address and date (staging)', versionExample: 'For example the staging address and the date',
  deviceLabel: 'Device and browser', deviceExample: 'For example iPhone, Safari, or MacBook, Chrome',
  solvesLabel: 'Could you find what you needed on the website without asking an advisor? What was still missing?',
  severityHtml: 'Critical: student data stored or shown to the wrong person, or a page that stops. Major: a requirement does not work and there is no workaround. Minor: awkward, or there is a workaround. Cosmetic: the look only.',
  signoff: ['Student tester', 'Student tester', 'Client contact'],
  storageKey: 'study-planner-student-uat-form-v2',
  howItRuns: ({ cases, sessionCases, hours, sessionNames: names }) => [
    '- **Who:** at least 3 students from different years, one team member who runs the session, one who takes notes.',
    `- **How long:** ${cases.length} tests (all Must) in one session of about ${hours(sessionCases(Object.keys(names)[0]).length * 5 + 10)} hours.`,
    '- **Where:** the staging copy of the website, never the production site. A student uses their own phone or computer.',
    '- **Method:** the facilitator reads each task. The tester does it and marks Pass, Fail, Blocked or N/A, with a note. The facilitator does not show how. Do not fix anything during the session.',
    '- **Acceptance rule:** the client accepts the website when **all tests pass and no Critical or Major defect is open**.',
    '- **Severity:** Critical = student data stored or shown to the wrong person, or a page that stops. Major = a requirement does not work and there is no workaround. Minor = awkward, or there is a workaround. Cosmetic = the look only.',
    '- **Before the session:** `npm run verify:full` passes on the build, the staging site has the seed data (`npm run db:seed`), the data pack is ready, and the team did one dry run. The dry run confirms the expected results below, which were written from the code and the pages.',
  ],
};

module.exports = { requirements, modules, dataPack, SOURCE, sessionNames, meta };
