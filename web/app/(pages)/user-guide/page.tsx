'use client';

import React from 'react';
import {
  BookOpen, Bot, ShieldCheck, Search, Cpu, ListChecks,
  Compass, AppWindow, Activity, ListOrdered, Lightbulb
} from 'lucide-react';
import styles from './page.module.css';

export default function UserGuide() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <BookOpen size={40} color="#3b82f6" /> User Documentation
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
          <h2 className={styles.cardHeader} style={{ color: '#c084fc' }}>
            <Bot /> 2. Automated OCR Extraction (Optional)
          </h2>
          <p className={styles.cardContent}>
            Want to save time? Our intelligent Python-based OCR engine automatically parses your uploaded PDF transcripts. If you choose this automated feature, ensure the status bar displays <strong style={{ color: '#4ade80' }}>"Python OCR Engine Active"</strong>. Otherwise, you can safely skip this and manually input your progress!
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
                  <li><strong>Prerequisite:</strong> Ensure the status bar reads <span style={{color: '#4ade80'}}>"Python OCR Engine Active"</span>.</li>
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