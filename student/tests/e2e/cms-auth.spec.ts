import { test, expect, login } from './helpers/fixtures'
import { SignJWT } from 'jose'

test('CMS protects every content route and rejects a tampered access cookie', async ({ page, context, db }) => {
  for (const path of ['/cms/dashboard', '/cms/units', '/cms/planners', '/cms/help/faq', '/cms/help/contacts', '/cms/help/hod']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/cms\/login\?next=/)
  }
  await context.addCookies([{ name: 'cms_access', value: 'tampered', url: new URL(page.url()).origin }])
  await page.goto('/cms/units')
  await expect(page).toHaveURL(/\/cms\/login/)
  expect((await db.query('SELECT count(*)::int AS n FROM cms_refresh_tokens')).rows[0].n).toBe(0)
})

test('invalid credentials can be corrected and session cookies are protected', async ({ page, context, db }) => {
  await page.goto('/cms/login')
  await page.getByLabel('Email', { exact: true }).fill(process.env.CMS_SEED_EMAIL!)
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Invalid credentials', { exact: true })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill(process.env.CMS_SEED_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/cms\/dashboard$/)
  const cookies = (await context.cookies()).filter(c => ['cms_access', 'cms_refresh'].includes(c.name))
  expect(cookies).toHaveLength(2)
  for (const cookie of cookies) { expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Lax') }
  await expect(page.getByRole('navigation', { name: 'CMS navigation' })).toBeVisible()
})

test('missing access token refreshes the session, rotates tokens and rejects replay', async ({ page, context, playwright, db }) => {
  await login(page)
  const old = (await context.cookies()).find(c => c.name === 'cms_refresh')!
  await context.clearCookies({ name: 'cms_access' })
  await page.goto('/cms/units')
  await expect(page).toHaveURL(/\/cms\/units$/)
  const current = (await context.cookies()).find(c => c.name === 'cms_refresh')!
  expect(current.value).not.toBe(old.value)
  const user = (await db.query('SELECT id,email,name FROM cms_users WHERE email=$1', [process.env.CMS_SEED_EMAIL])).rows[0]
  const expiredAccess = await new SignJWT({ email: user.email, name: user.name }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id).setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(new TextEncoder().encode(process.env.CMS_JWT_SECRET))
  await context.addCookies([{ name: 'cms_access', value: expiredAccess, url: new URL(page.url()).origin, httpOnly: true, sameSite: 'Lax' }])
  await page.goto('/cms/units')
  await expect(page).toHaveURL(/\/cms\/units$/)
  expect((await context.cookies()).find(c => c.name === 'cms_refresh')!.value).not.toBe(current.value)
  const replay = await playwright.request.newContext({ baseURL: new URL(page.url()).origin, extraHTTPHeaders: { Cookie: `cms_refresh=${old.value}` } })
  try { expect((await replay.post('/api/cms/auth/refresh')).status()).toBe(401) } finally { await replay.dispose() }
})

test('expired refresh token cannot restore login and logout revokes a valid token', async ({ page, context, db }) => {
  await login(page)
  // Use a fixed past instant so expiry is independent of JS/Postgres clock skew.
  const expiredRows = await db.query("UPDATE cms_refresh_tokens SET expires_at = '2000-01-01T00:00:00Z'::timestamptz RETURNING expires_at")
  expect(expiredRows.rows.length).toBeGreaterThan(0)
  expect(expiredRows.rows.every(row => row.expires_at.getUTCFullYear() === 2000)).toBe(true)
  await context.clearCookies({ name: 'cms_access' })
  expect((await context.request.post('/api/cms/auth/refresh')).status()).toBe(401)
  await page.goto('/cms/login')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await login(page)
  const before = (await context.cookies()).find(c => c.name === 'cms_refresh')!
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/cms\/login$/)
  expect((await context.cookies()).some(c => c.value === before.value)).toBe(false)
  await page.goto('/cms/planners')
  await expect(page).toHaveURL(/\/cms\/login/)
})

test('login validates malformed fields and rate-limits repeated failed requests', async ({ request, db }) => {
  expect((await request.post('/api/cms/auth/login', { data: { email: 'invalid', password: '' } })).status()).toBe(400)
  const options = { data: { email: 'rate-limit-e2e@example.invalid', password: 'invalid' }, headers: { 'x-forwarded-for': '198.51.100.17' } }
  for (let n = 0; n < 5; n++) expect((await request.post('/api/cms/auth/login', options)).status()).toBe(401)
  const limited = await request.post('/api/cms/auth/login', options)
  expect(limited.status()).toBe(429)
  expect((await limited.json()).error).toContain('Too many login attempts')
})
