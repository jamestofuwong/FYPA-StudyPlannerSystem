import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import FaqAccordion from './FaqAccordion'
import styles from './page.module.css'

const FAQ_ITEMS = [
  {
    question: 'How do I use the Study Planner?',
    answer:
      'Select a study plan from the Planners page that matches your course, major, and intake year. Each plan shows your units organised by year and semester in a recommended sequence. Click any unit row to view its full details, including learning outcomes, assessment breakdown, and prerequisites.',
  },
  {
    question: 'What do the colour-coded unit categories mean?',
    answer:
      'Units are colour-coded by category: blue for Core units (compulsory for all students in the course), orange for Major Core units (compulsory for your chosen major), green for Elective units (chosen from an elective pool), purple for WIL (Work Integrated Learning), and coral for MPU (Mata Pelajaran Umum, compulsory Malaysian public university units).',
  },
  {
    question: 'What is the Plan Builder and how does it work?',
    answer:
      'The Plan Builder lets you create a personalised study plan. Select your intake, course, and major, then mark any units you have already completed. Click "Generate Study Plan" and the system will produce a recommended plan with your completed units highlighted and the remaining units sequenced for you.',
  },
  {
    question: 'What are prerequisites, co-requisites, and anti-requisites?',
    answer:
      'A prerequisite is a unit you must complete before enrolling in another. A co-requisite is a unit you must be enrolled in at the same time. An anti-requisite is a unit you cannot take if you have already completed a similar one — both units cover overlapping content and only one can count towards your degree.',
  },
  {
    question: 'Can I take units out of the recommended sequence?',
    answer:
      'The sequence in each study plan is a recommendation, not a strict requirement — as long as you satisfy all prerequisites. However, taking units out of sequence may affect your eligibility for subsequent units and can impact your workload balance. Always consult your academic advisor before making changes.',
  },
  {
    question: 'What are credit points?',
    answer:
      'Each unit is worth 12.5 credit points. A standard full-time semester load is 50 credit points (4 units). A three-year bachelor degree typically requires 300 credit points (24 units), and a four-year degree requires 400 credit points (32 units).',
  },
  {
    question: 'What are MPU units?',
    answer:
      'MPU stands for Mata Pelajaran Umum — compulsory subjects mandated by the Malaysian Ministry of Higher Education for all students at Malaysian universities. Common MPU units include Bahasa Melayu and Hubungan Etnik (Ethnic Relations). These are graded on a pass/fail basis and do not contribute to your GPA.',
  },
  {
    question: 'What is WIL (Work Integrated Learning)?',
    answer:
      'Work Integrated Learning is an industry placement unit where you apply your academic knowledge in a real workplace environment. It is typically completed in the final year of your degree and is compulsory for most courses. You will be placed with an industry partner for a set number of weeks.',
  },
  {
    question: 'What is a prescribed elective?',
    answer:
      'A prescribed elective is a specific unit that is compulsory for your course or major, even though it falls under the "elective" category. Unlike a free elective, you cannot substitute it with another unit. Prescribed electives are marked with an asterisk (*) in your study plan.',
  },
  {
    question: 'How do I choose my elective units?',
    answer:
      'Each study plan includes an Elective Pool — a curated list of units recommended for your course. You may choose from this pool to fill your open elective slots. Some electives are only available in certain months, so check the availability listed on each unit\'s detail page before enrolling.',
  },
]


export default function HelpPage() {
  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>

        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>Help & Support</h1>
          <p className={styles.heroSubtitle}>
            Find answers to common questions, or reach out through one of our support channels.
          </p>
        </div>

        {/* Two-column layout */}
        <div className={styles.contentGrid}>

          {/* LEFT: FAQ */}
          <section aria-label="Frequently asked questions">
            <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
            <FaqAccordion items={FAQ_ITEMS} />
          </section>

          {/* RIGHT: Sidebar */}
          <aside aria-label="Support channels">
            <h2 className={styles.sectionTitle}>Get in Touch</h2>

            <div className={styles.sidebar}>

              {/* Heads of Department */}
              <Link href="/help/heads-of-department" className={styles.hodCard}>
                <div className={styles.hodCardIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className={styles.hodCardBody}>
                  <div className={styles.hodCardTitle}>Heads of Department</div>
                  <div className={styles.hodCardSubtitle}>
                    View contact details for all department heads across the university.
                  </div>
                </div>
                <svg className={styles.hodCardArrow} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>

              {/* General Enquiries */}
              <div className={styles.channelCard}>
                <div className={styles.channelIcon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className={styles.channelBody}>
                  <div className={styles.channelTitle}>General Enquiries</div>
                  <p className={styles.channelDesc}>For enrolment, fees, timetabling, and general administrative matters.</p>
                  <div className={styles.infoBlock}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Location</span>
                      <span className={styles.infoValue}>Student HQ, A001 – A002</span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Hours</span>
                      <span className={styles.infoValue}>Mon – Fri, 9:00 am – 5:00 pm</span>
                    </div>
                    <div className={styles.infoNote}>Closed on weekends and public holidays</div>
                  </div>
                </div>
              </div>

              {/* IT Help Desk */}
              <div className={styles.channelCard}>
                <div className={styles.channelIcon}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                </div>
                <div className={styles.channelBody}>
                  <div className={styles.channelTitle}>IT Help Desk</div>
                  <p className={styles.channelDesc}>For technical issues with the student portal, Canvas, or this study planner system.</p>
                  <div className={styles.infoBlock}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Tel</span>
                      <span className={styles.infoValue}>+6082 255000</span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Email</span>
                      <a href="mailto:servicedesk@swinburne.edu.my" className={styles.infoLink}>servicedesk@swinburne.edu.my</a>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Location</span>
                      <span className={styles.infoValue}>G003</span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Hours</span>
                      <span className={styles.infoValue}>
                        Mon – Thu: 8:30 am – 5:30 pm<br />
                        Fri: 8:30 am – 12:00 pm, 2:00 pm – 5:30 pm
                      </span>
                    </div>
                    <div className={styles.infoNote}>Closed on weekends and public holidays</div>
                  </div>
                </div>
              </div>

            </div>
          </aside>

        </div>
      </main>
    </div>
  )
}
