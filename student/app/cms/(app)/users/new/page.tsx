import { requireSuperadminPage } from '@/lib/cms/access'
import styles from '../../forms.module.css'
import AccountEditor from '../AccountEditor'

export default async function NewAccountPage() {
  await requireSuperadminPage()
  return (
    <div className={styles.page}>
      <h1 className={styles.heading} style={{ marginBottom: 24 }}>New account</h1>
      <AccountEditor />
    </div>
  )
}
