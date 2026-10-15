import type { Metadata } from 'next'
import Link from 'next/link'
import Nav from '@student/components/Nav/Nav'
import styles from './not-found.module.css'

export const metadata: Metadata = {
  title: 'Page not found | Study Planners',
}

const QUICK_LINKS = [
  { href: '/', label: 'Study Planners' },
  { href: '/units', label: 'Units' },
  { href: '/plan-builder', label: 'Plan Builder' },
  { href: '/help', label: 'Help' },
]

export default function NotFound() {
  return (
    <div className={styles.page}>
      <Nav />
      <main className={styles.main}>
        <section className={styles.panel} aria-labelledby="not-found-title">
          <p className={styles.code}>404</p>
          <h1 id="not-found-title" className={styles.title}>
            Page not found
          </h1>
          <p className={styles.message}>
            The page you are looking for may have moved, been removed, or never existed.
          </p>
          <Link href="/" className={styles.primaryAction}>
            Back to Study Planners
          </Link>
          <nav className={styles.quickLinks} aria-label="Helpful pages">
            {QUICK_LINKS.map(link => (
              <Link key={link.href} href={link.href} className={styles.quickLink}>
                {link.label}
              </Link>
            ))}
          </nav>
        </section>
      </main>
    </div>
  )
}
