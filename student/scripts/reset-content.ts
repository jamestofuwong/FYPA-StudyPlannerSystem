// Empties the content of the student app database (units, planners, unit details and help content) and, with --seed,
// puts the seed data back. CMS accounts and their sessions are never touched.
//
//   npx tsx scripts/reset-content.ts --env-file .env                       Dry run: prints the target and the row counts.
//   npx tsx scripts/reset-content.ts --env-file .env --confirm-host <host> Deletes. <host> must be the host printed by the dry run.
//   ... --i-have-a-backup                                                  Also needed when the host is not on this computer.
//   ... --seed                                                             Runs prisma/seed.ts after the delete.
//
// Without --confirm-host this changes nothing. It never prints the user name or the password of the connection.
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { CLEAR_ORDER, KEEP, applyEnvFile, decide, describeTarget, parseArgs, seedIsSafe } from './reset-content-lib'

type Table = { count(): Promise<number>; deleteMany(): Promise<{ count: number }> }

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const envPath = path.resolve(process.cwd(), options.envFile)
  if (!existsSync(envPath)) throw new Error(`Env file not found: ${options.envFile}`)
  applyEnvFile(process.env, parseEnv(readFileSync(envPath, 'utf8')))

  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error(`${options.envFile} has no DATABASE_URL`)
  const target = describeTarget(connectionString)

  console.log(`Env file : ${options.envFile}`)
  console.log(`Database : ${target.label}  (${target.isLocal ? 'on this computer' : 'NOT on this computer'})`)

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  const tables = prisma as unknown as Record<string, Table>
  try {
    const before = new Map<string, number>()
    console.log('\nWill be emptied:')
    for (const { model, delegate } of CLEAR_ORDER) {
      const n = await tables[delegate].count()
      before.set(model, n)
      console.log(`  ${model.padEnd(24)} ${String(n).padStart(7)} rows`)
    }
    console.log('\nWill be kept:')
    for (const { model, delegate } of KEEP) {
      const n = await tables[delegate].count()
      before.set(model, n)
      console.log(`  ${model.padEnd(24)} ${String(n).padStart(7)} rows`)
    }

    const decision = decide(options, target)
    if (!decision.run) {
      console.log(`\n${decision.reason}`)
      process.exitCode = decision.reason.startsWith('Dry run') ? 0 : 1
      return
    }
    if (options.seed) {
      const safe = seedIsSafe(process.env, target)
      if (!safe.ok) {
        console.log(`\n${safe.reason}\nNothing was changed.`)
        process.exitCode = 1
        return
      }
    }

    // On a database that is not on this computer, the seed must find its account, or it would create a new superadmin
    // with the default password. The seed looks the account up by this exact address.
    if (options.seed && !target.isLocal) {
      const email = process.env.CMS_SEED_EMAIL ?? ''
      if (!(await prisma.cmsUser.findUnique({ where: { email }, select: { id: true } }))) {
        console.log(`\nNo CMS account has the email in CMS_SEED_EMAIL, so the seed would create a new superadmin with the default password.\nUse the exact email of an account that already exists. Nothing was changed.`)
        process.exitCode = 1
        return
      }
    }

    console.log('\nDeleting...')
    await prisma.$transaction(async (tx) => {
      const txTables = tx as unknown as Record<string, Table>
      for (const { model, delegate } of CLEAR_ORDER) {
        const { count } = await txTables[delegate].deleteMany()
        console.log(`  deleted ${String(count).padStart(7)} from ${model}`)
      }
      // The accounts must be exactly as they were, or the whole delete is undone
      for (const { model, delegate } of KEEP) {
        const now = await txTables[delegate].count()
        if (now !== before.get(model)) throw new Error(`${model} changed (${before.get(model)} -> ${now}). The delete was undone.`)
      }
    }, { timeout: 120_000 })
    console.log('Done. CMS accounts were not changed.')
  } finally {
    await prisma.$disconnect()
  }

  if (options.seed) {
    console.log('\nSeeding...')
    const result = spawnSync('npx', ['tsx', '--env-file', envPath, 'prisma/seed.ts'], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') })
    if (result.status !== 0) {
      console.error('The seed failed. The content is empty until it succeeds. Run it again with: npx tsx --env-file ' + options.envFile + ' prisma/seed.ts')
      process.exitCode = 1
    }
  } else {
    console.log('\nThe content is now empty. Seed it with: npx tsx --env-file ' + options.envFile + ' prisma/seed.ts')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
