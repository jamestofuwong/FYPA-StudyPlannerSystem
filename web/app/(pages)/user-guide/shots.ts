/**
 * The screenshots in the user guide, and the numbered callouts drawn on them.
 *
 * This one file is read by BOTH the guide page (for the captions and the numbered legend) and by
 * scripts/guide-screenshots.ts (which takes the pictures from the running app and stamps the numbers onto them),
 * so the numbers in a picture and the legend beside it cannot drift apart. To refresh the pictures after the
 * app's screens change, see the header of scripts/guide-screenshots.ts.
 */

/** How the screenshot script finds the thing a callout points at on the page. */
export type Find =
  | { css: string; nth?: number }
  | {
      /** Visible text of the element. Exact match unless `startsWith` or `contains` is set. */
      text: string;
      startsWith?: boolean;
      contains?: boolean;
      /** Restrict to a kind of element, as a CSS selector. */
      tag?: string;
      nth?: number;
      /** Only elements to the right of this x (252 skips the sidebar). */
      xMin?: number;
      /** Only elements to the left of this x (252 keeps to the sidebar). */
      xMax?: number;
      /** Only elements above this y (60 keeps to the tab bar). */
      yMax?: number;
    };

/** Where the number sits relative to the thing it points at; 'ir' is inside its right edge. */
export type Place = 'tl' | 'tr' | 'l' | 'r' | 'b' | 't' | 'ir';

export interface Callout {
  n: number;
  /** Short name shown in bold in the legend. */
  label: string;
  /** What it is for, in plain words. */
  text: string;
  find: Find;
  place?: Place;
}

export interface Shot {
  file: string;
  alt: string;
  caption: string;
  /** Screen size the picture is taken at. */
  viewport: { width: number; height: number };
  /** The part of the screen kept, in page pixels. Omit for the whole window. */
  clip?: { x: number; y: number; width: number; height: number };
  /**
   * Alternative to `clip` for screens whose content moves: keep the working area from just above `clipFrom` down
   * to `clipExtra` pixels below the bottom of `clipTo`.
   */
  clipFrom?: Find;
  clipTo?: Find;
  clipExtra?: number;
  callouts: Callout[];
  /**
   * What differs in the Classic design, which has its own screens. Callouts are listed in full when they change;
   * otherwise the Easy ones are reused with the sidebar width adjusted.
   */
  classic?: Partial<Omit<Shot, 'file' | 'classic' | 'callouts'>> & {
    /** By callout number: what to change (the new `find` is in Classic's screen), or null to leave it out. */
    callouts?: Record<number, Partial<Callout> | null>;
  };
}

const MAIN = 256; // Easy's sidebar is 256px wide, so its working area starts here
export const CLASSIC_MAIN = 240; // Classic's sidebar is narrower

/** The picture spec for one design: Easy as written, Classic with its own overrides (its own file folder too). */
export function shotFor(key: keyof typeof SHOTS, classic: boolean): Shot {
  const shot = SHOTS[key];
  if (!classic || EASY_ONLY.includes(key)) return shot;
  const { classic: over = {}, ...base } = shot;
  const { callouts: patch = {}, ...rest } = over;
  const shift = (f: Find): Find => ('css' in f ? f
    : { ...f, xMin: f.xMin === undefined ? undefined : f.xMin - (MAIN - CLASSIC_MAIN), xMax: f.xMax === undefined ? undefined : f.xMax - (MAIN - CLASSIC_MAIN) });
  const callouts = base.callouts
    .map((c) => {
      const p = patch[c.n];
      return p === null ? null : { ...c, find: shift(c.find), ...p };
    })
    .filter((c): c is Callout => c !== null)
    .map((c, i) => ({ ...c, n: i + 1 }));   // numbered again, so there is no gap where one was left out
  const clip = base.clip ? { ...base.clip, x: CLASSIC_MAIN, width: base.viewport.width - CLASSIC_MAIN } : undefined;
  return { ...base, clip, ...rest, callouts };
}

/** Pictures about Easy's own features: the Classic guide shows these as they are. */
export const EASY_ONLY: string[] = ['accentExample', 'shadeExample'];

