'use client'

import { useEffect, useState } from 'react'
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

function isTabActive(href: string, path: string) {
  if (href === '/') return path === '/' || path.startsWith('/planners')
  return path === href || path.startsWith(`${href}/`)
}

function isModifiedClick(event: React.MouseEvent) {
  return (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
}

export default function Nav() {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [showSpinner, setShowSpinner] = useState(false)

  useEffect(() => {
    setPendingHref(null)
    setShowSpinner(false)
  }, [pathname])

  useEffect(() => {
    if (!pendingHref) {
      setShowSpinner(false)
      return
    }

    const frame = requestAnimationFrame(() => setShowSpinner(true))
    return () => cancelAnimationFrame(frame)
  }, [pendingHref])

  function onNavigate(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (isModifiedClick(event) || pathname === href) return
    setPendingHref(href)
  }

  const displayPath = pendingHref ?? pathname

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>

          <Link href="/" className={styles.logoLink} onClick={event => onNavigate(event, '/')}>
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
                const active = isTabActive(href, displayPath)
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={event => onNavigate(event, href)}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
          </nav>

        </div>
      </header>

      {showSpinner && (
        <div className={styles.loadingOverlay} role="status" aria-live="polite" aria-label="Loading">
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingLabel}>Loading</span>
        </div>
      )}
    </>
  )
}
