import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { requireSuperadminPage } from '@/lib/cms/access'
import { ACCESS_LABELS, CMS_MODULES, accessFor } from '@/lib/cms/permissions'
import styles from '../forms.module.css'

export default async function UsersPage() {
  const me = await requireSuperadminPage()
  const users = await prisma.cmsUser.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] })

  return (
    <div className={styles.page} style={{ maxWidth: 1100 }}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Accounts</h1>
          <p className={styles.subheading}>{users.length} account{users.length !== 1 ? 's' : ''}. Only a superadmin sees this page.</p>
        </div>
        <Link href="/cms/users/new" className={styles.btnPrimary}>+ New account</Link>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Email</th>
            <th className={styles.th}>Role</th>
            <th className={styles.th}>Access</th>
            <th className={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className={styles.td}>{u.name}{u.id === me.id ? ' (you)' : ''}</td>
              <td className={styles.td}>{u.email}</td>
              <td className={styles.td}>
                <span className={`${styles.badge} ${u.role === 'superadmin' ? styles.badgeSuper : ''}`}>{u.role === 'superadmin' ? 'Superadmin' : 'Admin'}</span>
                {!u.active && <> <span className={`${styles.badge} ${styles.badgeOff}`}>Inactive</span></>}
              </td>
              <td className={styles.td}>
                {u.role === 'superadmin'
                  ? 'Everything'
                  : CMS_MODULES.map(m => `${m.label}: ${ACCESS_LABELS[accessFor(u, m.key)]}`).join(' · ')}
              </td>
              <td className={styles.td}><Link href={`/cms/users/${u.id}`}>Edit</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
