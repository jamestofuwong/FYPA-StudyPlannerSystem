import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'node:crypto'

export const ACCESS_COOKIE = 'cms_access'
export const REFRESH_COOKIE = 'cms_refresh'
export const ACCESS_MAX_AGE = 15 * 60        // 15 minutes
export const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 // 7 days

export interface JwtPayload {
  sub: string
  email: string
  name: string
}

function secret(): Uint8Array {
  const s = process.env.CMS_JWT_SECRET
  if (!s) throw new Error('CMS_JWT_SECRET is not set')
  return new TextEncoder().encode(s)
}

export async function signAccessToken(p: JwtPayload): Promise<string> {
  return new SignJWT({ email: p.email, name: p.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_MAX_AGE}s`)
    .sign(secret())
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return {
      sub: payload.sub as string,
      email: payload['email'] as string,
      name: payload['name'] as string,
    }
  } catch {
    return null
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function refreshExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_MAX_AGE * 1000)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
