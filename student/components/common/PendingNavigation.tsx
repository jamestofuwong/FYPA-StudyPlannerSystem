'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import styles from './PendingNavigation.module.css'

const NAVIGATION_TIMEOUT_MS = 8000

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

function PendingNavigationOverlay({ label }: { label: string }) {
  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-label={label}>
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  )
}

export function usePendingNavigation(label: string) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const activePendingHref = pendingHref && pendingHref !== pathname ? pendingHref : null

  useEffect(() => {
    if (!activePendingHref) return

    const timeout = window.setTimeout(() => {
      setPendingHref(null)
    }, NAVIGATION_TIMEOUT_MS)

    return () => window.clearTimeout(timeout)
  }, [activePendingHref])

  function push(href: string) {
    if (pathname === href) return
    setPendingHref(href)
    router.push(href)
  }

  const overlay = activePendingHref ? <PendingNavigationOverlay label={label} /> : null

  return { push, overlay, activePendingHref }
}

interface PendingLinkProps {
  href: string
  label: string
  className?: string
  ariaLabel?: string
  children: React.ReactNode
}

export function PendingLink({ href, label, className, ariaLabel, children }: PendingLinkProps) {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const activePendingHref = pendingHref && pendingHref !== pathname ? pendingHref : null

  useEffect(() => {
    if (!activePendingHref) return

    const timeout = window.setTimeout(() => {
      setPendingHref(null)
    }, NAVIGATION_TIMEOUT_MS)

    return () => window.clearTimeout(timeout)
  }, [activePendingHref])

  return (
    <>
      <Link
        href={href}
        prefetch={false}
        className={className}
        aria-label={ariaLabel}
        onClick={event => {
          if (isModifiedClick(event) || pathname === href) return
          setPendingHref(href)
        }}
      >
        {children}
      </Link>
      {activePendingHref && <PendingNavigationOverlay label={label} />}
    </>
  )
}
