import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireSuperadminPage } from '@/lib/cms/access'
import { parsePermissions } from '@/lib/cms/permissions'
import styles from '../../forms.module.css'
import AccountEditor from '../AccountEditor'

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSuperadminPage()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const user = await prisma.cmsUser.findUnique({ where: { id } })
  if (!user) notFound()

  return (
    <div className={styles.page}>
      <h1 className={styles.heading} style={{ marginBottom: 24 }}>Edit account</h1>
      <AccountEditor
        isSelf={user.id === me.id}
        account={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          permissions: parsePermissions(user.permissions),
        }}
      />
    </div>
  )
}
