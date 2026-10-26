import { getCurrentUser } from '@/lib/cms/access'
import { redirect } from 'next/navigation'
import styles from '../forms.module.css'
import AccountForms from './AccountForms'

export default async function AccountPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/cms/login')
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>My account</h1>
      <p className={styles.subheading} style={{ marginBottom: 24 }}>
        Role: {me.role === 'superadmin' ? 'Superadmin' : 'Admin'}
      </p>
      <AccountForms name={me.name} email={me.email} />
    </div>
  )
}
