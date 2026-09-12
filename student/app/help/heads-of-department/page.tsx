import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import styles from './page.module.css'

const DEPARTMENTS = [
  {
    faculty: 'Faculty of Engineering, Computing & Science',
    heads: [
      {
        department: 'School of Computing & Technology',
        name: 'Assoc. Prof. Dr. Lee Sze Wei',
        email: 'swlee@swinburne.edu.my',
      },
      {
        department: 'School of Engineering (Chemical)',
        name: 'Dr. Tham Hui Juan',
        email: 'hjtham@swinburne.edu.my',
      },
      {
        department: 'School of Engineering (Civil & Construction)',
        name: 'Assoc. Prof. Dr. Wong Sing Yee',
        email: 'sywong@swinburne.edu.my',
      },
      {
        department: 'School of Engineering (Electrical & Electronic)',
        name: 'Dr. Marcus Yong Keng Wah',
        email: 'mkyong@swinburne.edu.my',
      },
      {
        department: 'School of Engineering (Mechanical)',
        name: 'Dr. Lau Hieng Ho',
        email: 'hhlau@swinburne.edu.my',
      },
    ],
  },
  {
    faculty: 'Faculty of Business, Design & Arts',
    heads: [
      {
        department: 'School of Business',
        name: 'Assoc. Prof. Dr. Faridah Haji Abdul Rani',
        email: 'fhrani@swinburne.edu.my',
      },
      {
        department: 'School of Accounting & Finance',
        name: 'Dr. Lim Siew Eng',
        email: 'selim@swinburne.edu.my',
      },
      {
        department: 'School of Design & Creative Arts',
        name: 'Dr. Patrick Hang Hui Then',
        email: 'phthen@swinburne.edu.my',
      },
    ],
  },
  {
    faculty: 'Faculty of Social Sciences & Humanities',
    heads: [
      {
        department: 'School of Media & Communication',
        name: 'Dr. Florinda Mateos-Aparicio',
        email: 'fmapario@swinburne.edu.my',
      },
      {
        department: 'School of Psychology',
        name: 'Dr. Tan Chee Seng',
        email: 'cstan@swinburne.edu.my',
      },
    ],
  },
  {
    faculty: 'Centre for Foundation Studies',
    heads: [
      {
        department: 'Foundation Studies',
        name: 'Dr. Cynthia Lau Hui Chieh',
        email: 'clau@swinburne.edu.my',
      },
    ],
  },
]

export default function HeadsOfDepartmentPage() {
  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>

        {/* Breadcrumb */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/help" className={styles.breadcrumbLink}>Help & Support</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>Heads of Department</span>
        </nav>

        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>Heads of Department</h1>
          <p className={styles.heroSubtitle}>
            Contact the head of your department directly for academic enquiries, unit approvals, and course-related matters.
          </p>
        </div>

        {/* Department groups */}
        <div className={styles.groups}>
          {DEPARTMENTS.map(group => (
            <section key={group.faculty} className={styles.group}>
              <h2 className={styles.facultyTitle}>{group.faculty}</h2>

              <div className={styles.table}>
                <div className={styles.colHeaders}>
                  <span>Department</span>
                  <span>Head of Department</span>
                  <span>Email</span>
                </div>
                {group.heads.map(hod => (
                  <div key={hod.email} className={styles.row}>
                    <span className={styles.cellDept}>{hod.department}</span>
                    <span className={styles.cellName}>{hod.name}</span>
                    <a href={`mailto:${hod.email}`} className={styles.cellEmail}>
                      {hod.email}
                    </a>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

      </main>
    </div>
  )
}
