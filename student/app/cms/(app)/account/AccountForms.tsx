'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../forms.module.css'
import { changePassword, updateProfile, type ActionResult } from './actions'

function Message({ result }: { result: ActionResult | null }) {
  if (!result) return null
  return <p className={result.ok ? styles.success : styles.error} role={result.ok ? 'status' : 'alert'}>{result.ok ? result.message : result.error}</p>
}

export default function AccountForms({ name, email }: { name: string; email: string }) {
  const router = useRouter()
  const [profileResult, setProfileResult] = useState<ActionResult | null>(null)
  const [passwordResult, setPasswordResult] = useState<ActionResult | null>(null)
  const [pendingProfile, startProfile] = useTransition()
  const [pendingPassword, startPassword] = useTransition()

  function onProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startProfile(async () => {
      const result = await updateProfile({
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        currentPassword: String(data.get('currentPassword') ?? ''),
      })
      setProfileResult(result)
      if (result.ok) {
        form.reset()
        router.refresh()
      }
    })
  }

  function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startPassword(async () => {
      const result = await changePassword({
        currentPassword: String(data.get('currentPassword') ?? ''),
        newPassword: String(data.get('newPassword') ?? ''),
        confirmPassword: String(data.get('confirmPassword') ?? ''),
      })
      setPasswordResult(result)
      if (result.ok) form.reset()
    })
  }

  return (
    <>
      <form className={styles.card} onSubmit={onProfile}>
        <h2 className={styles.cardHeading}>Name and email</h2>
        <Message result={profileResult} />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="acc-name">Name</label>
          <input id="acc-name" name="name" className={styles.input} defaultValue={name} required maxLength={255} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="acc-email">Email</label>
          <input id="acc-email" name="email" type="email" className={styles.input} defaultValue={email} required maxLength={255} />
          <span className={styles.hint}>You sign in with this email.</span>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="acc-current">Current password</label>
          <input id="acc-current" name="currentPassword" type="password" className={styles.input} autoComplete="current-password" required />
          <span className={styles.hint}>Needed to confirm that it is you.</span>
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={pendingProfile}>{pendingProfile ? 'Saving…' : 'Save details'}</button>
      </form>

      <form className={styles.card} onSubmit={onPassword}>
        <h2 className={styles.cardHeading}>Change password</h2>
        <Message result={passwordResult} />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pw-current">Current password</label>
          <input id="pw-current" name="currentPassword" type="password" className={styles.input} autoComplete="current-password" required />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pw-new">New password</label>
          <input id="pw-new" name="newPassword" type="password" className={styles.input} autoComplete="new-password" required minLength={10} maxLength={128} />
          <span className={styles.hint}>At least 10 characters.</span>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" name="confirmPassword" type="password" className={styles.input} autoComplete="new-password" required />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={pendingPassword}>{pendingPassword ? 'Saving…' : 'Change password'}</button>
      </form>
    </>
  )
}
