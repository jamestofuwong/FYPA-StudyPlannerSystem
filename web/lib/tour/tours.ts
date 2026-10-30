import type { Find, Tour } from './types';

/**
 * The interactive walkthroughs: one for each job in the user guide (web/app/(pages)/user-guide/page.tsx).
 * Each step highlights one thing on the screen and says what to do with it, in the words of the guide.
 *
 * Rules for a step:
 * - `target` uses the same finder as the user-guide screenshots (text, or a CSS selector). It must work in Easy and in
 *   Classic. A walkthrough test (e2e/walkthrough.spec.ts) checks every target in both designs.
 * - `missing` says what to do when the target is not on the screen yet. The walkthrough waits for it. Do not leave a
 *   step that needs data (a student, a chosen planner) without a `missing` text.
 * - A new job in the guide needs a walkthrough here, with the same id as the `tour` of the job. A test checks it.
 */

// Classic's working area starts at x = 240, Easy's at 256. 240 keeps the sidebar out of both.
const MAIN = 240;

const LOAD_A_STUDENT = 'Load a student first: type the student ID in the search box and press Search. This step finds the results when they are on the screen.';

const pathwayGenerate: Find[] = [
  { text: 'Generate Custom Pathway', contains: true, tag: 'button' },
  { text: 'Regenerate Pathway', contains: true, tag: 'button' },
];

