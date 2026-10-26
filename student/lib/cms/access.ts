import { cache } from 'react'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSession } from './session'
import {
  accessFor,
  hasAccess,
  type AccessLevel,
  type CmsModule,
  type CmsRoleName,
  type Permissions,
  parsePermissions,
  fullAccess,
} from './permissions'

export interface CmsUserContext {
  id: string
  email: string
  name: string
  role: CmsRoleName
  permissions: Permissions
}

/**
 * The signed-in account, read from the database on every request. The access token only proves who the person is. The
 * role, the permissions and the active flag come from the database, so a change by a superadmin takes effect at once
 * and not when the 15-minute token expires.
 */
export const getCurrentUser = cache(async (): Promise<CmsUserContext | null> => {
  const session = await getSession()
  if (!session) return null
  const user = await prisma.cmsUser.findUnique({ where: { id: session.sub } })
  if (!user || !user.active) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: user.role === 'superadmin' ? fullAccess() : parsePermissions(user.permissions),
  }
})

/** For Server Actions and handlers: throws when the account may not do this. Always call it before any change. */
export async function requireAccess(module: CmsModule, needed: 'view' | 'edit'): Promise<CmsUserContext> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  if (!hasAccess({ ...user, active: true }, module, needed)) throw new Error('Forbidden: you do not have access to do this.')
  return user
}

export async function requireSuperadmin(): Promise<CmsUserContext> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  if (user.role !== 'superadmin') throw new Error('Forbidden: only a superadmin can do this.')
  return user
}

/** For pages: sends the person to the login or to the "no access" page. Returns the account and whether it may edit. */
export async function requirePageAccess(module: CmsModule, needed: 'view' | 'edit' = 'view') {
  const user = await getCurrentUser()
  if (!user) redirect('/cms/login')
  const level: AccessLevel = accessFor({ ...user, active: true }, module)
  if (level === 'none' || (needed === 'edit' && level !== 'edit')) redirect(`/cms/no-access?module=${module}`)
  return { user, canEdit: level === 'edit' }
}

export async function requireSuperadminPage(): Promise<CmsUserContext> {
  const user = await getCurrentUser()
  if (!user) redirect('/cms/login')
  if (user.role !== 'superadmin') redirect('/cms/no-access?module=users')
  return user
}
