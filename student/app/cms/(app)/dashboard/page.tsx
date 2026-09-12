import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import styles from './page.module.css'

export default async function CmsDashboardPage() {
  const [unitCount, plannerCount, faqCount, hodCount] = await Promise.all([
    prisma.unit.count(),
    prisma.plannerTemplate.count(),
    prisma.faqItem.count(),
    prisma.headOfDepartment.count(),
  ])

  const stats = [
    { label: 'Units', count: unitCount, href: '/cms/units' },
    { label: 'Planner Templates', count: plannerCount, href: '/cms/planners' },
    { label: 'FAQ Items', count: faqCount, href: '/cms/help/faq' },
    { label: 'Heads of Department', count: hodCount, href: '/cms/help/hod' },
  ]

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Dashboard</h1>
      <p className={styles.subheading}>Overview of CMS content</p>
      <div className={styles.grid}>
        {stats.map(({ label, count, href }) => (
          <Link key={href} href={href} className={styles.statCard}>
            <div className={styles.statNumber}>{count}</div>
            <div className={styles.statLabel}>{label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
