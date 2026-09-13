'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import styles from './CmsSidebar.module.css'

interface Props {
  user: { name: string; email: string }
}

const NAV = [
  { label: 'Dashboard', href: '/cms/dashboard', exact: true },
  { section: 'Content' },
  { label: 'Units', href: '/cms/units' },
  { label: 'Planners', href: '/cms/planners' },
  { section: 'Help' },
  { label: 'FAQ', href: '/cms/help/faq' },
  { label: 'Contacts', href: '/cms/help/contacts' },
  { label: 'Heads of Department', href: '/cms/help/hod' },
] as const

export default function CmsSidebar({ user }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/cms/auth/logout', { method: 'POST' })
    router.push('/cms/login')
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoArea}>
        <Image
          src="/swinburne-logo.jpg"
          alt="Swinburne University of Technology Sarawak"
          width={140}
          height={67}
          className={styles.logoImg}
          priority
        />
        <span className={styles.cmsLabel}>CMS</span>
      </div>

      <nav className={styles.nav} aria-label="CMS navigation">
        {NAV.map((item, i) => {
          if ('section' in item) {
            return (
              <div key={`section-${i}`} className={styles.sectionLabel}>
                {item.section}
              </div>
            )
          }

          const isActive = 'exact' in item && item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className={styles.userArea}>
        <div className={styles.userName}>{user.name}</div>
        <div className={styles.userEmail}>{user.email}</div>
        <button className={styles.logoutBtn} onClick={handleLogout} type="button">
          Sign out
        </button>
      </div>
    </aside>
  )
}
