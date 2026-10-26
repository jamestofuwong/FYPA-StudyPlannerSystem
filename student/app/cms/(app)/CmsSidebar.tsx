'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import styles from './CmsSidebar.module.css'
import type { CmsModule, Permissions } from '@/lib/cms/permissions'

interface Props {
  user: { name: string; email: string; role: 'superadmin' | 'admin'; permissions: Permissions }
}

type NavItem =
  | { section: string }
  | { label: string; href: string; exact?: boolean; module?: CmsModule; superadminOnly?: boolean }

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/cms/dashboard', exact: true },
  { section: 'Content' },
  { label: 'Units', href: '/cms/units', module: 'units' },
  { label: 'Planners', href: '/cms/planners', module: 'planners' },
  { section: 'Help' },
  { label: 'FAQ', href: '/cms/help/faq', module: 'faq' },
  { label: 'Contacts', href: '/cms/help/contacts', module: 'contacts' },
  { label: 'Heads of Department', href: '/cms/help/hod', module: 'hod' },
  { section: 'Administration' },
  { label: 'Accounts', href: '/cms/users', superadminOnly: true },
  { label: 'My account', href: '/cms/account' },
]

/** Leaves out the links that this account cannot open, and the section titles that are left without a link. */
function visibleNav(user: Props['user']): NavItem[] {
  const allowed = NAV.filter(item => {
    if ('section' in item) return true
    if (item.superadminOnly) return user.role === 'superadmin'
    if (item.module) return user.permissions[item.module] !== 'none'
    return true
  })
  return allowed.filter((item, i) => !('section' in item) || (i + 1 < allowed.length && !('section' in allowed[i + 1])))
}

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
        {visibleNav(user).map((item, i) => {
          if ('section' in item) {
            return (
              <div key={`section-${i}`} className={styles.sectionLabel}>
                {item.section}
              </div>
            )
          }

          const isActive = item.exact
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
