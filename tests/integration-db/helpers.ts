import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

export const desktopUrl = () => process.env.TEST_DESKTOP_DB_URL as string;

/** A plain pg connection for checks that should not go through Prisma. */
export async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: desktopUrl() });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Empties every table except Prisma's own migration table, so each test file starts from nothing. */
export async function resetDb(): Promise<void> {
  await withClient(async (c) => {
    const { rows } = await c.query(
      `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`);
    if (rows.length) {
      await c.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`);
    }
  });
}

export const SEED_DIR = path.resolve(__dirname, '..', '..', 'runtime', 'postgres', 'scripts', 'seed');

/** Loads the same SQL files that a new install loads on its first start. */
export async function loadSeeds(c: Client): Promise<string[]> {
  const files = fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await c.query(fs.readFileSync(path.join(SEED_DIR, f), 'utf8'));
  return files;
}