export const SHOTS: Record<string, Shot> = {
  layout: {
    file: 'layout.webp',
    alt: 'The Major Detection page with the sidebar, tab bar, search row and portal card numbered 1 to 7',
    caption: 'The main parts of the screen',
    viewport: { width: 1360, height: 860 },
    callouts: [
      { n: 1, label: 'Sidebar groups', text: 'Pages are grouped by job: Advising, Course data, Assistant and Reports. Click a name to open that page.', find: { text: 'Advising', xMax: 252 }, place: 'ir' },
      { n: 2, label: 'Collapse button', text: 'Shrinks the sidebar to icons so the page has more room.', find: { css: 'button[aria-label="Collapse sidebar"]' }, place: 'r' },
      { n: 3, label: 'Tabs', text: 'Every page you open stays here. Click to switch, drag to reorder, or press × to close.', find: { text: 'Dashboard', xMin: MAIN, yMax: 60 }, place: 'b' },
      { n: 4, label: 'Search box', text: 'Type a student ID and press Search. It works once you are logged in to the portal.', find: { css: 'input[placeholder*="portal"], input[placeholder*="Student ID"]', nth: 0 }, place: 'tl' },
      { n: 5, label: 'Import', text: 'Brings in a transcript without the portal: an Excel file, units one by one, or a pasted table.', find: { text: 'Import', tag: 'button', xMin: MAIN }, place: 'b' },
      { n: 6, label: 'Portal card', text: 'Shows whether the student portal is connected, with the button to log in or out.', find: { text: 'Log in to Portal', tag: 'button' }, place: 'tr' },
      { n: 7, label: 'User Guide and Settings', text: 'This guide, and the page for appearance, major detection and updates.', find: { text: 'User Guide' }, place: 'r' },
    ],
  },

  importPanel: {
    file: 'import-panel.webp',
    alt: 'The Import panel on Major Detection with an Excel file chosen and callouts 1 to 5',
    caption: 'Importing a transcript from an Excel file',
    viewport: { width: 1360, height: 860 },
    clip: { x: MAIN, y: 180, width: 1104, height: 450 },
    callouts: [
      { n: 1, label: 'Import', text: 'Opens this panel. Cancel closes it again.', find: { text: 'Import', tag: 'button', xMin: MAIN }, place: 'b' },
      { n: 2, label: 'Three ways in', text: 'Upload Excel reads a file. Add Units lets you type units one by one. Paste Table takes rows copied from Excel or the portal.', find: { text: 'Upload Excel', tag: 'button' }, place: 't' },
      { n: 3, label: 'Intake year and semester', text: 'When the student started. Sem 1 is the Feb/Mar intake and Sem 2 is the Aug/Sept intake. The planners are matched by this.', find: { text: 'Intake Year' }, place: 'tl' },
      { n: 4, label: 'Results file', text: 'Choose the .xlsx file. Its first sheet needs the column headings listed below the box.', find: { css: 'input[type=file]' }, place: 'l' },
      { n: 5, label: 'Load', text: 'Reads the file and runs the match, exactly as for a portal student.', find: { text: 'Load', tag: 'button' }, place: 't' },
    ],
  },

  results: {
    file: 'results.webp',
    alt: 'The result of a match: student summary, ranked planners and the result tabs, with callouts 1 to 7',
    caption: 'A student loaded on Major Detection',
    viewport: { width: 1360, height: 1220 },
    clip: { x: MAIN, y: 70, width: 1104, height: 1100 },
    callouts: [
      { n: 1, label: 'Student summary', text: 'Credits completed, credits this term and the number of units on record.', find: { text: 'Credits completed' }, place: 'tl' },
      { n: 2, label: 'Export', text: 'Saves the match, the unit plan and the study planner as a document.', find: { text: 'Export', tag: 'button' }, place: 'tl' },
      { n: 3, label: 'Clear', text: 'Removes this student so you can start another.', find: { text: 'Clear', tag: 'button' }, place: 'tr' },
      { n: 4, label: 'Ranked planners', text: 'The three best-fitting study planners. #1 is the best match. The percentage is how much of that planner the student has done.', find: { text: 'Ranked Planners' }, place: 'tl' },
      { n: 5, label: 'A different planner', text: 'Opens the full list so you can choose any planner yourself. Everything below then follows that planner.', find: { text: 'Match against a different planner', contains: true }, place: 'l' },
      { n: 6, label: 'Result tabs', text: 'Analytics, Graduation, Unit Plan and Student Pathway: four ways to look at the same student and planner.', find: { text: 'Analytics', tag: '[role=tab], button', xMin: MAIN }, place: 'tl' },
      { n: 7, label: 'Not yet taken', text: 'The units still to do. The coloured tags count them by type: core, elective, MPU and work placement.', find: { text: 'Not Yet Taken' }, place: 'tl' },
    ],
  },

  unitPlan: {
    file: 'unit-plan.webp',
    alt: 'The Unit Plan tab: the planner semester by semester with the student\'s grade, term and status for each unit',
    caption: 'The Unit Plan tab',
    viewport: { width: 1360, height: 1500 },
    clipFrom: { text: 'Analytics', tag: '[role=tab], button', xMin: MAIN },
    clipTo: { text: 'YEAR 1 · SEM 1', startsWith: true },
    clipExtra: 480,
    callouts: [
      { n: 1, label: 'Semester heading', text: 'The planner one semester at a time. Click a heading to fold it away.', find: { text: 'YEAR 1 · SEM 1', startsWith: true }, place: 'tl' },
      { n: 2, label: 'Grade, term and status', text: 'What the student actually got, and when. Units not taken yet are left blank.', find: { text: 'Grade', tag: 'th' }, place: 'tl' },
      { n: 3, label: 'Type', text: 'Core, major core, prescribed elective, elective or MPU: what the planner needs that unit for.', find: { text: 'Type', tag: 'th' }, place: 'tl' },
      { n: 4, label: 'Prerequisites', text: 'What must be passed first. A tick means the student already has it.', find: { text: 'Prerequisites', tag: 'th' }, place: 'tl' },
    ],
  },

  graduation: {
    file: 'graduation.webp',
    alt: 'The Graduation tab: the verdict, the reasons, credit bars and lists of what is still needed, with callouts 1 to 6',
    caption: 'The Graduation tab',
    viewport: { width: 1360, height: 1800 },
    clipFrom: { text: 'Analytics', tag: '[role=tab], button', xMin: MAIN },
    clipTo: { text: 'Other requirements' },
    clipExtra: 150,
    callouts: [
      { n: 1, label: 'Verdict', text: 'ELIGIBLE or INELIGIBLE for the planner you have selected.', find: { text: 'INELIGIBLE' }, place: 'ir' },
      { n: 2, label: 'Why', text: 'One sentence naming every reason the student cannot graduate yet. Empty when eligible.', find: { text: 'Still outstanding against this planner', startsWith: true }, place: 'tl' },
      { n: 3, label: 'Credit bars', text: 'Credits earned against what the planner needs, split into core and major, electives and work placement.', find: { text: 'Core & Major Credits' }, place: 'tl' },
      { n: 4, label: 'Core and major', text: 'Each core or major unit not yet passed, with the semester the planner puts it in.', find: { text: 'Core & Major', tag: 'span' }, place: 'tl' },
      { n: 5, label: 'Prescribed electives', text: 'The same for the electives the planner names.', find: { text: 'Prescribed Electives' }, place: 'tl' },
      { n: 6, label: 'Other requirements', text: 'Anything that is not a named unit: the work placement, electives still needed, units in progress, Conceded Passes.', find: { text: 'Other requirements' }, place: 'tl' },
    ],
  },

  graduationOther: {
    file: 'graduation-other.webp',
    alt: 'The Other requirements card listing a Conceded Pass problem',
    caption: 'The Other requirements card when a student has too many Conceded Passes',
    viewport: { width: 1360, height: 1500 },
    callouts: [],
  },

  pathwayEmpty: {
    file: 'pathway-empty.webp',
    alt: 'The Student Pathway page before a student is loaded, with two ways in',
    caption: 'Student Pathway before a student is loaded',
    viewport: { width: 1360, height: 860 },
    clip: { x: MAIN, y: 70, width: 1104, height: 540 },
    callouts: [
      { n: 1, label: 'Go to Major Detection', text: 'Load a student first. The pathway is built for the student and planner chosen there.', find: { text: 'Go to Major Detection', tag: 'button' }, place: 'l' },
      { n: 2, label: 'Import plan', text: 'Opens a plan you saved earlier (an Excel or PDF download from this page) so you can carry on editing it.', find: { text: 'Import plan', startsWith: true }, place: 'l' },
    ],
  },

  pathway: {
    file: 'pathway.webp',
    alt: 'A generated pathway: toolbar, semester tables with edit controls and a break-period card, with callouts 1 to 9',
    caption: 'A generated Student Pathway',
    viewport: { width: 1360, height: 2200 },
    clipFrom: { text: 'Extended Study Plan', xMin: MAIN },
    clipTo: { text: 'YEAR 3 · SEM 1', startsWith: true },
    clipExtra: 250,
    callouts: [
      { n: 1, label: 'Regenerate Pathway', text: 'Builds the plan again from scratch. Use it after changing the planner, a double major or a minor.', find: { text: 'Regenerate Pathway', tag: 'button' }, place: 'l' },
      { n: 2, label: 'Add semester', text: 'Adds an empty semester at the end that you can fill with units.', find: { text: '+ Add semester', tag: 'button' }, place: 'b' },
      { n: 3, label: 'Download PDF or Excel', text: 'Saves the plan. The PDF is the official-style study plan; the Excel is a flat sheet. Both can be imported back later.', find: { text: 'Download PDF', contains: true, tag: 'button' }, place: 'b' },
      { n: 4, label: 'Add unit', text: 'Picks a unit from the catalogue to put in this semester. Units that are not on the planner count as electives.', find: { css: 'select', nth: 0 }, place: 'l' },
      { n: 5, label: 'Delete semester', text: 'Removes the semester and puts its units back in the pool to be placed again.', find: { css: 'button[title^="Delete this semester"]', nth: 0 }, place: 'r' },
      { n: 6, label: 'Move to another semester', text: 'Moves one unit. Anything that breaks a rule is flagged with a warning.', find: { css: 'select', nth: 1 }, place: 'l' },
      { n: 7, label: 'Swap', text: 'Appears on electives. Swap one for another unit from the planner\'s elective list.', find: { text: 'Swap', tag: 'button' }, place: 'b' },
      { n: 8, label: 'Remove', text: 'Takes the unit out of the plan.', find: { css: 'button[title^="Remove"]', nth: 0 }, place: 'r' },
      { n: 9, label: 'Break period', text: 'The work placement runs in a summer or winter break, not in a semester. Use the list to choose which break.', find: { text: 'YEAR 2 · SUMMER BREAK', startsWith: true }, place: 'tl' },
    ],
  },

  planners: {
    file: 'planners.webp',
    alt: 'The Study Planners page with a planner open, with callouts 1 to 6',
    caption: 'Study Planners',
    viewport: { width: 1360, height: 860 },
    clip: { x: MAIN, y: 50, width: 1104, height: 810 },
    callouts: [
      { n: 1, label: 'Filter', text: 'Type a major, a year or a course to narrow the list.', find: { css: 'input[placeholder*="Filter planners"]' }, place: 'tl' },
      { n: 2, label: 'Import', text: 'Adds a planner from an official study planner PDF.', find: { text: 'Import', tag: 'button, a', xMin: MAIN }, place: 'tr' },
      { n: 3, label: 'Course, year, planner', text: 'Click a course to open it, then a year, then the planner you want. Each planner shows its major, intake month and number of units.', find: { text: 'Bachelor of Computer Science', startsWith: true }, place: 'l' },
      { n: 4, label: 'Edit Planner', text: 'Lets you change the units, their semesters and their types. A "Changes saved" note confirms it.', find: { text: 'Edit Planner', tag: 'button' }, place: 'b' },
      { n: 5, label: 'Course List', text: 'The planner semester by semester, with each unit\'s type, prerequisites and the semesters it runs in.', find: { text: 'Course List' }, place: 'tl' },
      { n: 6, label: 'Requirement cards', text: 'How many units and credit points the planner needs in each group: core, major, elective and the work placement.', find: { text: 'Core', xMin: 540 }, place: 'tl' },
    ],
  },

  plannerImport: {
    file: 'planner-import.webp',
    alt: 'The Import a study planner page showing its three steps and the drop area',
    caption: 'Importing a study planner PDF',
    viewport: { width: 1360, height: 860 },
    clip: { x: MAIN, y: 70, width: 1104, height: 500 },
    callouts: [
      { n: 1, label: 'Three steps', text: 'Choose the PDF, check what was read from it, then save it to Study Planners.', find: { text: 'Choose the PDF', contains: true }, place: 'tl' },
      { n: 2, label: 'Drop area', text: 'Drag the official planner PDF here, or click to browse for it.', find: { text: 'Drag and drop a study planner PDF here' }, place: 'tl' },
    ],
  },

  units: {
    file: 'units.webp',
    alt: 'The Unit catalogue page with callouts 1 to 6',
    caption: 'The unit catalogue',
    viewport: { width: 1360, height: 860 },
    clip: { x: MAIN, y: 70, width: 1104, height: 790 },
    callouts: [
      { n: 1, label: 'Search', text: 'Find a unit by code or title.', find: { css: 'input[placeholder*="Search by unit code"]' }, place: 'tl' },
      { n: 2, label: 'Code groups', text: 'Jump to COS, SWE, MPU and the other unit families.', find: { text: 'COS', startsWith: true, tag: 'button, a', xMin: MAIN }, place: 'tr' },
      { n: 3, label: 'Add Unit', text: 'Creates a unit: its code, title, prerequisites and when it runs.', find: { text: 'Add Unit', contains: true, tag: 'button' }, place: 'tr' },
      { n: 4, label: 'Unit Offerings', text: 'Shows which semesters each unit runs in and fills in the gaps. The tag beside the title counts units with no times yet.', find: { text: 'Unit Offerings', contains: true, tag: 'button' }, place: 'tl' },
      { n: 5, label: 'Prerequisite and Offered in', text: 'What must come first (Co is a corequisite, Anti a unit you cannot also take) and the semesters the unit runs.', find: { text: 'PREREQUISITE', tag: 'th' }, place: 'tl' },
      { n: 6, label: 'Edit', text: 'Corrects a unit\'s details, prerequisites and offering times.', find: { css: 'button[aria-label^="Edit "]', nth: 0 }, place: 'tl' },
    ],
  },

  copilot: {
    file: 'copilot.webp',
    alt: 'The AI Copilot page with the chat list, starter questions and message box numbered 1 to 5',
    caption: 'The AI Copilot',
    viewport: { width: 1360, height: 860 },
    clip: { x: MAIN, y: 60, width: 1104, height: 800 },
    callouts: [
      { n: 1, label: 'New chat', text: 'Starts a fresh conversation. Earlier chats are listed underneath and can be reopened or deleted.', find: { text: 'New chat', tag: 'button', xMin: MAIN }, place: 'tl' },
      { n: 2, label: 'Model status', text: 'Green means the AI model is ready. If it is not, this page says what to do (see Troubleshooting).', find: { text: 'qwen2.5:3b' }, place: 'l' },
      { n: 3, label: 'Try asking', text: 'Starter questions. Click one to send it, or add a student ID to the ones that ask for it.', find: { text: 'Try asking' }, place: 'tl' },
      { n: 4, label: 'Message box', text: 'Type your question. Enter sends it; Shift + Enter starts a new line.', find: { css: 'textarea' }, place: 'tl' },
    ],
  },

  classEstimation: {
    file: 'class-estimation.webp',
    alt: 'The Class Estimation page with its three steps and the Load current students card, callouts 1 to 5',
    caption: 'Class Estimation',
    viewport: { width: 1360, height: 860 },
    clip: { x: MAIN, y: 70, width: 1104, height: 790 },
    callouts: [
      { n: 1, label: 'Three steps', text: 'Load students, run the estimate, save it. Each box shows where you are.', find: { text: 'Load students', xMin: MAIN, yMax: 260 }, place: 'tl' },
      { n: 2, label: 'Where the students come from', text: 'The portal (needs a login) or DPA files exported from the portal, one folder at a time.', find: { text: 'Portal', startsWith: true, tag: 'button, label, div, span', xMin: MAIN }, place: 'tl' },
      { n: 3, label: 'Student ID range', text: 'Limit the estimate to one course by giving the first and last student ID. Leave both empty to read everyone.', find: { text: 'From student ID' }, place: 'tl' },
      { n: 4, label: 'Read transcripts', text: 'Loads each student\'s record into memory. Nothing is saved.', find: { text: 'Read transcripts', tag: 'button' }, place: 'r' },
      { n: 5, label: 'Head of Department view', text: 'The saved estimates in the form a Head of Department reads.', find: { text: 'Head of Department view', contains: true }, place: 'tl' },
    ],
  },

  settings: {
    file: 'settings.webp',
    alt: 'The Settings page with design, colour mode, the accent colour wheel, the second major threshold and updates, callouts 1 to 7',
    caption: 'Settings',
    viewport: { width: 1360, height: 1400 },
    clip: { x: MAIN, y: 70, width: 1104, height: 1330 },
    callouts: [
      { n: 1, label: 'Design', text: 'Easy (calm and roomy) or Classic (compact, like a code editor). Every page works the same in both.', find: { text: 'Design', tag: 'div', xMin: MAIN }, place: 'tl' },
      { n: 2, label: 'Colour mode', text: 'Light, dark, or follow your computer.', find: { text: 'Colour mode' }, place: 'tl' },
      { n: 3, label: 'Colour wheel', text: 'Easy only. Drag around the ring, or click it, to pick the colour the whole design is tinted with. The arrow keys turn it a degree at a time.', find: { css: '[role=slider][aria-label="Accent colour hue"]' }, place: 'tl' },
      { n: 4, label: 'Colour code, ready-made colours and shades', text: 'Type a colour code such as #2459A8 to use its colour, or click one of the six ready-made colours. Grey, Black and White below them give a design with no colour at all, and a grey, black or white code picks the same. “Use the original green” goes back to where it started.', find: { css: 'input[aria-describedby="hue-wheel-help"]' }, place: 'l' },
      { n: 5, label: 'Second major threshold', text: 'How well a student must match a second planner before it is reported as a second major. Default 70%.', find: { css: 'input[type=range]' }, place: 'tl' },
      { n: 6, label: 'Save', text: 'Saves the threshold. It applies to the next student you look up.', find: { text: 'Save', tag: 'button' }, place: 'r' },
      { n: 7, label: 'Updates', text: 'Checks for a new version and, when there is one, downloads and installs it.', find: { text: 'Updates', tag: 'h2' }, place: 'tl' },
    ],
  },

  shadeExample: {
    file: 'shade-example.webp',
    alt: 'The Major Detection page in dark mode with the Black shade: black surfaces and white highlights',
    caption: 'The Black shade in dark mode',
    viewport: { width: 1360, height: 640 },
    callouts: [],
  },

  accentExample: {
    file: 'accent-example.webp',
    alt: 'The Major Detection page with Easy tinted blue instead of green',
    caption: 'The same page after choosing blue on the colour wheel',
    viewport: { width: 1360, height: 640 },
    callouts: [],
  },
};

