import { redirect } from 'next/navigation'
import { getSession } from '@/lib/cms/session'
import CmsSidebar from './CmsSidebar'
import styles from './layout.module.css'

export default async function CmsAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) {
    redirect('/cms/login')
  }

  return (
    <div className={styles.shell}>
      <CmsSidebar user={{ name: session.name, email: session.email }} />
      <main className={styles.content}>
        {children}
      </main>
    </div>
  )
}
