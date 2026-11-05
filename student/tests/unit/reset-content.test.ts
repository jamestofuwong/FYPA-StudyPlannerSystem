import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  CLEAR_ORDER, KEEP, applyEnvFile, decide, describeTarget, modelNames, parseArgs, seedIsSafe, type Target,
} from '../../scripts/reset-content-lib'

const remote = describeTarget('postgresql://postgres.abc:s3cret-pass@aws-0-ap.pooler.supabase.com:6543/postgres')
const local = describeTarget('postgresql://user:pw@localhost:5432/student_dev')
const opts = (over: Partial<ReturnType<typeof parseArgs>> = {}) => ({ ...parseArgs([]), ...over })

describe('every table is either cleared or kept', () => {
  test('a table added to the schema forces a decision here', () => {
    const schema = readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8')
    const known = new Set<string>([...CLEAR_ORDER, ...KEEP].map((t) => t.model))
    expect(modelNames(schema).filter((m) => !known.has(m))).toEqual([])
    expect([...known].filter((m) => !modelNames(schema).includes(m))).toEqual([])
  })

  test('the CMS accounts are never in the list of tables to empty', () => {
    const cleared = CLEAR_ORDER.map((t) => t.model) as string[]
    expect(cleared).not.toContain('CmsUser')
    expect(cleared).not.toContain('CmsRefreshToken')
  })

  test('a child table is emptied before the table it points to', () => {
    const order = (CLEAR_ORDER.map((t) => t.model) as string[])
    const before = (child: string, parent: string) => expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent))
    before('TemplateUnit', 'PlannerTemplate'); before('TemplateUnit', 'Unit')
    before('PlannerTemplate', 'Major'); before('PlannerTemplate', 'Course'); before('Major', 'Course')
    before('ElectiveGroupUnit', 'ElectiveGroup'); before('MinorUnit', 'Minor')
    before('UnitRequisiteCondition', 'UnitRequisiteGroup'); before('UnitRequisiteGroup', 'Unit')
    before('UnitLearningOutcome', 'Unit'); before('UnitAssessment', 'Unit'); before('UnitDetailSectionState', 'Unit')
  })
})

describe('describeTarget', () => {
  test('shows the host, port and database, and never the user name or the password', () => {
    expect(remote.label).toBe('aws-0-ap.pooler.supabase.com:6543/postgres')
    expect(JSON.stringify(remote)).not.toMatch(/s3cret|postgres\.abc/)
    expect(remote.isLocal).toBe(false)
  })
  test('knows what is on this computer', () => {
    expect(local.isLocal).toBe(true)
    expect(describeTarget('postgresql://u:p@127.0.0.1/x').isLocal).toBe(true)
    expect(describeTarget('postgresql://u:p@localhost.evil.com/x').isLocal).toBe(false)
  })
  test('a bad connection string is refused without printing it', () => {
    expect(() => describeTarget('not a url s3cret')).toThrow(/not a valid URL/)
    try { describeTarget('not a url s3cret') } catch (e) { expect(String(e)).not.toMatch(/s3cret/) }
  })
})

describe('parseArgs', () => {
  test('defaults to a dry run on .env', () => {
    expect(parseArgs([])).toEqual({ envFile: '.env', confirmHost: null, backupDone: false, seed: false })
  })
  test('reads every option, with a space or an equals sign', () => {
    expect(parseArgs(['--env-file', '.env.production', '--confirm-host=db.example.com', '--i-have-a-backup', '--seed']))
      .toEqual({ envFile: '.env.production', confirmHost: 'db.example.com', backupDone: true, seed: true })
  })
  test('an unknown option or an empty host is an error, not a silent dry run', () => {
    expect(() => parseArgs(['--confirm'])).toThrow(/Unknown option/)
    expect(() => parseArgs(['--confirm-host'])).toThrow(/needs the host/)
  })
})

describe('decide: only an exact, explicit confirmation deletes', () => {
  const dry = (t: Target, o = opts()) => decide(o, t)
  test('no confirmation is a dry run', () => {
    expect(dry(remote)).toMatchObject({ run: false })
    expect(dry(local)).toMatchObject({ run: false })
  })
  test('the wrong host is refused', () => {
    expect(decide(opts({ confirmHost: 'other.example.com' }), remote)).toMatchObject({ run: false, reason: expect.stringMatching(/not the host/) })
  })
  test('a remote database also needs the backup flag', () => {
    expect(decide(opts({ confirmHost: remote.host }), remote)).toMatchObject({ run: false, reason: expect.stringMatching(/backup/) })
    expect(decide(opts({ confirmHost: remote.host, backupDone: true }), remote)).toEqual({ run: true })
  })
  test('a local database needs only the host', () => {
    expect(decide(opts({ confirmHost: 'LOCALHOST' }), local)).toEqual({ run: true })
  })
})

describe('seedIsSafe', () => {
  test('on a remote database the seed needs CMS_SEED_EMAIL, so no default login is created', () => {
    expect(seedIsSafe({}, remote)).toMatchObject({ ok: false })
    expect(seedIsSafe({ CMS_SEED_EMAIL: 'me@example.com' }, remote)).toEqual({ ok: true })
  })
  test('on this computer the default is fine', () => {
    expect(seedIsSafe({}, local)).toEqual({ ok: true })
  })
})

describe('applyEnvFile', () => {
  test('the chosen file replaces the database variables, so the last --env-file given is the one used', () => {
    const env: Record<string, string | undefined> = { DATABASE_URL: 'postgresql://prod', DATABASE_URL_UNPOOLED: 'postgresql://prod-direct', OTHER: 'old' }
    applyEnvFile(env, { DATABASE_URL: 'postgresql://dev', OTHER: 'new' })
    expect(env.DATABASE_URL).toBe('postgresql://dev')
    expect(env.OTHER).toBe('new')
  })

  test('a database variable that only an earlier file had is removed, not kept', () => {
    const env: Record<string, string | undefined> = { DATABASE_URL: 'postgresql://prod', DATABASE_URL_UNPOOLED: 'postgresql://prod-direct' }
    applyEnvFile(env, { DATABASE_URL: 'postgresql://dev' })
    expect(env.DATABASE_URL_UNPOOLED).toBeUndefined()
  })
})
