'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useEffect, FormEvent } from 'react'
import styles from './page.module.css'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default function CmsLoginPage({ searchParams }: Props) {
  const router = useRouter()
  const [next, setNext] = useState('/cms/dashboard')
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    searchParams.then((params) => {
      const nextParam = params.next || '/cms/dashboard'
      setNext(nextParam)

      // Try to auto-refresh session
      fetch('/api/cms/auth/refresh', { method: 'POST' })
        .then((res) => {
          if (res.ok) {
            router.push(nextParam)
          } else {
            setChecking(false)
          }
        })
        .catch(() => {
          setChecking(false)
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/cms/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (res.ok) {
        router.push(next)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Invalid email or password.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Image
            src="/swinburne-logo.jpg"
            alt="Swinburne University of Technology Sarawak"
            width={140}
            height={67}
            style={{ height: 36, width: 'auto' }}
            priority
          />
          <span className={styles.cmsLabel}>CMS</span>
        </div>

        {checking ? (
          <p className={styles.checking}>Checking session&hellip;</p>
        ) : (
          <>
            <h1 className={styles.heading}>Sign in</h1>
            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                className={styles.submit}
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              {error && <div className={styles.error}>{error}</div>}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
