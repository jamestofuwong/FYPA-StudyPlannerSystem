import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  safeVerifyPassword,
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
import { LoginSchema } from '@/lib/cms/schemas'

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 })
    }
    const { email, password } = parsed.data

    const ip = getIp(req)
    const ipKey = `ip:${ip}`
    const emailKey = `email:${email.toLowerCase()}`

    // Check IP limit first, then email limit
    const ipCheck = checkRateLimit(ipKey)
    if (ipCheck.limited) {
      console.warn(`[CMS] login:rate_limited email=${email} ip=${ip}`)
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${ipCheck.retryAfterSeconds} seconds.` },
        { status: 429 }
      )
    }

    const emailCheck = checkRateLimit(emailKey)
    if (emailCheck.limited) {
      console.warn(`[CMS] login:rate_limited email=${email} ip=${ip}`)
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${emailCheck.retryAfterSeconds} seconds.` },
        { status: 429 }
      )
    }

    const user = await prisma.cmsUser.findUnique({ where: { email } })
    const passwordValid = await safeVerifyPassword(password, user?.password_hash ?? null)
    if (!user || !passwordValid) {
      console.warn(`[CMS] login:failed email=${email} ip=${ip}`)
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // Successful login — clear rate limit counters for both keys
    resetRateLimit(ipKey)
    resetRateLimit(emailKey)
    console.info(`[CMS] login:success email=${email} ip=${ip}`)

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
  } catch (err) {
    console.error('[API] POST /api/cms/auth/login failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
