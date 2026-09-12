import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import styles from './page.module.css'

// TODO: replace stubs with real data from the CMS or database
const DEPARTMENTS = [
  {
    faculty: 'Faculty A',
    heads: [
      { department: 'Department 1', name: 'Head of Department', email: 'hod1@swinburne.edu.my' },
      { department: 'Department 2', name: 'Head of Department', email: 'hod2@swinburne.edu.my' },
      { department: 'Department 3', name: 'Head of Department', email: 'hod3@swinburne.edu.my' },
    ],
  },
  {
    faculty: 'Faculty B',
    heads: [
      { department: 'Department 1', name: 'Head of Department', email: 'hod4@swinburne.edu.my' },
      { department: 'Department 2', name: 'Head of Department', email: 'hod5@swinburne.edu.my' },
    ],
  },
  {
    faculty: 'Faculty C',
    heads: [
      { department: 'Department 1', name: 'Head of Department', email: 'hod6@swinburne.edu.my' },
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
