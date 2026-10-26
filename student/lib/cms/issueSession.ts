import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_OPTIONS,
  generateRefreshToken,
  hashToken,
  refreshExpiresAt,
  signAccessToken,
} from './auth'

/**
 * Signs the account in again from a Server Action: ends every refresh token the account has, creates a new one and sets
 * fresh cookies. Used after the email, the name or the password changes, so the old sessions stop and this one carries
 * the new details.
 */
export async function reissueSession(user: { id: string; email: string; name: string }): Promise<void> {
  const refreshToken = generateRefreshToken()
  await prisma.$transaction([
    prisma.cmsRefreshToken.deleteMany({ where: { user_id: user.id } }),
    prisma.cmsRefreshToken.create({
      data: { user_id: user.id, token_hash: hashToken(refreshToken), expires_at: refreshExpiresAt() },
    }),
  ])
  const accessToken = await signAccessToken({ sub: user.id, email: user.email, name: user.name })
  const store = await cookies()
  store.set(ACCESS_COOKIE, accessToken, ACCESS_COOKIE_OPTIONS)
  store.set(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS)
}
