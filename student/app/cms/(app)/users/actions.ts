'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/cms/auth'
import { requireSuperadmin } from '@/lib/cms/access'
import { permissionsToStore } from '@/lib/cms/permissions'
import { CreateAccountSchema, UpdateAccountSchema } from '@/lib/cms/schemas'

export type UserActionResult = { ok: true; id?: string } | { ok: false; error: string }

async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  const found = await prisma.cmsUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  })
  return found !== null
}

/** True when changing this account would leave no active superadmin. */
async function wouldRemoveLastSuperadmin(id: string): Promise<boolean> {
  const others = await prisma.cmsUser.count({ where: { role: 'superadmin', active: true, NOT: { id } } })
  return others === 0
}

export async function createAccount(input: unknown): Promise<UserActionResult> {
  const me = await requireSuperadmin()
  const parsed = CreateAccountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' }
  const d = parsed.data
  if (await emailTaken(d.email)) return { ok: false, error: 'An account with this email already exists.' }

  const user = await prisma.cmsUser.create({
    data: {
      email: d.email,
      name: d.name,
      password_hash: await hashPassword(d.password),
      role: d.role,
      permissions: permissionsToStore(d.role, d.permissions),
    },
  })
  console.info(`[CMS] account:created id=${user.id} role=${d.role} by=${me.email}`)
  revalidatePath('/cms/users')
  return { ok: true, id: user.id }
}

export async function updateAccount(id: string, input: unknown): Promise<UserActionResult> {
  const me = await requireSuperadmin()
  const parsed = UpdateAccountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' }
  const d = parsed.data

  const target = await prisma.cmsUser.findUnique({ where: { id } })
  if (!target) return { ok: false, error: 'Account not found.' }
  if (await emailTaken(d.email, id)) return { ok: false, error: 'An account with this email already exists.' }

  const losesSuperadmin = target.role === 'superadmin' && target.active && (d.role !== 'superadmin' || !d.active)
  if (losesSuperadmin && (id === me.id || (await wouldRemoveLastSuperadmin(id)))) {
    return {
      ok: false,
      error: id === me.id
        ? 'You cannot remove your own superadmin access or deactivate your own account. Ask another superadmin.'
        : 'There must be at least one active superadmin.',
    }
  }
  if (id === me.id && !d.active) return { ok: false, error: 'You cannot deactivate your own account.' }

  await prisma.cmsUser.update({
    where: { id },
    data: {
      name: d.name,
      email: d.email,
      role: d.role,
      active: d.active,
      permissions: permissionsToStore(d.role, d.permissions),
      ...(d.newPassword ? { password_hash: await hashPassword(d.newPassword) } : {}),
    },
  })
  // A new password or a deactivation ends the sessions of that person.
  if (d.newPassword || !d.active) await prisma.cmsRefreshToken.deleteMany({ where: { user_id: id } })

  console.info(`[CMS] account:updated id=${id} role=${d.role} active=${d.active} by=${me.email}`)
  revalidatePath('/cms/users')
  revalidatePath(`/cms/users/${id}`)
  return { ok: true, id }
}

export async function deleteAccount(id: string): Promise<UserActionResult> {
  const me = await requireSuperadmin()
  if (id === me.id) return { ok: false, error: 'You cannot delete your own account.' }
  const target = await prisma.cmsUser.findUnique({ where: { id } })
  if (!target) return { ok: false, error: 'Account not found.' }
  if (target.role === 'superadmin' && target.active && (await wouldRemoveLastSuperadmin(id))) {
    return { ok: false, error: 'There must be at least one active superadmin.' }
  }
  await prisma.cmsUser.delete({ where: { id } })
  console.info(`[CMS] account:deleted id=${id} by=${me.email}`)
  revalidatePath('/cms/users')
  return { ok: true }
}
