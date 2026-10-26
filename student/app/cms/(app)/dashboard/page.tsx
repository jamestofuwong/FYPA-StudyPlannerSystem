import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/cms/access'
import styles from './page.module.css'

export default async function CmsDashboardPage() {
  const me = await getCurrentUser()
  const can = (m: 'units' | 'planners' | 'faq' | 'hod') => me !== null && me.permissions[m] !== 'none'

  // Count only what this account may open.
  const [unitCount, plannerCount, faqCount, hodCount] = await Promise.all([
    can('units') ? prisma.unit.count() : null,
    can('planners') ? prisma.plannerTemplate.count() : null,
    can('faq') ? prisma.faqItem.count() : null,
    can('hod') ? prisma.headOfDepartment.count() : null,
  ])

  const stats = [
    { label: 'Units', count: unitCount, href: '/cms/units' },
    { label: 'Planner Templates', count: plannerCount, href: '/cms/planners' },
    { label: 'FAQ Items', count: faqCount, href: '/cms/help/faq' },
    { label: 'Heads of Department', count: hodCount, href: '/cms/help/hod' },
  ].filter((s): s is { label: string; count: number; href: string } => s.count !== null)

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Dashboard</h1>
      <p className={styles.subheading}>Overview of CMS content</p>
      {stats.length === 0 && <p className={styles.subheading}>No sections are assigned to your account yet. Ask a superadmin.</p>}
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
