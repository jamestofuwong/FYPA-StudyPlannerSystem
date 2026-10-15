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

// ── Meadow: the guide is organised by the jobs people come to the app to do ──

const JOBS = [
  {
    icon: GraduationCap,
    title: 'Advise a student',
    steps: [
      'Log in to the portal from the card at the bottom of the sidebar. A browser window opens for the university sign-in.',
      'On Major Detection, search for the student’s ID.',
      'Read the best-matching planner, the graduation requirements and the unit plan.',
      'Open Student Pathway to plan the semesters that are left.',
    ],
    link: { href: '/dashboard', label: 'Open Major Detection' },
  },
  {
    icon: FileSpreadsheet,
    title: 'Check a transcript without the portal',
    steps: [
      'On Major Detection, choose Import.',
      'Upload an Excel transcript, add the units one by one, or paste a table.',
      'Set the intake year and semester, then read the matches as for a portal student.',
    ],
    link: { href: '/dashboard', label: 'Open Major Detection' },
  },
  {
    icon: FileUp,
    title: 'Add a study planner',
    steps: [
      'Open Data Import and choose the official study planner PDF.',
      'Read it, then check the course, intake and units it found.',
      'Confirm and save. The planner then appears under Study Planners.',
    ],
    note: 'Planners parsed in the cloud app can be pulled in from Cloud Sync instead.',
    link: { href: '/import', label: 'Open Data Import' },
  },
  {
    icon: ChartColumn,
    title: 'Estimate class sizes',
    steps: [
      'On Class Estimation, load the current students from the portal or from DPA files.',
      'Run the estimate for next semester.',
      'Save it, then share the Head of Department view.',
    ],
    link: { href: '/class-estimation', label: 'Open Class Estimation' },
  },
  {
    icon: Layers,
    title: 'Look after course data',
    steps: [
      'Study Planners lists every planner by course and intake. Open one to see or edit its units.',
      'Units holds the unit catalogue. Add a unit, or correct its details and offering times.',
    ],
    link: { href: '/units', label: 'Open Units' },
  },
  {
    icon: Sparkles,
    title: 'Ask the AI copilot',
    steps: [
      'The copilot runs on this computer through Ollama, which needs to be running.',
      'The first time, download its model from the copilot page (about 2 GB).',
      'Ask about a student’s major or progress, or about planners and units.',
    ],
    link: { href: '/copilot', label: 'Open AI Copilot' },
  },
];

const LAYOUT = [
  { icon: PanelLeft, title: 'Sidebar', text: 'Pages are grouped by job: Advising, Course data, Assistant and Reports. The button beside the app name shrinks it to icons.' },
  { icon: AppWindow, title: 'Tabs', text: 'Every page you open stays as a tab above the content. Click a tab to switch, drag it to reorder, or press × to close it.' },
  { icon: Globe, title: 'Portal status', text: 'The card at the bottom of the sidebar shows whether the student portal is connected, with the button to log in or out.' },
  { icon: Palette, title: 'Design and colours', text: 'Switch between the Meadow and Classic designs, or between light and dark, in Settings.' },
];

const TIPS = [
  'Keep Major Detection open in one tab and Study Planners in another to compare a student’s units with a planner.',
  'In a study planner, the category badges (Core, Major Core, Elective, MPU) show the mix of units a student needs to graduate.',
  'Class Estimation remembers the returning-students percentage, so it only needs changing when the outlook does.',
];

