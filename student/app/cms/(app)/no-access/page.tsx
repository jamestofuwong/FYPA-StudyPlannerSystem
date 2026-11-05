import Link from 'next/link'
import styles from '../forms.module.css'

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const { module } = await searchParams
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>No access</h1>
      <p className={styles.subheading} style={{ marginBottom: 24 }}>
        Your account does not have access to {module ? `the ${module} section` : 'this section'}. Ask a superadmin to change your access.
      </p>
      <Link href="/cms/dashboard" className={styles.btnSecondary}>Back to the dashboard</Link>
    </div>
  )
}
