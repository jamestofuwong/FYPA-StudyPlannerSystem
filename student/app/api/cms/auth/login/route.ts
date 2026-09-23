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
import { checkRateLimit, resetRateLimit } from '@/lib/cms/rateLimit'

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  )
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const ip = getIp(req)
  const ipKey = `ip:${ip}`
  const emailKey = `email:${email.toLowerCase()}`

  // Check IP limit first, then email limit
  const ipCheck = checkRateLimit(ipKey)
  if (ipCheck.limited) {
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${ipCheck.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  const emailCheck = checkRateLimit(emailKey)
  if (emailCheck.limited) {
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${emailCheck.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  const user = await prisma.cmsUser.findUnique({ where: { email } })
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Successful login — clear rate limit counters for both keys
  resetRateLimit(ipKey)
  resetRateLimit(emailKey)

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