// ---- Classic's differences -----------------------------------------------------------------------------------
// Classic has its own screens, so some callouts point at something else or are left out. Where a callout is left
// out, the rest are numbered again.

SHOTS.layout.classic = {
  caption: 'The main parts of the screen',
  callouts: {
    1: { label: 'Explorer', text: 'Every page is listed here. Click a name to open it.', find: { css: '[class*="Sidebar_explorerLabel"]' }, place: 'r' },
    2: { find: { css: '[class*="Sidebar_sidebarHeader"] > :last-child' }, place: 'l' },
    6: { place: 'b' },
    7: { find: { text: 'User Guide', contains: true, tag: 'button' }, place: 'ir' },
  },
};
SHOTS.results.classic = { clip: { x: CLASSIC_MAIN, y: 70, width: 1120, height: 790 }, callouts: { 1: null, 5: { place: 'ir' } } };
SHOTS.pathway.classic = { callouts: { 2: null } };
SHOTS.plannerImport.classic = {
  clip: { x: CLASSIC_MAIN, y: 40, width: 1120, height: 300 },
  callouts: { 1: null },
};
SHOTS.units.classic = {
  callouts: {
    1: { find: { css: 'input[placeholder*="Filter unit code"]' } },
    2: null,
  },
};
SHOTS.copilot.classic = {
  callouts: {
    1: { label: 'New chat', find: { css: '[class*="historyHeader"] button' } },
    2: null,
    3: null,
  },
};
SHOTS.classEstimation.classic = {
  callouts: { 1: { find: { text: 'Load current students', contains: true, xMin: CLASSIC_MAIN, yMax: 400 } } },
};
SHOTS.settings.classic = {
  clip: { x: CLASSIC_MAIN, y: 70, width: 1120, height: 1000 },
  callouts: {
    2: { label: 'Theme', text: 'Light, dark, or follow your computer.', find: { text: 'Theme', tag: 'div, h2, h3, span' } },
    3: null,
    4: null,
    7: { find: { text: 'Application Update', tag: 'div, h2, h3, span' } },
  },
};