function MeadowGuide() {
  return (
    <div className={styles.mPanel}>
      <PageHeader
        title="User guide"
        description="The quickest way through the jobs this workspace is for, and where to find things."
      />
      <div className={styles.mLayout}>
        <div className={styles.mMain}>
          <section id="guide-jobs" className={styles.mSection}>
            <h2 className={styles.mSectionTitle}>Common jobs</h2>
            <div className={styles.mJobGrid}>
              {JOBS.map(({ icon: Icon, title, steps, note, link }) => (
                <article key={title} className={styles.mJob}>
                  <div className={styles.mJobHead}>
                    <span className={styles.mJobIcon} aria-hidden="true"><Icon /></span>
                    <h3 className={styles.mJobTitle}>{title}</h3>
                  </div>
                  <ol className={styles.mSteps}>
                    {steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  {note && <p className={styles.mNote}>{note}</p>}
                  <Link href={link.href} className={styles.mJobLink}>
                    {link.label} <ArrowRight aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section id="guide-layout" className={styles.mSection}>
            <h2 className={styles.mSectionTitle}>Getting around</h2>
            <div className={styles.mLayoutList}>
              {LAYOUT.map(({ icon: Icon, title, text }) => (
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

          <section id="guide-tips" className={styles.mSection}>
            <h2 className={styles.mSectionTitle}>Tips</h2>
            <ul className={styles.mTips}>
              {TIPS.map((tip) => (
                <li key={tip}><Lightbulb aria-hidden="true" />{tip}</li>
              ))}
            </ul>
          </section>
        </div>

        <nav className={styles.mToc} aria-label="On this page">
          <span className={styles.mTocLabel}>On this page</span>
          <a href="#guide-jobs">Common jobs</a>
          <a href="#guide-layout">Getting around</a>
          <a href="#guide-tips">Tips</a>
        </nav>
      </div>
    </div>
  );
}

export default function UserGuide() {
  const isMeadow = useDesign() === 'meadow';
  if (isMeadow) return <MeadowGuide />;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <BookOpen size={40} color="var(--guide-icon, #3b82f6)" /> User Documentation
        </h1>
        <p className={styles.subtitle}>
          Master the Study Planner System's automated features.
        </p>
      </header>

      {/* --- FEATURE OVERVIEW --- */}
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={`${styles.cardHeader} ${styles.authHeader}`}>
            <ShieldCheck /> 1. Secure Data Import
          </h2>
          <p className={styles.cardContent}>
            Begin by navigating to the <strong>Data Import</strong> page. You can securely upload your official PDF transcript to populate your academic history. All file processing is done strictly locally to ensure your complete data privacy.
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardHeader} style={{ color: 'var(--guide-ai, #c084fc)' }}>
            <Bot /> 2. Automated OCR Extraction (Optional)
          </h2>
          <p className={styles.cardContent}>
            Want to save time? Our intelligent Python-based OCR engine automatically parses your uploaded PDF transcripts. If you choose this automated feature, ensure the status bar displays <strong style={{ color: 'var(--guide-ok, #4ade80)' }}>"Python OCR Engine Active"</strong>. Otherwise, you can safely skip this and manually input your progress!
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={`${styles.cardHeader} ${styles.detectHeader}`}>
            <Search /> 3. Automatic Detection
          </h2>
          <p className={styles.cardContent}>
            Once your history is imported, navigate to <strong>Major Detection</strong>. The system
            calculates your progress against the core majors to suggest your current academic path and completion status.
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={`${styles.cardHeader} ${styles.aiHeader}`}>
            <BookOpen /> 4. Interactive Study Planners
          </h2>
          <p className={styles.cardContent}>
            Browse detailed course structures tailored to your intake. Filter by major to view prescribed core units, electives, and MPU requirements to carefully plan your academic journey.
          </p>
        </div>
      </div>

      <div className={styles.divider}></div>

      {/* --- NAVIGATING THE UI --- */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}><Compass /> Navigating the Interface</h3>
        <div className={styles.list}>
          <div className={styles.listItem}>
            <div className={styles.iconWrapper}><Search size={24} /></div>
            <div className={styles.itemContent}>
              <h4>The Explorer (Sidebar)</h4>
              <p>Use the left sidebar to jump between core tools. You can use the Search Bar at the top to quickly find specific pages like "Study Planners".</p>
            </div>
          </div>
          <div className={styles.listItem}>
            <div className={styles.iconWrapper}><AppWindow size={24} /></div>
            <div className={styles.itemContent}>
              <h4>Tab Management (Top Bar)</h4>
              <p>Just like a code editor, you can keep multiple pages open. Click a tab to switch views, drag to rearrange your workspace, or click the '×' to close it.</p>
            </div>
          </div>
          <div className={styles.listItem}>
            <div className={styles.iconWrapper}><Activity size={24} /></div>
            <div className={styles.itemContent}>
              <h4>Status Indicators (Bottom Bar)</h4>
              <p>Always check the bottom bar before starting an automated task. It confirms your database connection and ensures the Python Engine is active.</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- STEP-BY-STEP WORKFLOW --- */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}><ListOrdered /> Step-by-Step Workflow</h3>
          <div className={styles.list}>

            <div className={styles.listItem}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.itemContent}>
                <h4>Obtain Your Transcript</h4>
                <ul className={styles.subList}>
                  <li><strong>Action:</strong> Download your official academic history or transcript as a PDF document.</li>
                  <li><strong>Privacy:</strong> This file will only be processed locally on your device and is never uploaded to the cloud.</li>
                </ul>
              </div>
            </div>

            <div className={styles.listItem}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.itemContent}>
                <h4>Import Your Transcript</h4>
                <ul className={styles.subList}>
                  <li><strong>Prerequisite:</strong> Ensure the status bar reads <span style={{color: 'var(--guide-ok, #4ade80)'}}>"Python OCR Engine Active"</span>.</li>
                  <li><strong>Navigate:</strong> Open the Data Import page from the left Explorer.</li>
                  <li><strong>Action:</strong> Upload your PDF to allow the system to extract your academic history and securely save it to your local database.</li>
                </ul>
              </div>
            </div>

            <div className={styles.listItem}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.itemContent}>
                <h4>Analyze Your Progress</h4>
                <ul className={styles.subList}>
                  <li><strong>Navigate:</strong> Open the Major Detection tab.</li>
                  <li><strong>Action:</strong> Review the generated progress bars.</li>
                  <li><strong>Detail:</strong> The system automatically cross-references your imported units against the core IT majors to highlight which path you are closest to completing.</li>
                </ul>
              </div>
            </div>

            <div className={styles.listItem}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.itemContent}>
              <h4>Review Your Study Plan</h4>
              <ul className={styles.subList}>
                <li><strong>Navigate:</strong> Open the Study Planners tab.</li>
                <li><strong>Action:</strong> Select your specific major and intake year from the left panel.</li>
                <li><strong>Detail:</strong> Review the complete list of units you need to take, paying attention to the specific categories (Core, Elective, MPU) required for graduation.</li>
              </ul>
            </div>
          </div>

          </div>
        </section>

      {/* --- PRO TIPS --- */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}><Lightbulb /> Pro Tips for Best Results</h3>
        <div className={styles.proTipGrid}>
          <div className={styles.proTipCard}>
              <Lightbulb className={styles.proTipIcon} size={20} />
              <div className={styles.proTipContent}>
                <p><strong>Check Unit Categories:</strong> When viewing a Study Planner, pay close attention to the purple badges (CORE, ELECTIVE, MPU). This helps ensure you are enrolling in the right mix of units for your specific semester.</p>
              </div>
          </div>
          <div className={styles.proTipCard}>
            <AppWindow className={styles.proTipIcon} size={20} />
            <div className={styles.proTipContent}>
              <p><strong>Keep Tabs Open:</strong> You can keep the "Major Detection" tab open while exploring the "Study Planners" tab to easily cross-reference your required units.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}