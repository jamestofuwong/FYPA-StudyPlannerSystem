'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/cms/auth'
import { getCurrentUser } from '@/lib/cms/access'
import { reissueSession } from '@/lib/cms/issueSession'
import { checkRateLimit, resetRateLimit } from '@/lib/cms/rateLimit'
import { ChangePasswordSchema, ProfileSchema } from '@/lib/cms/schemas'

export type ActionResult = { ok: true; message: string } | { ok: false; error: string }

/** Checks the current password. Counts failures, so this form cannot be used to guess the password. */
async function confirmPassword(userId: string, hash: string, password: string): Promise<string | null> {
  const key = `account:${userId}`
  const limit = checkRateLimit(key)
  if (limit.limited) return `Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`
  if (!(await verifyPassword(password, hash))) return 'The current password is not correct.'
  resetRateLimit(key)
  return null
}

export async function updateProfile(input: { name: string; email: string; currentPassword: string }): Promise<ActionResult> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'You are signed out. Sign in again.' }

  const parsed = ProfileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid details' }
  const { name, email, currentPassword } = parsed.data

  const row = await prisma.cmsUser.findUnique({ where: { id: me.id } })
  if (!row) return { ok: false, error: 'Account not found.' }

  const wrong = await confirmPassword(me.id, row.password_hash, currentPassword)
  if (wrong) return { ok: false, error: wrong }

  const taken = await prisma.cmsUser.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, NOT: { id: me.id } },
    select: { id: true },
  })
  if (taken) return { ok: false, error: 'Another account already uses this email.' }

  const updated = await prisma.cmsUser.update({ where: { id: me.id }, data: { name, email } })
  // The access token holds the email and name, so give this browser a new one.
  await reissueSession(updated)
  console.info(`[CMS] account:profile_updated id=${me.id} email=${email}`)
  revalidatePath('/cms', 'layout')
  return { ok: true, message: 'Your details are saved.' }
}

export async function changePassword(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<ActionResult> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'You are signed out. Sign in again.' }

  const parsed = ChangePasswordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid password' }

  const row = await prisma.cmsUser.findUnique({ where: { id: me.id } })
  if (!row) return { ok: false, error: 'Account not found.' }

  const wrong = await confirmPassword(me.id, row.password_hash, parsed.data.currentPassword)
  if (wrong) return { ok: false, error: wrong }

  const updated = await prisma.cmsUser.update({
    where: { id: me.id },
    data: { password_hash: await hashPassword(parsed.data.newPassword) },
  })
  // Every other browser that was signed in with the old password is signed out. This one stays signed in.
  await reissueSession(updated)
  console.info(`[CMS] account:password_changed id=${me.id}`)
  return { ok: true, message: 'Your password is changed. Other devices are signed out.' }
}
