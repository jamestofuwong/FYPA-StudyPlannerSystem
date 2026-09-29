import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ACCESS_COOKIE, REFRESH_COOKIE, hashToken, verifyAccessToken } from '@/lib/cms/auth'

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.cookies.get(ACCESS_COOKIE)?.value
    const payload = accessToken ? await verifyAccessToken(accessToken) : null

    const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value
    if (refreshToken) {
      await prisma.cmsRefreshToken.deleteMany({
        where: { token_hash: hashToken(refreshToken) },
      })
    }

    console.info(`[CMS] logout email=${payload?.email ?? 'unknown'}`)

    const res = NextResponse.json({ ok: true })
    res.cookies.delete(ACCESS_COOKIE)
    res.cookies.delete(REFRESH_COOKIE)
    return res
  } catch (err) {
    console.error('[API] POST /api/cms/auth/logout failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
