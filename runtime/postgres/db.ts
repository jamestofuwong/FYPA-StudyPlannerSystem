import EmbeddedPostgres from 'embedded-postgres'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'

let pg: EmbeddedPostgres | null = null

function getDataDir(): string {
    return path.join(app.getPath('userData'), 'pgdata');
};

function getAppResourcePath(...segments: string[]): string {
  const withAsar = path.join(process.resourcesPath, 'app.asar.unpacked', ...segments);
  const noAsar   = path.join(process.resourcesPath, 'app', ...segments);
  return fs.existsSync(withAsar) ? withAsar : noAsar;
}

function getSeedFiles(): string[] {
  const seedDir = app.isPackaged
    ? getAppResourcePath('runtime', 'postgres', 'scripts', 'seed')
    : path.resolve(__dirname, '..', '..', 'runtime', 'postgres', 'scripts', 'seed');

  if (!fs.existsSync(seedDir)) {
    console.log('[DB] Seed directory not found:', seedDir);
    return [];
  }

  return fs.readdirSync(seedDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => path.join(seedDir, file));
}

function isValidCluster(dataDir: string): boolean {
  return fs.existsSync(path.join(dataDir, 'PG_VERSION'))
}

export const DB_CONFIG = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: parseInt(process.env.DB_PORT ?? '5433'),
  database: process.env.DB_NAME ?? 'studyplanner',
  user: process.env.DB_USER ?? 'studyplanner_user',
  password: process.env.DB_PASSWORD ?? 'superidol',
};

export function getDatabaseUrl(): string {
  return `postgresql://${DB_CONFIG.user}:${DB_CONFIG.password}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`
};

async function runSqlFile(client: any, filePath: string, description: string): Promise<void> {
  console.log(`[DB] Running ${description}...`)
  const sql = fs.readFileSync(filePath, 'utf-8')
  
  try {
    await client.query(sql)
    console.log(`[DB] ${description} complete`)
  } catch (err) {
    console.error(`[DB] ${description} FAILED:`, err)
    throw err
  }
}


// Boots Embedded Postgres and ensures the target database exists.
// Returns true if this is a brand new cluster/database (first run).

export async function startDatabase(): Promise<boolean> {
  if (pg) return false;

  const dataDir = getDataDir();

  // Auto-wipe broken cluster
  if (fs.existsSync(dataDir) && !isValidCluster(dataDir)) {
    console.log('[DB] Broken cluster detected, wiping...');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  const isFirstRun = !isValidCluster(dataDir);
  console.log('[DB] Data directory:', dataDir);
  console.log('[DB] Is first run:', isFirstRun);

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    port: DB_CONFIG.port,
    persistent: true,   // data persisits accross app restart
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
  });

  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM postgres.exe /T', { stdio: 'ignore' });
    } catch {
      // ignore
    }
  }

  if (isFirstRun) {
    await pg.initialise();
  }

  await pg.start().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[DB] pg.start() failed: ${msg}`);
  });

  console.log('[DB] PostgreSQL started on port', DB_CONFIG.port);

  if (isFirstRun) {
    await pg.createDatabase(DB_CONFIG.database);
    console.log(`[DB] Database "${DB_CONFIG.database}" created.`);
  }

  return isFirstRun;
}

// Runs seed files only on the very first run.

export async function runSeedsIfFirstRun(isFirstRun: boolean): Promise<void> {
  if (!isFirstRun) {
    console.log('[DB] Existing cluster detected — skipping seeds to preserve user data.');
    return;
  }

  const seedFiles = getSeedFiles();
  if (seedFiles.length === 0) {
    console.log('[DB] No seed files found.');
    return;
  }

  const { Client } = require('pg');
  const client = new Client({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    database: DB_CONFIG.database,
  });

  await client.connect();
  try {
    console.log(`[DB] Executing ${seedFiles.length} seed file(s)...`);
    for (const seedFile of seedFiles) {
      await runSqlFile(client, seedFile, `seed file: ${path.basename(seedFile)}`);
    }
    console.log('[DB] All seed data loaded successfully.');
  } finally {
    await client.end();
  }
}

export async function stopDatabase(): Promise<void> {
  if (!pg) return;
  console.log('[DB] Stopping PostgreSQL...');

  try {
    await pg.stop();
    console.log('[DB] PostgreSQL stopped cleanly');

    // Give the process time to fully exit before we return.
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  } catch (err) {
    console.warn('[DB] pg.stop() warning:', err);
  } finally {
    pg = null;
  }

  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM postgres.exe /T', { stdio: 'ignore' });
    } catch {
      // ignore
    }
  }
}