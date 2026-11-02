// The single source of the UAT plan. `npm run docs:uat` builds docs/UAT.md (the plan) and docs/UAT-form.html (the form the
// testers fill in) from this file. Edit this file, never the two outputs.
//
// A case has: id, title, req (requirement ids), priority ("Must", "Agreed" or "Supporting"), steps, expected.
//   Must   = the client asked for it (the original brief or a later change request). Each one must pass.
//   Agreed = the team proposed it and the client agreed. Each is tested and reported.
//   Supporting = not in the brief. It is tested and reported but does not decide the acceptance.

const SOURCE = { brief: 'Client (original brief)', change: 'Client (later change request)', team: 'Team proposal, client agreed' };

const requirements = [
  { id: 'R1', source: SOURCE.brief, priority: 'Must', text: 'Match a student\'s DPA results to the study planners, to infer the course, the major and the progression in the course.' },
  { id: 'R2', source: SOURCE.brief, priority: 'Must', text: 'Import a student\'s data from the university portal (by API requests), for one student at a time, on demand.' },
  { id: 'R3', source: SOURCE.brief, priority: 'Must', text: 'Enter a student\'s data by hand when the portal is not available (manual fallback).' },
  { id: 'R4', source: SOURCE.brief, priority: 'Must', text: 'Import and read official study planner PDFs with a local text-extraction pipeline.' },
  { id: 'R5', source: SOURCE.brief, priority: 'Must', text: 'Export the analysis results to Excel.' },
  { id: 'R6', source: SOURCE.brief, priority: 'Must', text: 'Student data stays transient: only in memory during the session, never stored by the app.' },
  { id: 'R7', source: SOURCE.brief, priority: 'Must', text: 'Show the graduation status and whether the prerequisites of each unit are met (the problem statement).' },
  { id: 'R8', source: SOURCE.change, priority: 'Must', text: 'Class estimation: estimate how many students take a unit next semester.' },
  { id: 'R9', source: SOURCE.change, priority: 'Must', text: 'Student pathway generator: the best pathway that lets the student graduate under the matched planner.' },
  { id: 'R10', source: SOURCE.team, priority: 'Agreed', text: 'AI Copilot: ask questions in plain English instead of using the screens and buttons.' },
  { id: 'R11', source: SOURCE.team, priority: 'Agreed', text: 'Student-facing web app (with its CMS), so that advisors do not answer the basic questions.' },
];

