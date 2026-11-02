'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../forms.module.css'
import { ACCESS_LABELS, ACCESS_LEVELS, CMS_MODULES, type AccessLevel, type CmsModule, type Permissions } from '@/lib/cms/permissions'
import { createAccount, deleteAccount, updateAccount, type UserActionResult } from './actions'

interface Props {
  /** Present when an existing account is edited. */
  account?: {
    id: string
    name: string
    email: string
    role: 'superadmin' | 'admin'
    active: boolean
    permissions: Permissions
  }
  isSelf?: boolean
}

export default function AccountEditor({ account, isSelf = false }: Props) {
  const router = useRouter()
  const editing = account !== undefined
  const [role, setRole] = useState<'superadmin' | 'admin'>(account?.role ?? 'admin')
  const [permissions, setPermissions] = useState<Record<CmsModule, AccessLevel>>(
    () => account?.permissions ?? (Object.fromEntries(CMS_MODULES.map(m => [m.key, 'none'])) as Record<CmsModule, AccessLevel>),
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const common = {
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        role,
        permissions,
      }
      let result: UserActionResult
      if (editing) {
        result = await updateAccount(account.id, {
          ...common,
          active: data.get('active') === 'on',
          newPassword: String(data.get('newPassword') ?? ''),
        })
      } else {
        result = await createAccount({ ...common, password: String(data.get('password') ?? '') })
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (editing) {
        setSaved(true)
        router.refresh()
      } else {
        router.push('/cms/users')
      }
    })
  }

  function onDelete() {
    if (!account || !window.confirm(`Delete the account ${account.email}? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      const result = await deleteAccount(account.id)
      if (!result.ok) setError(result.error)
      else router.push('/cms/users')
    })
  }

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {saved && <p className={styles.success} role="status">The account is saved.</p>}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="u-name">Name</label>
        <input id="u-name" name="name" className={styles.input} defaultValue={account?.name ?? ''} required maxLength={255} />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="u-email">Email</label>
        <input id="u-email" name="email" type="email" className={styles.input} defaultValue={account?.email ?? ''} required maxLength={255} />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={editing ? 'u-newpw' : 'u-pw'}>{editing ? 'New password' : 'Password'}</label>
        <input
          id={editing ? 'u-newpw' : 'u-pw'}
          name={editing ? 'newPassword' : 'password'}
          type="password"
          className={styles.input}
          autoComplete="new-password"
          required={!editing}
          minLength={editing ? undefined : 10}
          maxLength={128}
        />
        <span className={styles.hint}>
          {editing ? 'Leave empty to keep the current password. Setting one signs the person out everywhere.' : 'At least 10 characters. Tell the person to change it after the first sign-in.'}
        </span>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="u-role">Role</label>
        <select id="u-role" className={styles.select} value={role} onChange={e => setRole(e.target.value as 'superadmin' | 'admin')} disabled={isSelf}>
          <option value="admin">Admin: access is set per section</option>
          <option value="superadmin">Superadmin: full access and manages accounts</option>
        </select>
        {isSelf && <span className={styles.hint}>You cannot change your own role.</span>}
      </div>

      {role === 'admin' ? (
        <fieldset className={styles.readOnlyFieldset} style={{ marginBottom: 16 }}>
          <legend className={styles.label} style={{ marginBottom: 8 }}>Access per section</legend>
          <table className={styles.permTable}>
            <thead>
              <tr><th>Section</th><th>Access</th></tr>
            </thead>
            <tbody>
              {CMS_MODULES.map(m => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td>
                    {ACCESS_LEVELS.map(level => (
                      <label key={level} className={styles.permChoice}>
                        <input
                          type="radio"
                          name={`perm-${m.key}`}
                          value={level}
                          checked={permissions[m.key] === level}
                          onChange={() => setPermissions(p => ({ ...p, [m.key]: level }))}
                        />
                        {ACCESS_LABELS[level]}
                      </label>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      ) : (
        <p className={styles.notice}>A superadmin can view and edit every section and manage accounts.</p>
      )}

      {editing && (
        <div className={styles.field}>
          <label className={styles.permChoice}>
            <input type="checkbox" name="active" defaultChecked={account.active} disabled={isSelf} />
            Account is active (an inactive account cannot sign in)
          </label>
          {isSelf && <input type="hidden" name="active" value="on" />}
        </div>
      )}

      <div className={styles.row}>
        <button type="submit" className={styles.btnPrimary} disabled={pending}>{pending ? 'Saving…' : editing ? 'Save account' : 'Create account'}</button>
        <button type="button" className={styles.btnSecondary} onClick={() => router.push('/cms/users')}>Back</button>
        {editing && !isSelf && <button type="button" className={styles.btnDanger} onClick={onDelete} disabled={pending}>Delete account</button>}
      </div>
    </form>
  )
}
