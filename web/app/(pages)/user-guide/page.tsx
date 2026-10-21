'use client';

import React from 'react';
import Link from 'next/link';
import {
  BookOpen, Bot, ShieldCheck, Search, Cpu, ListChecks,
  Compass, AppWindow, Activity, ListOrdered, Lightbulb,
  ArrowRight, ChartColumn, FileSpreadsheet, FileUp, Globe, GraduationCap, Layers, PanelLeft, Palette, Sparkles,
} from 'lucide-react';
import styles from './page.module.css';
import { PageHeader } from '../../../components/common/MeadowBits';
import { useDesign } from '../../../styles/themeProvider';
import {
  CopilotAnswer, ExcelSample, Fix, GraduationChecks, MatchBar, Note, PlanSteps, Shot, StartFlow, TermsDiagram,
} from './GuideParts';

// ── The guide (Easy and Classic share the content, each in its own style) is organised by the jobs people come to the app to do ──

const JOBS = [
  {
    icon: GraduationCap,
    title: 'Advise a student',
    steps: [
      'Log in to the portal from the card at the bottom of the sidebar. A browser window opens for the university sign-in. Leave it alone until it closes by itself.',
      'On Major Detection, type the student’s ID and press Search.',
      'Read the ranked planners, then the Graduation and Unit Plan tabs.',
      'Open Student Pathway and generate the plan for the semesters that are left.',
    ],
    result: 'It worked when the student’s credits and three ranked planners appear.',
    link: { href: '/dashboard', label: 'Open Major Detection' },
  },
  {
    icon: FileSpreadsheet,
    title: 'Check a transcript without the portal',
    steps: [
      'On Major Detection, press Import.',
      'Choose Upload Excel, Add Units or Paste Table.',
      'Set the intake year and semester, then press Load.',
    ],
    result: 'It worked when the card says “Imported transcript” and shows the same results as a portal student.',
    link: { href: '/dashboard', label: 'Open Major Detection' },
  },
  {
    icon: FileUp,
    title: 'Add a study planner',
    steps: [
      'Open Study Planners and press Import.',
      'Choose the official study planner PDF.',
      'Read what was found in it and correct anything that is wrong: the course, intake and units.',
      'Save it.',
    ],
    result: 'It worked when the planner appears under its course and year on Study Planners.',
    link: { href: '/planners', label: 'Open Study Planners' },
  },
  {
    icon: ChartColumn,
    title: 'Estimate class sizes',
    steps: [
      'On Class Estimation, read the current students’ transcripts from the portal or from DPA files.',
      'Run the estimate for next semester.',
      'Save it, then open the Head of Department view.',
    ],
    result: 'It worked when each unit shows a headcount to staff for.',
    link: { href: '/class-estimation', label: 'Open Class Estimation' },
  },
  {
    icon: Layers,
    title: 'Look after course data',
    steps: [
      'Study Planners lists every planner by course, year and major. Open one to see its units, or choose Edit Planner to change them.',
      'Units holds the unit catalogue. Add a unit, or correct its prerequisites and the semesters it runs in.',
    ],
    result: 'It worked when the page says “Changes saved”.',
    link: { href: '/units', label: 'Open Units' },
  },
  {
    icon: Sparkles,
    title: 'Ask the AI copilot',
    steps: [
      'The AI runs on this computer and the app starts it when it opens.',
      'The first time, download its model from the copilot page (about 2 GB).',
      'Ask about a student’s major, graduation or progress, or about planners and units.',
    ],
    result: 'It worked when an answer appears, often with buttons that open the matching page.',
    link: { href: '/copilot', label: 'Open AI Copilot' },
  },
];

const FIRST_TIME = [
  { icon: ShieldCheck, title: 'Privacy notice', text: 'Read and accept it when it appears. It comes back if the notice is updated.' },
  { icon: Globe, title: 'Portal login', text: 'Log in once from the sidebar. The window closes by itself when you are in, and the app remembers the login next time. You only need to log in again if it expires.' },
  { icon: Sparkles, title: 'AI model', text: 'Only if you use the copilot: download its model once, from the copilot page.' },
];