const modules = [
  {
    id: 'M1', session: 'A', name: 'Start-up and privacy notice', cases: [
      { id: 'TC-01', title: 'The privacy notice shows on the first start', req: ['R6'], priority: 'Must',
        steps: ['Start the app for the first time.', 'Read the notice. Switch between English and BM.', 'Try to select I Acknowledge before scrolling, then scroll to the end and select it.'],
        expected: 'The notice shows before anything else and says that student data is not stored. It changes language each time. The button works only after the tester scrolls to the end. The app then opens on Major Detection.' },
      { id: 'TC-02', title: 'The acknowledgement is remembered', req: ['R6'], priority: 'Must',
        steps: ['Close the app.', 'Open it again.'],
        expected: 'The notice does not show again.' },
    ],
  },
  {
    id: 'M2', session: 'A', name: 'Get a student into the app', cases: [
      { id: 'TC-03', title: 'Import one student from the portal', req: ['R2'], priority: 'Must',
        steps: ['Select Log in to Portal and sign in with the tester\'s own account.', 'Type the ID of Student A and select Load.'],
        expected: 'Only that student loads, when asked. The summary, the ranked planners and the result tabs show.' },
      { id: 'TC-04', title: 'The portal cannot find the student, or is not logged in', req: ['R2', 'R3'], priority: 'Must',
        steps: ['Look up an ID that does not exist.', 'Log out of the portal and look up a student again.'],
        expected: 'The app says that it found no student, and later tells the tester to log in or to use Import. It does not crash and does not show an empty or wrong result.' },
      { id: 'TC-05', title: 'Enter a student from an Excel file (manual fallback)', req: ['R3'], priority: 'Must',
        steps: ['Select Import, then Upload Excel.', 'Choose the transcript file of the data pack, enter the intake and select Load.', 'Repeat with the file that has a missing column.'],
        expected: 'The student loads and the match runs, with the same result as for a portal student. The bad file gives a clear message and loads nothing.' },
      { id: 'TC-06', title: 'Enter a student by typing units or pasting rows', req: ['R3'], priority: 'Must',
        steps: ['Select Import, then Add Units. Add five units with their grades and terms. Select Load.', 'Clear the student. Select Paste Table, paste the rows of the data pack and select Load.'],
        expected: 'Both ways load the student. A unit cannot be added twice.' },
    ],
  },
  {
    id: 'M3', session: 'A', name: 'Major matching and progress', cases: [
      { id: 'TC-07', title: 'The best planners are ranked', req: ['R1'], priority: 'Must',
        steps: ['Load Student A.', 'Read the three ranked planners and their percentages.'],
        expected: 'Number 1 is the course and the major that the Head of Department expects. Each planner shows a percentage.' },
      { id: 'TC-08', title: 'The match agrees with the Head of Department (5 students)', req: ['R1'], priority: 'Must',
        steps: ['Write down the course and the major that the Head of Department expects for Students A to E.', 'Load each student and read the best match.'],
        expected: 'At least 4 of the 5 matches are the same. The Head of Department accepts the reason for any difference.' },
      { id: 'TC-09', title: 'Other planners and a first-year student', req: ['R1'], priority: 'Must',
        steps: ['For Student A, select number 2, then Match against a different planner and choose a planner of another intake.', 'Load Student F (first year).'],
        expected: 'The tabs follow the planner that was chosen. For the first-year student, the page says that no major is detected, lists the closest planners and does not name a wrong major.' },
      { id: 'TC-10', title: 'The progress in the course is correct', req: ['R1', 'R7'], priority: 'Must',
        steps: ['Open the Analytics and Unit Plan tabs for Student A.', 'Check the credits, the units still to do, and the grade of three units against the transcript.'],
        expected: 'The credits, the units to do and the statuses are the same as the transcript.' },
    ],
  },
  {
    id: 'M4', session: 'A', name: 'Graduation status and prerequisites', cases: [
      { id: 'TC-11', title: 'Graduation verdicts with reasons', req: ['R7'], priority: 'Must',
        steps: ['Open the Graduation tab for Student H (can graduate).', 'Open it for Student A (cannot graduate).'],
        expected: 'H shows ELIGIBLE with no reason. A shows INELIGIBLE, with each reason and the missing units. The Head of Department agrees with both.' },
      { id: 'TC-12', title: 'A failed unit, a unit in progress and Conceded Passes', req: ['R7'], priority: 'Must',
        steps: ['Open the Graduation tab for Student I (failed core unit), Student J (unit in progress) and Student K (two Conceded Passes).'],
        expected: 'Each is INELIGIBLE with the right reason: the failed unit is not passed, the unit in progress counts as not passed, and only one Conceded Pass is allowed.' },
      { id: 'TC-13', title: 'Prerequisites are checked', req: ['R7'], priority: 'Must',
        steps: ['In the Unit Plan of Student A, find a unit whose prerequisite the student did not pass.'],
        expected: 'The prerequisite shows as not met, and the Head of Department agrees that the student cannot take the unit yet.' },
    ],
  },
  {
    id: 'M5', session: 'A', name: 'Study planner PDF import', cases: [
      { id: 'TC-14', title: 'Import an official planner PDF and use it', req: ['R4'], priority: 'Must',
        steps: ['On Study Planners, select Import and drop the planner PDF of the data pack.', 'Compare the units that the app read with the PDF. Correct one unit and select Save to Study Planners.', 'Load a student who fits this planner.'],
        expected: 'The app reads the PDF on this computer. The planner saves with the correction, shows in the list and ranks for the student.' },
      { id: 'TC-15', title: 'A file that is not a planner is refused', req: ['R4'], priority: 'Must',
        steps: ['Select Import on Study Planners and drop a PDF that is not a study planner.'],
        expected: 'The app says that it cannot read a planner from the file, and saves nothing.' },
    ],
  },
  {
    id: 'M6', session: 'B', name: 'Student pathway generator', cases: [
      { id: 'TC-16', title: 'Generate a pathway', req: ['R9'], priority: 'Must',
        steps: ['Load Student A and choose the best planner.', 'Open Student Pathway and select Generate Custom Pathway.'],
        expected: 'A plan appears for every semester that remains and ends with the student able to graduate under the chosen planner.' },
      { id: 'TC-17', title: 'The pathway follows the rules and is the fastest', req: ['R9', 'R7'], priority: 'Must',
        steps: ['Check that each unit comes after its prerequisites and runs in its semester, and that no semester is over the normal load.', 'Write down the least number of semesters that the Head of Department expects for Students A and L. Compare.'],
        expected: 'No rule is broken. A failed unit is planned again. The number of semesters is the same as expected, or the Head of Department accepts the reason.' },
      { id: 'TC-18', title: 'Edit the plan by hand', req: ['R9'], priority: 'Must',
        steps: ['Move a unit before its prerequisite, swap an elective, add a unit and a semester, and remove a unit.'],
        expected: 'Each edit works. The move that breaks a rule shows a warning.' },
      { id: 'TC-19', title: 'Download the plan as PDF and Excel', req: ['R9', 'R5'], priority: 'Must',
        steps: ['Select Download PDF and Download Excel. Open both.', 'Clear the student and use Import plan on the Excel file.'],
        expected: 'Both files show the same plan as the screen. The Excel file imports again and can be edited.' },
    ],
  },
  {
    id: 'M7', session: 'B', name: 'Export to Excel', cases: [
      { id: 'TC-20', title: 'Export the analysis to Excel', req: ['R5'], priority: 'Must',
        steps: ['Load Student A, select Export and save the file.', 'Open it in Excel and compare it with the screen.'],
        expected: 'The .xlsx file opens with no error. The first sheet is Report Info. The match, the credits, the graduation verdict and the missing units are the same as on the screen.' },
      { id: 'TC-21', title: 'Export only the chosen sections', req: ['R5', 'R6'], priority: 'Must',
        steps: ['Select Export, untick all sections but one, save and open the file.'],
        expected: 'The file holds Report Info and only the chosen section, and only the data of that student.' },
    ],
  },
  {
    id: 'M8', session: 'B', name: 'Class estimation (Head of Department)', cases: [
      { id: 'TC-22', title: 'Load the students and run the estimate', req: ['R8', 'R2'], priority: 'Must',
        steps: ['Open Class Estimation and choose Portal. Enter the student ID range of the data pack and select Read transcripts.', 'Enter the returning percentage and the number of new students. Run the estimate.'],
        expected: 'The page shows the number of students it read, and then the expected number of students for each unit of next semester. It does not save the student records.' },
      { id: 'TC-23', title: 'The estimate is reasonable', req: ['R8'], priority: 'Must',
        steps: ['Pick three units whose numbers the Head of Department knows well.', 'Compare the estimate. Then lower the returning percentage and run it again.'],
        expected: 'The Head of Department says that the three numbers are reasonable for planning classes, or explains the difference. After the change, the numbers go down.' },
      { id: 'TC-24', title: 'Save, view and download the estimate', req: ['R8', 'R5'], priority: 'Must',
        steps: ['Type a label and save the estimate.', 'Open the Head of Department view.', 'Select Download Excel and open the file.'],
        expected: 'The saved estimate shows with its label and settings, without student records. The Excel file has the same figures as the page.' },
    ],
  },
  {
    id: 'M9', session: 'B', name: 'Student data stays transient', cases: [
      { id: 'TC-25', title: 'Nothing is kept after Clear or after the app closes', req: ['R6'], priority: 'Must',
        steps: ['Load a student and generate a pathway. Select Clear.', 'Load the student again, then close and open the app.'],
        expected: 'After Clear, no student data shows on any page. After the restart, no student and no pathway show.' },
      { id: 'TC-26', title: 'No student record is on the disk or in the database', req: ['R6'], priority: 'Must',
        steps: ['(Facilitator) After the session, search the database and the data folder of the app for the student IDs that were used.', '(Facilitator) List the database tables and look for a table that holds students or transcripts.'],
        expected: 'No student ID, name or grade is stored. The tables hold only planners, units and similar catalogue data. Only the files that the testers exported are in the Downloads folder.' },
    ],
  },
  {
    id: 'M10', session: 'B', name: 'AI Copilot', cases: [
      { id: 'TC-27', title: 'Ask about a student', req: ['R10', 'R1', 'R7'], priority: 'Agreed',
        steps: ['Ask: What major is <ID of Student A> in? Then ask: Can <ID> graduate?', 'Select the button under an answer.'],
        expected: 'Each answer agrees with the Major Detection and Graduation screens. The button opens the page with the student already loaded.' },
      { id: 'TC-28', title: 'Questions in the tester\'s own words, and what it will not do', req: ['R10'], priority: 'Agreed',
        steps: ['Each Head of Department asks three questions of their own about students, planners or units.', 'Ask a question that it cannot answer, and ask it to change data.'],
        expected: 'At least 4 of the 6 answers are correct and on the right topic. The Copilot refuses the other two requests, invents nothing and changes nothing.' },
    ],
  },
  {
    id: 'M11', session: 'B', name: 'Student web app and CMS', cases: [
      { id: 'TC-29', title: 'Students can answer their own basic questions', req: ['R11'], priority: 'Agreed',
        steps: ['On the staging site, find a planner, look up a unit, build a plan in the Plan builder and open the Help page.', 'Each Head of Department lists three questions that students ask them most, and tries to answer them from the site.'],
        expected: 'The pages work, also at phone width. At least 2 of the 3 questions per person can be answered without an advisor.' },
      { id: 'TC-30', title: 'A CMS change shows on the public site', req: ['R11'], priority: 'Agreed',
        steps: ['Sign in to the CMS with the account of the data pack. Try a wrong password first.', 'Change one FAQ answer and save. Open the public Help page.'],
        expected: 'The wrong password is refused. The new answer shows on the public Help page.' },
      { id: 'TC-31', title: 'Accounts with different access', req: ['R11'], priority: 'Agreed',
        steps: ['As the superadmin, create an admin with View only on Units, View and edit on FAQ and No access on the rest.', 'Sign in as that admin and try to change a unit and to open the Planners page.'],
        expected: 'The admin sees only Units and FAQ, cannot change a unit, and gets a No access page for Planners.' },
    ],
  },
];

const dataPack = [
  { item: 'Students A to E', use: 'Students whose course and major the Head of Department can state. A is a typical mid-course student who cannot graduate yet.' },
  { item: 'Student F', use: 'A first-year student with no major yet.' },
  { item: 'Student H', use: 'A student who can graduate.' },
  { item: 'Students I, J, K', use: 'I has a failed core unit. J has a unit in progress. K has two Conceded Passes.' },
  { item: 'Student L', use: 'A second student for the pathway check.' },
  { item: 'Excel files', use: 'A transcript file with its intake, a file with a missing column, and a block of rows to paste with five units.' },
  { item: 'PDF files', use: 'An official study planner PDF that is not in the app yet, and a PDF that is not a planner.' },
  { item: 'Class estimation values', use: 'The student ID range of one course, and the returning percentage and the number of new students that the Head of Department uses.' },
  { item: 'Staging site and CMS account', use: 'The staging student website and a superadmin account for it (never the production site).' },
];

const sessionNames = {
  A: 'Session A: start-up, getting a student in, matching, graduation, planner import',
  B: 'Session B: pathway, export, class estimation, data handling, Copilot, web app',
};

module.exports = { requirements, modules, dataPack, SOURCE, sessionNames };
