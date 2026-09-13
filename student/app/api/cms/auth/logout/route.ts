import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ACCESS_COOKIE, REFRESH_COOKIE, hashToken } from '@/lib/cms/auth'

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value
  if (refreshToken) {
    await prisma.cmsRefreshToken.deleteMany({
      where: { token_hash: hashToken(refreshToken) },
    })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(ACCESS_COOKIE)
  res.cookies.delete(REFRESH_COOKIE)
  return res
}
