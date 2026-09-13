import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import styles from './page.module.css'
import { prisma } from '@/lib/prisma'

export default async function HeadsOfDepartmentPage() {
  const hods = await prisma.headOfDepartment.findMany({
    orderBy: [{ position: 'asc' }],
  })

  // Group by faculty, preserving the order they appear in the sorted list
  const grouped: { faculty: string; heads: typeof hods }[] = []
  for (const hod of hods) {
    const existing = grouped.find(g => g.faculty === hod.faculty)
    if (existing) {
      existing.heads.push(hod)
    } else {
      grouped.push({ faculty: hod.faculty, heads: [hod] })
    }
  }

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
        {grouped.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>No heads of department have been added yet.</p>
        ) : (
          <div className={styles.groups}>
            {grouped.map(group => (
              <section key={group.faculty} className={styles.group}>
                <h2 className={styles.facultyTitle}>{group.faculty}</h2>

                <div className={styles.table}>
                  <div className={styles.colHeaders}>
                    <span>Department</span>
                    <span>Head of Department</span>
                    <span>Email</span>
                  </div>
                  {group.heads.map(hod => (
                    <div key={hod.id} className={styles.row}>
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
        )}

      </main>
    </div>
  )
}
