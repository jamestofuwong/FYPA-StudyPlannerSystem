import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  hashToken,
  signAccessToken,
  generateRefreshToken,
  refreshExpiresAt,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_MAX_AGE,
  REFRESH_MAX_AGE,
} from '@/lib/cms/auth'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return NextResponse.json({ error: 'No refresh token' }, { status: 401 })

  const stored = await prisma.cmsRefreshToken.findFirst({
    where: {
      token_hash: hashToken(refreshToken),
      expires_at: { gt: new Date() },
    },
    include: { user: true },
  })

  if (!stored) return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 })

  // Rotate: delete old, create new
  const newRefreshToken = generateRefreshToken()
  await prisma.$transaction([
    prisma.cmsRefreshToken.delete({ where: { id: stored.id } }),
    prisma.cmsRefreshToken.create({
      data: {
        user_id: stored.user.id,
        token_hash: hashToken(newRefreshToken),
        expires_at: refreshExpiresAt(),
      },
    }),
  ])

  const accessToken = await signAccessToken({
    sub: stored.user.id,
    email: stored.user.email,
    name: stored.user.name,
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_MAX_AGE,
  })
  res.cookies.set(REFRESH_COOKIE, newRefreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_MAX_AGE,
  })
  return res
}
