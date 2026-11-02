import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/cms/access'
import CmsSidebar from './CmsSidebar'
import styles from './layout.module.css'

export default async function CmsAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/cms/login')
  }

  return (
    <div className={styles.shell}>
      <CmsSidebar user={{ name: user.name, email: user.email, role: user.role, permissions: user.permissions }} />
      <main className={styles.content}>
        {children}
      </main>
    </div>
  )
}