const TIPS = [
  'Keep Major Detection open in one tab and Study Planners in another to compare a student’s units with a planner.',
  'In a study planner, the category badges (Core, Major Core, Elective, MPU) show the mix of units a student needs to graduate.',
  'After loading a student, ask the copilot about them: it checks the same rules as the Graduation tab.',
  'Switch the planner under Ranked Planners to see how the same student fits another major. The Graduation tab and the pathway follow the planner you pick.',
  'Class Estimation remembers the returning-students percentage, so it only needs changing when the outlook does.',
];

const TOC = [
  ['guide-start', 'Start here'],
  ['guide-layout', 'Getting around'],
  ['guide-jobs', 'Common jobs'],
  ['guide-import', 'Loading a student without the portal'],
  ['guide-results', 'Reading the results'],
  ['guide-graduation', 'The graduation check'],
  ['guide-pathway', 'Building a pathway'],
  ['guide-copilot', 'The AI copilot'],
  ['guide-data', 'Study planners and units'],
  ['guide-estimation', 'Class estimation'],
  ['guide-settings', 'Settings and updates'],
  ['guide-trouble', 'When something goes wrong'],
  ['guide-glossary', 'Words used in the app'],
  ['guide-tips', 'Tips'],
] as const;

const GLOSSARY = [
  ['Core unit', 'A unit every student of the course must pass, whatever the major.'],
  ['Major core unit', 'A unit that must be passed for one particular major.'],
  ['Prescribed elective', 'An elective the planner names, so it must be passed.'],
  ['Elective', 'A unit chosen from a list, or any unit the course allows, to make up the elective credit.'],
  ['MPU', 'The general-studies units (Mata Pelajaran Umum). They carry no credit points and which ones apply depends on the student’s nationality, so the Graduation tab and the pathway leave them out.'],
  ['WIL', 'The work-integrated learning placement (ICT20016, 25 credit points). It runs in a summer or winter break.'],
  ['Credit points (CP)', 'The size of a unit. Most units are 12.5. A course needs 300.'],
  ['Conceded Pass (CP grade)', 'A pass that earns credit but cannot count as a prerequisite, and a student may graduate with at most one. Not to be confused with credit points, which are also written CP.'],
  ['Exemption', 'A unit counted as done through credit transfer. In an Excel file it is a Complete row with no grade.'],
  ['Prerequisite', 'A unit that must be passed before another.'],
  ['Corequisite', 'A unit taken at the same time as, or before, another. Shown as “Co:” in the catalogue.'],
  ['Antirequisite', 'A unit that cannot also be taken. Shown as “Anti:”.'],
  ['Intake', 'The semester a student started. Each intake has its own version of every planner.'],
  ['Planner', 'The official study planner for one major and intake: which units go in which semester.'],
  ['Pathway', 'A plan for the semesters a student has left, built from a planner.'],
  ['Match percentage', 'How much of a planner a student has done, with the parts weighted as shown under Reading the results.'],
  ['DPA', 'A degree progress audit: a student’s transcript as exported from the portal.'],
  ['Head of Department view', 'The saved class estimates, shown the way a Head of Department reads them.'],
] as const;

const GUIDE_INTRO = 'How to do each job in this workspace, step by step, and what you should see when it works.';

function SectionTitle({ icon: Icon, classic, children }: { icon: React.ElementType; classic: boolean; children: React.ReactNode }) {
  return (
    <h2 className={styles.mSectionTitle}>
      {classic && <Icon className={styles.classicTitleIcon} aria-hidden="true" />}
      {children}
    </h2>
  );
}

