import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const LOGIN_PATH = '/cms/login'
const PUBLIC_PREFIXES = ['/cms/login', '/api/cms/auth']

function secret(): Uint8Array {
  const s = process.env.CMS_JWT_SECRET ?? ''
  return new TextEncoder().encode(s)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/cms')) return NextResponse.next()

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get('cms_access')?.value
  if (token) {
    try {
      await jwtVerify(token, secret())
      return NextResponse.next()
    } catch {
      // expired or invalid — fall through
    }
  }

  const loginUrl = new URL(LOGIN_PATH, request.url)
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/cms/:path*'],
}
