import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshExpiresAt,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_COOKIE_OPTIONS,
  REFRESH_COOKIE_OPTIONS,
} from '@/lib/cms/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const user = await prisma.cmsUser.findUnique({ where: { email } })
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  })

  const refreshToken = generateRefreshToken()
  await prisma.cmsRefreshToken.create({
    data: {
      user_id: user.id,
      token_hash: hashToken(refreshToken),
      expires_at: refreshExpiresAt(),
    },
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACCESS_COOKIE, accessToken, ACCESS_COOKIE_OPTIONS)
  res.cookies.set(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTIONS)
  return res
}
