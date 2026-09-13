import { cookies } from 'next/headers'
import { verifyAccessToken, type JwtPayload, ACCESS_COOKIE } from './auth'

export async function getSession(): Promise<JwtPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ACCESS_COOKIE)?.value
  if (!token) return null
  return verifyAccessToken(token)
}

export async function requireSession(): Promise<JwtPayload> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return session
}
