import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const LOGIN_PATH = '/cms/login'
const PUBLIC_PREFIXES = ['/cms/login', '/api/cms/auth']

function secret(): Uint8Array {
  const s = process.env.CMS_JWT_SECRET ?? ''
  return new TextEncoder().encode(s)
}

function buildCsp(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",        // scripts that a nonced script loads (the page chunks) are trusted too
    process.env.NODE_ENV !== 'production' ? "'unsafe-eval'" : null,
  ].filter(Boolean).join(' ')

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ')
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)

  // Next.js reads the nonce from the Content-Security-Policy header of the REQUEST, and attaches it to the inline
  // scripts that it writes into the page (see https://nextjs.org/docs/app/guides/content-security-policy). Setting the
  // policy only on the response leaves those scripts without a nonce, and the browser blocks them: the page then never
  // hydrates, and every button does nothing. app/layout.tsx makes every page render per request so that this can work.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  // CMS auth gate
  if (pathname.startsWith('/cms') && !PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    const token = request.cookies.get('cms_access')?.value
    let valid = false
    if (token) {
      try {
        await jwtVerify(token, secret())
        valid = true
      } catch {
        // expired or invalid — fall through
      }
    }
    if (!valid) {
      const loginUrl = new URL(LOGIN_PATH, request.url)
      loginUrl.searchParams.set('next', pathname)
      const res = NextResponse.redirect(loginUrl)
      res.headers.set('Content-Security-Policy', csp)
      return res
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