function Guide({ classic }: { classic: boolean }) {
  return (
    <div className={classic ? `${styles.container} ${styles.classicGuide}` : styles.mPanel}>
      {classic ? (
        <header className={styles.header}>
          <h1 className={styles.title}>
            <BookOpen size={40} color="var(--guide-icon, #3b82f6)" /> User Documentation
          </h1>
          <p className={styles.subtitle}>{GUIDE_INTRO}</p>
        </header>
      ) : (
        <PageHeader title="User guide" description={GUIDE_INTRO} />
      )}
      <div className={styles.mLayout}>
        <div className={styles.mMain}>

          {/* ───────── Start here ───────── */}
          <section id="guide-start" className={styles.mSection}>
            <SectionTitle icon={Compass} classic={classic}>Start here</SectionTitle>
            <p className={styles.mLead}>Most advising sessions follow the same five steps.</p>
            <StartFlow />
            <h3 className={styles.mSubTitle}>The first time on this computer</h3>
            <div className={styles.mLayoutList}>
              {FIRST_TIME.map(({ icon: Icon, title, text }) => (
                <div key={title} className={styles.mLayoutItem}>
                  <span className={styles.mJobIcon} aria-hidden="true"><Icon /></span>
                  <div>
                    <h3 className={styles.mItemTitle}>{title}</h3>
                    <p className={styles.mItemText}>{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ───────── Getting around ───────── */}
          <section id="guide-layout" className={styles.mSection}>
            <SectionTitle icon={PanelLeft} classic={classic}>Getting around</SectionTitle>
            <Shot id="layout" />
            <p className={styles.mText}>
              The design (Easy or Classic), the colours (light or dark) and Easy’s accent colour can all be changed in
              Settings. Everything works the same whichever you choose.
            </p>
          </section>

          {/* ───────── Common jobs ───────── */}
          <section id="guide-jobs" className={styles.mSection}>
            <SectionTitle icon={ListChecks} classic={classic}>Common jobs</SectionTitle>
            <div className={styles.mJobGrid}>
              {JOBS.map(({ icon: Icon, title, steps, result, link }) => (
                <article key={title} className={styles.mJob}>
                  <div className={styles.mJobHead}>
                    <span className={styles.mJobIcon} aria-hidden="true"><Icon /></span>
                    <h3 className={styles.mJobTitle}>{title}</h3>
                  </div>
                  <ol className={styles.mSteps}>
                    {steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  <p className={styles.mResult}><strong>You will see:</strong> {result}</p>
                  <Link href={link.href} className={styles.mJobLink}>
                    {link.label} <ArrowRight aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </section>

          {/* ───────── Importing ───────── */}
          <section id="guide-import" className={styles.mSection}>
            <SectionTitle icon={FileUp} classic={classic}>Loading a student without the portal</SectionTitle>
            <p className={styles.mLead}>
              Use this when the portal is not available, or to try a “what if” transcript. The results are the same as
              for a portal student.
            </p>
            <Shot id="importPanel" />

            <h3 className={styles.mSubTitle}>Upload Excel</h3>
            <p className={styles.mText}>
              The first sheet needs a row of column headings. Only four are required; the rest make the result more
              complete.
            </p>
            <ExcelSample />
            <ul className={styles.mList}>
              <li>The headings do not have to be in the very first row, but they must be near the top, and the order of the columns does not matter.</li>
              <li><strong>Status</strong> is Complete (finished), Current (studying now) or Future (enrolled for a later semester; the pathway plans it again).</li>
              <li><strong>Grade</strong>: HD, D, C, P and SP are passes. CP is a Conceded Pass. N and SN are fails. A Complete row with no grade counts as passed, for example a credit transfer.</li>
              <li><strong>Earned</strong> is the credit the student got: 0 for a fail or a unit not finished.</li>
              <li><strong>Term</strong> looks like 2025_SEP_S2 (year, month, then S1 for Feb/Mar or S2 for Aug/Sept). It tells the pathway where the student has got to.</li>
            </ul>
            <Note title="Choose the intake carefully">
              Intake Sem is the semester the student <em>started</em>: Sem 1 for Feb/Mar and Sem 2 for Aug/Sept. The planners are matched by this, so a wrong intake can match the wrong planner version.
            </Note>
            <TermsDiagram />

            <h3 className={styles.mSubTitle}>Add Units</h3>
            <p className={styles.mText}>
              Type a unit code and pick the unit, then give its grade and term, and press Add. Repeat for each unit, then Load. A unit can only be added once.
            </p>
            <h3 className={styles.mSubTitle}>Paste Table</h3>
            <p className={styles.mText}>
              Copy rows from Excel or the portal and paste them in. Each row is tab separated in this order: Course, Course Title, Credits, Earned, Status, Grade, Term.
            </p>
          </section>

          {/* ───────── Results ───────── */}
          <section id="guide-results" className={styles.mSection}>
            <SectionTitle icon={Search} classic={classic}>Reading the results</SectionTitle>
            <Shot id="results" />

            <h3 className={styles.mSubTitle}>What the match percentage means</h3>
            <p className={styles.mText}>
              Each planner is scored by how much of it the student has done. Core and major units count most.
            </p>
            <MatchBar />

            <h3 className={styles.mSubTitle}>Choosing the planner</h3>
            <p className={styles.mText}>
              The best match, #1, is used by default. Click #2 or #3 to see the student against another planner, or open
              <em> Match against a different planner</em> to pick any planner at all, for example one from another
              intake. The Graduation, Unit Plan and Student Pathway tabs all follow the planner you select.
            </p>
            <Note title="“No Major Detected”" tone="warn">
              This appears when nothing the student has taken points to one major. A first-year student is the usual case,
              because every major shares the same first units. The page lists the closest planners and what is missing from
              each. Pick a planner yourself with <em>Match against a different planner</em>, or come back when the student
              has taken major units.
            </Note>
            <Note title="A second major">
              The dashboard shows the best major only. If a student might qualify for a second major, ask the AI copilot
              “What major is 102780123 in?”: it reports a second major when the match reaches the threshold in Settings.
            </Note>
            <p className={styles.mText}>
              <strong>Latest / Earliest</strong>, next to the search box, chooses which of a student’s enrolments is read
              when they have more than one. Latest is normally right.
            </p>

            <h3 className={styles.mSubTitle}>The tabs</h3>
            <ul className={styles.mList}>
              <li><strong>Analytics</strong> lists the units still to take, the tags count them (core, elective, MPU, work placement), and shows what the student is enrolled in now.</li>
              <li><strong>Graduation</strong> says whether the student can graduate. See the next section.</li>
              <li><strong>Unit Plan</strong> is the planner semester by semester, with the student’s result against each unit. Units the student has taken that are not on the planner are listed separately under <em>Units Outside Planner</em>.</li>
              <li><strong>Student Pathway</strong> opens the pathway for this student and planner.</li>
            </ul>
            <Shot id="unitPlan" />
            <p className={styles.mText}>
              <strong>Export</strong> saves the major match, the unit plan and the study planner as a document. <strong>Clear</strong> removes the student.
            </p>
          </section>

          {/* ───────── Graduation ───────── */}
          <section id="guide-graduation" className={styles.mSection}>
            <SectionTitle icon={GraduationCap} classic={classic}>The graduation check</SectionTitle>
            <p className={styles.mLead}>
              The Graduation tab says whether the student can graduate on the selected planner and, if not, exactly what is still needed.
            </p>
            <GraduationChecks />
            <Shot id="graduation" />
            <h3 className={styles.mSubTitle}>Other requirements</h3>
            <p className={styles.mText}>
              Anything that is not a named core, major or prescribed unit appears in this card: the work placement, how many
              more electives are needed, units still in progress, and Conceded Passes.
            </p>
            <Shot id="graduationOther" />
            <ul className={styles.mList}>
              <li>A unit that is <strong>in progress</strong> counts as not passed yet, so the verdict only turns to ELIGIBLE once the results are in.</li>
              <li>A <strong>Conceded Pass</strong> earns its credit, but a student can graduate with only one. The card shows how many there are.</li>
              <li>A failed unit stays on the list until it has been passed. A later pass clears it.</li>
              <li>Elective credit counts the prescribed electives and any other unit the student passed. On older planners the work placement is worth two electives.</li>
              <li>The credit total is the portal’s own figure, or the sum from an imported file. MPU units are not counted.</li>
              <li>The AI copilot uses the same rules, so its answer and this tab agree.</li>
            </ul>
          </section>

          {/* ───────── Pathway ───────── */}
          <section id="guide-pathway" className={styles.mSection}>
            <SectionTitle icon={ListOrdered} classic={classic}>Building a pathway</SectionTitle>
            <p className={styles.mLead}>
              A pathway plans every semester the student has left, so they can finish as quickly as the rules allow.
            </p>
            <ol className={styles.mStepList}>
              <li>Load the student and choose the planner on Major Detection.</li>
              <li>Open <strong>Student Pathway</strong> from its tab or the sidebar. The page shows which student and planner it is using.</li>
              <li>Press <strong>Generate Custom Pathway</strong>.</li>
              <li>Check the plan and adjust it (see below).</li>
              <li>Press <strong>Download PDF</strong> or <strong>Download Excel</strong> to keep it.</li>
            </ol>
            <Shot id="pathwayEmpty" />
            <p className={styles.mText}>
              With no student loaded, the page offers <strong>Import plan (Excel or PDF)</strong> to reopen a plan you downloaded earlier and carry on editing it.
            </p>

            <h3 className={styles.mSubTitle}>The plan</h3>
            <Shot id="pathway" />
            <h3 className={styles.mSubTitle}>How the plan is built</h3>
            <PlanSteps />
            <h3 className={styles.mSubTitle}>Rules the plan follows</h3>
            <ul className={styles.mList}>
              <li>No more than 4 units in a semester, plus 1 MPU unit.</li>
              <li>A unit is only placed in a semester it runs in. Each semester is labelled Feb/Mar or Aug/Sep.</li>
              <li>A prerequisite comes before the unit. A corequisite comes before it or in the same semester. Some units need a number of credit points first: Project A needs 175.</li>
              <li>Project B follows Project A straight away, in the last year.</li>
              <li>The work placement runs in a summer or winter break, not in a semester.</li>
              <li>A failed unit is planned again. A Conceded Pass that a later unit needs as a prerequisite is also planned again, because it cannot count.</li>
              <li>Units the student has enrolled in for later (“Future”) are planned again from the next semester.</li>
              <li>The plan starts at the next real semester after the latest one on the transcript. A semester or year away counts as time passed.</li>
            </ul>
            <h3 className={styles.mSubTitle}>Changing the plan</h3>
            <ul className={styles.mList}>
              <li>Move a unit with the list beside it, or take it out with ×. A warning appears when a semester is over the normal load, or a unit is in a semester it does not run in or before its prerequisites.</li>
              <li>Add a unit from the catalogue with <em>Add unit</em>. A unit that is not on the planner counts as an elective.</li>
              <li>Swap an elective for another from the planner’s elective list with <em>Swap</em>.</li>
              <li>Remaining MPU units are listed separately at the bottom. Add or remove them there.</li>
              <li>When the student has room for electives, <strong>Double Major Opportunities</strong> and <strong>Minors &amp; Specializations</strong> appear under the plan. Choose one to use its units in place of free electives and the plan is rebuilt.</li>
              <li>Press <strong>Regenerate Pathway</strong> to throw away your edits and start again.</li>
            </ul>
          </section>

          {/* ───────── Copilot ───────── */}
          <section id="guide-copilot" className={styles.mSection}>
            <SectionTitle icon={Bot} classic={classic}>The AI copilot</SectionTitle>
            <p className={styles.mLead}>
              Ask in plain English. The answers come from the student portal and the planner database, not from the AI’s memory.
            </p>
            <Shot id="copilot" />
            <h3 className={styles.mSubTitle}>What to ask</h3>
            <ul className={styles.mList}>
              <li>“What major is 102780123 in?” (also reports a second major)</li>
              <li>“Can 102780123 graduate?” and “How is 102780123 progressing?”</li>
              <li>“Which planners are available?”</li>
              <li>“Which units have no prerequisites?”, “Is COS20007 offered this semester?”</li>
            </ul>
            <p className={styles.mText}>Questions about a student need the portal login. The copilot tells you if you have not logged in.</p>
            <h3 className={styles.mSubTitle}>Answer buttons</h3>
            <CopilotAnswer />
            <p className={styles.mText}>
              Buttons open the right page with the student already loaded, and scroll to the part that answers the
              question. A button only keeps its prepared data for about 30 minutes; after that the page opens and looks
              the student up again.
            </p>
            <Note title="If the copilot is not ready">
              <em>AI model not downloaded</em>: press <em>Download the AI model</em> (about 2 GB, once).{' '}
              <em>Ollama is not running</em>: the app starts it when it opens, so wait a minute and press <em>Check again</em>.
              If it still does not start, close and reopen the app.
            </Note>
          </section>

          {/* ───────── Planners and units ───────── */}
          <section id="guide-data" className={styles.mSection}>
            <SectionTitle icon={Layers} classic={classic}>Study planners and units</SectionTitle>
            <h3 className={styles.mSubTitle}>Study Planners</h3>
            <Shot id="planners" />
            <h3 className={styles.mSubTitle}>Adding a planner from a PDF</h3>
            <p className={styles.mText}>Press Import on the Study Planners page. There are three steps:</p>
            <Shot id="plannerImport" />
            <ol className={styles.mStepList}>
              <li><strong>Choose the PDF.</strong> Use the official study planner for the course and intake.</li>
              <li><strong>Read it and check the details.</strong> Confirm the course, intake and every unit, and correct anything that was misread.</li>
              <li><strong>Save to Study Planners.</strong> It then appears in the list and students can be matched against it.</li>
            </ol>
            <h3 className={styles.mSubTitle}>The unit catalogue</h3>
            <Shot id="units" />
            <Note title="Writing prerequisites">
              Put <code>&amp;</code> between units that are all needed and <code>/</code> between alternatives. For example{' '}
              <code>COS10009 &amp; COS10004 / 50cp</code> means both units, or 50 credit points instead. In the table, “Co:” is a
              corequisite and “Anti:” is a unit the student cannot also take.
            </Note>
            <p className={styles.mText}>
              <strong>Unit Offerings</strong> shows which semesters each unit runs in. It can also scan recent planners and fill in missing times.
              A unit with no times is counted beside the page title, because the pathway cannot tell where to place it.
            </p>
          </section>

          {/* ───────── Class estimation ───────── */}
          <section id="guide-estimation" className={styles.mSection}>
            <SectionTitle icon={ChartColumn} classic={classic}>Class estimation</SectionTitle>
            <p className={styles.mLead}>How many students to expect in each unit next semester, worked out from the current students’ transcripts.</p>
            <Shot id="classEstimation" />
            <ol className={styles.mStepList}>
              <li><strong>Load students.</strong> Choose Portal (needs a login) or Imported DPA, give a student ID range if you want only one course, and press Read transcripts. Records are kept in memory only, never saved.</li>
              <li><strong>Run the estimate.</strong> Set the percentage of students you expect to come back and the number of brand-new students, then run it. The page remembers the returning percentage.</li>
              <li><strong>Save it.</strong> Add a label if you like, such as “before the FTES change”. Download Excel gives the figures as a sheet.</li>
            </ol>
            <p className={styles.mText}>Saved estimates, with the settings that produced them, are in the Head of Department view.</p>
          </section>

          {/* ───────── Settings ───────── */}
          <section id="guide-settings" className={styles.mSection}>
            <SectionTitle icon={Palette} classic={classic}>Settings and updates</SectionTitle>
            <Shot id="settings" />
            <h3 className={styles.mSubTitle}>Choosing Easy’s accent colour</h3>
            <p className={styles.mText}>
              Easy starts out green. The <strong>Accent colour</strong> wheel in Settings tints the whole design
              with any colour you like: the sidebar highlight, buttons, selected items, backgrounds and borders all follow it
              at once, in both light and dark. Status colours such as the red for a problem do not change, so they still
              mean what they say. The shades are adjusted for every colour so text stays easy to read.
            </p>
            <Shot id="accentExample" />
            <ul className={styles.mList}>
              <li>Drag around the ring, or click it, to choose. With the wheel selected, the arrow keys turn it a degree at a time (hold Shift for ten).</li>
              <li>Or type a colour code, such as <code>#2459A8</code>, into the Colour code box. A colour gives its colour to the design; a grey, black or white code picks that shade.</li>
              <li>The six round buttons are ready-made colours. <strong>Use the original green</strong> goes back to where it started.</li>
              <li>The choice is remembered on this computer. It applies to Easy only: Classic keeps its own colours, and your choice is waiting when you switch back.</li>
            </ul>
            <h3 className={styles.mSubTitle}>Grey, black and white</h3>
            <p className={styles.mText}>
              For a design with no colour at all, choose a <strong>shade</strong> under the ready-made colours. They look
              different in light and dark, so each is set up for both:
            </p>
            <ul className={styles.mList}>
              <li><strong>Grey</strong> is soft neutral grey with a slate highlight.</li>
              <li><strong>Black</strong>: in light mode the highlight and buttons are black on crisp greys. In dark mode the surfaces go truly black and the highlight is white.</li>
              <li><strong>White</strong>: in light mode every surface is pure white. Buttons stay charcoal, because a white button would be invisible on white. In dark mode the highlight is white on the usual dark greys.</li>
            </ul>
            <Shot id="shadeExample" />
            <p className={styles.mText}>
              Press <strong>Check for updates</strong> to see whether a newer version exists. If one does, the page says so
              and lets you download it. It is installed the next time the app closes.
            </p>
          </section>

          {/* ───────── Troubleshooting ───────── */}
          <section id="guide-trouble" className={styles.mSection}>
            <SectionTitle icon={Activity} classic={classic}>When something goes wrong</SectionTitle>
            <div className={styles.mFixList}>
              <Fix problem="The login window closed but the sidebar still says Portal not connected">
                After the window closes the app loads the list of students, which can take a moment. If it still says “Portal
                not connected” afterwards, press <em>Log in to Portal</em> again. The login is remembered between launches, and
                you only need to repeat it when the portal ends the session.
              </Fix>
              <Fix problem="Searching finds nothing, or says the student was not found">
                Check the sidebar shows you are connected and the student list has finished loading. Type the student ID on
                its own, digits only. If the portal is not available, load the student with Import instead.
              </Fix>
              <Fix problem="My Excel file is rejected">
                <ul className={styles.mList}>
                  <li><em>Could not find the columns “Course”, … in the header row</em>: add headings named Course, Credits, Earned and Status (and optionally Course Title, Grade and Term).</li>
                  <li><em>File has no data rows</em>: add the units underneath the headings.</li>
                  <li><em>Select an xlsx file to import</em>: choose a .xlsx file. Older .xls and .csv files are not read.</li>
                </ul>
                Also check the intake year and semester before pressing Load.
              </Fix>
              <Fix problem="It says No Major Detected">
                Nothing the student has taken points to one major yet, or no planner is close enough. See Reading the
                results. Choose a planner yourself with <em>Match against a different planner</em>.
              </Fix>
              <Fix problem="The credits reach 300 but the student is INELIGIBLE">
                The sentence under INELIGIBLE says why. Look for a core or major unit not passed, the work placement, too
                few electives, a unit still in progress, or more than one Conceded Pass. Check the <em>Other requirements</em> card.
              </Fix>
              <Fix problem="Student Pathway says “No student loaded”, or only “unplanned units”">
                Load a student on Major Detection first. If the page shows the number of unplanned units, press
                <em> Generate Custom Pathway</em>. To carry on with a saved plan, use <em>Import plan (Excel or PDF)</em>.
              </Fix>
              <Fix problem="The pathway starts later than expected">
                It starts at the next real semester after the latest one on the transcript, so a gap in study counts as time
                passed. If nothing the student still needs runs in that semester, the plan starts in the one after.
                Pre-enrolled (“Future”) units are planned again and do not count as done.
              </Fix>
              <Fix problem="A unit in the pathway has a warning">
                It is over the normal load of 4 units, in a semester it does not run in, or before its prerequisites. Use the
                list beside the unit to move it, or press Regenerate Pathway.
              </Fix>
              <Fix problem="The copilot says the AI model is not downloaded, or Ollama is not running">
                See the box under The AI copilot: download the model once, or wait and press Check again.
              </Fix>
              <Fix problem="The copilot says it needs the student portal">
                Questions about a student read live portal data. Log in from the sidebar and ask again.
              </Fix>
              <Fix problem="Class Estimation will not read transcripts">
                The Portal option needs a portal login. Without one, choose Imported DPA and pick a folder of exported files.
              </Fix>
              <Fix problem="A planner or unit looks wrong">
                Open it on Study Planners (Edit Planner) or on Units (Edit) and correct it. Changes apply to every student
                matched after that.
              </Fix>
            </div>
          </section>

          {/* ───────── Glossary ───────── */}
          <section id="guide-glossary" className={styles.mSection}>
            <SectionTitle icon={BookOpen} classic={classic}>Words used in the app</SectionTitle>
            <dl className={styles.mGlossary}>
              {GLOSSARY.map(([term, meaning]) => (
                <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>
              ))}
            </dl>
          </section>

          {/* ───────── Tips ───────── */}
          <section id="guide-tips" className={styles.mSection}>
            <SectionTitle icon={Lightbulb} classic={classic}>Tips</SectionTitle>
            <ul className={styles.mTips}>
              {TIPS.map((tip) => (
                <li key={tip}><Lightbulb aria-hidden="true" />{tip}</li>
              ))}
            </ul>
          </section>
        </div>

        <nav className={styles.mToc} aria-label="On this page">
          <span className={styles.mTocLabel}>On this page</span>
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
      </div>
    </div>
  );
}

export default function UserGuide() {
  const isMeadow = useDesign() === 'meadow';
  return <Guide classic={!isMeadow} />;
}
