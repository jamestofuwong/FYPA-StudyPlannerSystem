'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import styles from './Nav.module.css'

const NAV_ITEMS = [
  { label: 'Planners', href: '/' },
  { label: 'Units', href: '/units' },
  { label: 'Plan Builder', href: '/plan-builder' },
  { label: 'Help', href: '/help' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <header className={styles.header}>
      <div className={styles.inner}>

        <Link href="/" className={styles.logoLink}>
          <Image
            src="/swinburne-logo.jpg"
            alt="Swinburne University of Technology Sarawak"
            width={140}
            height={67}
            className={styles.logo}
            priority
          />
        </Link>

        <nav className={styles.nav} aria-label="Site navigation">
          <div className={styles.navTrack}>
            {NAV_ITEMS.map(({ label, href }) => {
              const active = href === '/'
                ? pathname === '/' || pathname.startsWith('/planners')
                : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>

      </div>
    </header>
  )
}