export const TOURS: Tour[] = [
  {
    id: 'advise-student',
    title: 'Advise a student',
    steps: [
      {
        id: 'portal-login', path: '/dashboard',
        target: { text: 'Log in to Portal', tag: 'button' },
        title: 'Log in to the portal',
        text: 'Press this button. A browser window opens for the university sign-in. Leave it alone until it closes by itself. The app remembers the login next time.',
        missing: 'You are already logged in to the portal. Press Next.',
        advanceOnClick: true,
      },
      {
        id: 'search', path: '/dashboard',
        target: { css: 'input[placeholder*="portal"], input[placeholder*="Student ID"]' },
        title: 'Find the student',
        text: 'Type the student’s ID and press Search. The box works after you log in to the portal.',
        missing: 'The search box is on Major Detection. Press Open this page.',
      },
      {
        id: 'ranked', path: '/dashboard',
        target: { text: 'Ranked Planners' },
        title: 'Read the ranked planners',
        text: 'These are the three planners that fit the student best. Number 1 is the best match. The percentage shows how much of that planner the student has done.',
        missing: LOAD_A_STUDENT,
      },
      {
        id: 'graduation', path: '/dashboard',
        target: { text: 'Graduation', tag: '[role=tab], button', xMin: MAIN },
        title: 'Open the Graduation tab',
        text: 'It shows ELIGIBLE or INELIGIBLE for the planner you chose. It also gives each reason why the student cannot graduate yet.',
        missing: LOAD_A_STUDENT,
      },
      {
        id: 'unit-plan', path: '/dashboard',
        target: { text: 'Unit Plan', tag: '[role=tab], button', xMin: MAIN },
        title: 'Open the Unit Plan tab',
        text: 'It shows the planner semester by semester, with the result of the student for each unit and the prerequisites of each unit.',
        missing: LOAD_A_STUDENT,
      },
      {
        id: 'open-pathway', path: '/dashboard',
        target: { css: '[data-tour="nav-pathway"]' },
        title: 'Open Student Pathway',
        text: 'Open it from the sidebar. It uses the student and the planner that you chose on Major Detection.',
        advanceOnClick: true,
      },
      {
        id: 'generate', path: '/pathway',
        target: pathwayGenerate,
        title: 'Generate the plan',
        text: 'This builds a plan for every semester that is left, so that the student can finish as fast as the rules allow. Check the plan and change it if you need to.',
        missing: 'Load a student on Major Detection first. The pathway uses that student.',
      },
      {
        id: 'download', path: '/pathway',
        target: { text: 'Download PDF', contains: true, tag: 'button' },
        title: 'Keep the plan',
        text: 'Download the plan as a PDF in the official style, or as an Excel file. You can import both again later.',
        missing: 'Generate the pathway first.',
      },
    ],
  },
  {
    id: 'transcript-import',
    title: 'Check a transcript without the portal',
    steps: [
      {
        id: 'import', path: '/dashboard',
        target: { text: 'Import', tag: 'button', xMin: MAIN },
        title: 'Open Import',
        text: 'Press Import on Major Detection. It loads a student from a file or from typed units when the portal is not available.',
        advanceOnClick: true,
      },
      {
        id: 'ways', path: '/dashboard',
        target: { text: 'Upload Excel', tag: 'button' },
        title: 'Choose how to load the student',
        text: 'Upload Excel reads a file. Add Units lets you type the units. Paste Table accepts rows that you copied from Excel or the portal.',
        missing: 'Press Import first.',
      },
      {
        id: 'intake', path: '/dashboard',
        target: { text: 'Intake Year' },
        title: 'Set the intake',
        text: 'Enter the year and the semester in which the student started. The app uses them to find the correct planner. A wrong intake can select the wrong planner version.',
        missing: 'Press Import first.',
      },
      {
        id: 'load', path: '/dashboard',
        target: { text: 'Load', tag: 'button' },
        title: 'Load the student',
        text: 'Press Load to read the data and to run the match. Choose the file, or add the units, before you press it.',
        missing: 'Press Import first.',
        advanceOnClick: true,
      },
      {
        id: 'result', path: '/dashboard',
        // Easy shows a card called "Imported transcript". Classic goes straight to the ranked planners.
        target: {
          meadow: { text: 'Imported transcript', contains: true },
          classic: { text: 'Ranked Planners' },
        },
        title: 'Check the result',
        text: 'It worked when the student shows with the three ranked planners. In Easy, a card also says “Imported transcript”. The results are the same as for a student from the portal.',
        missing: 'The result shows after the student is loaded. Press Load, then wait a few seconds.',
      },
    ],
  },
  {
    id: 'add-planner',
    title: 'Add a study planner',
    steps: [
      {
        id: 'import', path: '/planners',
        target: { text: 'Import', tag: 'a, button', xMin: MAIN },
        title: 'Open Import',
        text: 'Press Import on Study Planners. It adds a planner from an official study planner PDF.',
        advanceOnClick: true,
      },
      {
        id: 'choose', path: '/import',
        target: { text: 'Drag and drop a study planner PDF here' },
        title: 'Choose the PDF',
        text: 'Use the official study planner PDF for the course and the intake. Drag it to this area, or click the area to find the file.',
        missing: 'This page opens when you press Import on Study Planners.',
      },
      {
        id: 'check', path: '/import',
        // Easy shows the three steps of the import. Classic shows only the drop area.
        target: {
          meadow: { text: 'Choose the PDF', contains: true },
          classic: { text: 'Drag and drop a study planner PDF here' },
        },
        title: 'Check what the app read',
        text: 'The app reads the PDF on this computer. Read what it found and correct anything that is wrong: the course, the intake and each unit.',
        missing: 'This page opens when you press Import on Study Planners.',
      },
      {
        id: 'save', path: '/import',
        target: { text: 'Confirm & Save', tag: 'button' },
        title: 'Save the planner',
        text: 'Press Confirm & Save. The app can then match students against this planner.',
        missing: 'This button shows after the app has read the PDF.',
      },
      {
        id: 'find', path: '/planners',
        target: { css: 'input[placeholder*="Filter planners"]' },
        title: 'Find the new planner',
        text: 'It worked when the planner appears under its course and year. Use the filter to find it.',
        missing: 'Open Study Planners to see the list.',
      },
    ],
  },
  {
    id: 'class-estimation',
    title: 'Estimate class sizes',
    steps: [
      {
        id: 'source', path: '/class-estimation',
        target: { text: 'Portal', startsWith: true, tag: 'button, label, div, span', xMin: MAIN },
        title: 'Choose where the students come from',
        text: 'Choose Portal (it needs a login), or DPA files that you exported from the portal. The app reads the transcripts of the current students.',
        missing: 'Open Class Estimation to see this step.',
      },
      {
        id: 'range', path: '/class-estimation',
        target: { text: 'From student ID' },
        title: 'Choose a student ID range',
        text: 'Enter the first and the last student ID to estimate one course. Leave both boxes empty to read all students.',
        missing: 'Open Class Estimation to see this step.',
      },
      {
        id: 'read', path: '/class-estimation',
        target: { text: 'Read transcripts', tag: 'button' },
        title: 'Read the transcripts',
        text: 'The app loads the record of each student into memory. It does not save the records.',
        missing: 'Open Class Estimation to see this step.',
        advanceOnClick: true,
      },
      {
        id: 'run', path: '/class-estimation',
        target: [
          { text: 'Run the estimate', contains: true, tag: 'button' },
          { text: 'Run estimate', contains: true, tag: 'button' },
        ],
        title: 'Run the estimate for next semester',
        text: 'Enter the percentage of students that you expect to return and the number of new students. Then run the estimate.',
        missing: 'Read the transcripts first. This button shows after the students are loaded.',
      },
      {
        id: 'save', path: '/class-estimation',
        target: { text: 'Save this estimate', contains: true },
        title: 'Save it',
        text: 'Add a label if you want, for example “before the FTES change”. Download Excel gives the figures as a sheet.',
        missing: 'Run the estimate first.',
      },
      {
        id: 'hod', path: '/class-estimation',
        target: { text: 'Head of Department view', contains: true },
        title: 'Open the Head of Department view',
        text: 'The saved estimates show here, the way a Head of Department reads them. It worked when each unit shows a headcount to staff for.',
        missing: 'Open Class Estimation to see this step.',
      },
    ],
  },
  {
    id: 'course-data',
    title: 'Look after course data',
    steps: [
      {
        id: 'filter', path: '/planners',
        target: { css: 'input[placeholder*="Filter planners"]' },
        title: 'Find a planner',
        text: 'Study Planners lists every planner by course, year and major. Type here to make the list shorter. Then open a planner to see its units.',
        missing: 'Open Study Planners to see this step.',
      },
      {
        id: 'edit-planner', path: '/planners',
        target: { text: 'Edit Planner', tag: 'button' },
        title: 'Change a planner',
        text: 'Press Edit Planner to change the units, their semesters and their types. It worked when the page says “Changes saved”.',
        missing: 'Open a planner from the list first. The button shows when a planner is open.',
      },
      {
        id: 'unit-search', path: '/units',
        target: { css: 'input[placeholder*="unit code"]' },
        title: 'Find a unit',
        text: 'Units holds the unit catalogue. Type a unit code or a title to find a unit.',
        missing: 'Open Units to see this step.',
      },
      {
        id: 'add-unit', path: '/units',
        target: { text: 'Add Unit', contains: true, tag: 'button' },
        title: 'Add a unit',
        text: 'Enter its code, its title, its prerequisites and the semesters in which it runs.',
        missing: 'Open Units to see this step.',
      },
      {
        id: 'edit-unit', path: '/units',
        target: { css: 'button[aria-label^="Edit "]' },
        title: 'Correct a unit',
        text: 'Press Edit to correct the prerequisites of a unit and the semesters in which it runs. It worked when the page says “Changes saved”.',
        missing: 'No unit is on the list. Clear the search box.',
      },
    ],
  },
  {
    id: 'copilot',
    title: 'Ask the AI copilot',
    steps: [
      {
        id: 'status', path: '/copilot',
        // When the AI is not ready, this is the message that says what to do. In Easy, a ready AI shows its model name here.
        target: [
          { text: 'qwen2.5:3b' },
          { text: 'Ollama is not running' },
          { text: 'Download the AI model' },
          { text: 'AI model not downloaded' },
          { text: 'Checking the AI service', contains: true },
          { text: 'Checking AI status', contains: true },
        ],
        title: 'The AI runs on this computer',
        text: 'The app starts it when it opens. If it is not ready, this part of the page says what to do: start Ollama, or download the model.',
        missing: 'The AI is ready, so this part of the page has nothing to say. Press Next.',
      },
      {
        id: 'download', path: '/copilot',
        target: { text: 'Download model', contains: true, tag: 'button' },
        title: 'Download the model once',
        text: 'The first time, download the model from this page (about 2 GB). After that, the copilot works without a download.',
        missing: 'The model is already on this computer, so there is nothing to download. Press Next.',
      },
      {
        id: 'ask', path: '/copilot',
        target: { css: 'textarea' },
        title: 'Ask your question',
        text: 'Ask about the major, the graduation or the progress of a student, or about planners and units. Press Enter to send. In Easy, example questions are above the box: click one to send it. An answer often has buttons that open the matching page.',
        missing: 'The message box shows when the AI is ready. If the page asks you to start Ollama or to download the model, do that first.',
      },
    ],
  },
];

export const TOURS_BY_ID = new Map(TOURS.map((t) => [t.id, t]));
