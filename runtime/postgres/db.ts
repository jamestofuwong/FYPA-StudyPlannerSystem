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
  // With asar: true (current),  files are under Resources/app.asar.unpacked/
  // With asar: false (fallback), files are under Resources/app/
  const withAsar = path.join(process.resourcesPath, 'app.asar.unpacked', ...segments);
  const noAsar   = path.join(process.resourcesPath, 'app', ...segments);
  return fs.existsSync(withAsar) ? withAsar : noAsar;
}

function getSchemaPath(): string {
  return app.isPackaged
    ? getAppResourcePath('runtime', 'postgres', 'scripts', 'init.psql')
    : path.resolve(__dirname, '..', '..', 'runtime', 'postgres', 'scripts', 'init.psql')
};

// Get all seed files in order
function getSeedFiles(): string[] {
  const seedDir = app.isPackaged
    ? getAppResourcePath('runtime', 'postgres', 'scripts', 'seed')
    : path.resolve(__dirname, '..', '..', 'runtime', 'postgres', 'scripts', 'seed')
  
  if (!fs.existsSync(seedDir)) {
    console.log('[DB] Seed directory not found:', seedDir)
    return []
  }
  
  // Get all .sql files and sort by name
  const files = fs.readdirSync(seedDir)
    .filter(file => file.endsWith('.sql'))
    .sort()
  
  return files.map(file => path.join(seedDir, file))
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

export async function startDatabase() : Promise<void> {
    if (pg) return

    const dataDir = getDataDir();

    // Auto-wipe broken cluster
    if (fs.existsSync(dataDir) && !isValidCluster(dataDir)) {
      console.log('[DB] Broken cluster detected, wiping...')
      fs.rmSync(dataDir, { recursive: true, force: true })
    }

    const isFirstRun = !isValidCluster(dataDir)

    console.log('[DB] Data directory: ', dataDir);
    console.log('[DB] Is first run: ', isFirstRun);

    pg = new EmbeddedPostgres({
        databaseDir: dataDir,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        port: DB_CONFIG.port,
        persistent: true,   // data persisits accross app restart
        initdbFlags: ['--locale=C', '--encoding=UTF8'],
    });

    // On Windows, kill any orphaned postgres processes that may be holding
    // port 5433 from a previous crashed or force-closed session.
    if (process.platform === 'win32') {
      try {
        execSync('taskkill /F /IM postgres.exe /T', { stdio: 'ignore' });
        console.log('[DB] Cleared any pre-existing postgres.exe processes');
      } catch {
        // taskkill exits 128 when no matching process found — that's fine.
      }
    }

    // initialise (create data dir and pg cluster if first run)
    if (isFirstRun) {
        await pg.initialise()
    }
    await pg.start().catch((err: unknown) => {
      // embedded-postgres sometimes rejects with a non-Error (e.g. undefined or
      // a plain string). Wrap it so the caller always sees a meaningful message.
      const msg = err instanceof Error ? err.message : String(err ?? 'pg.start() rejected with no reason');
      throw new Error(`[DB] pg.start() failed: ${msg}`);
    });

    console.log('[DB] PostgreSQL started on port ', DB_CONFIG.port);

    if (isFirstRun) {
      await pg.createDatabase(DB_CONFIG.database)

      console.log('[DB] Running initial schema setup...')
      const schema = fs.readFileSync(getSchemaPath(), 'utf-8')

      // Connect directly to studyplanner database, not default
      const { Client } = require('pg')
      const client = new Client({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: DB_CONFIG.user,
        password: DB_CONFIG.password,
        database: DB_CONFIG.database 
      })

      await client.connect()
      try {
        // Run schema first
        await runSqlFile(client, getSchemaPath(), 'schema initialization')
        
        // Then run all seed files in order
        const seedFiles = getSeedFiles()
        if (seedFiles.length > 0) {
          console.log(`[DB] Found ${seedFiles.length} seed file(s)`)
          for (const seedFile of seedFiles) {
            const fileName = path.basename(seedFile)
            await runSqlFile(client, seedFile, `seed file: ${fileName}`)
          }
          console.log('[DB] All seed data loaded successfully')
        } else {
          console.log('[DB] No seed files found')
        }
        
      } catch (err) {
        console.error('[DB] Database initialization FAILED:', err)
      } finally {
        await client.end()
      }
    }
};

export async function stopDatabase(): Promise<void> {
  if (!pg) {
    console.log('[DB] No database instance to stop');
    return;
  }

  console.log('[DB] Stopping PostgreSQL...');

  try {
    await pg.stop();
    console.log('[DB] PostgreSQL stopped cleanly');

    // Give the process time to fully exit before we return.
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  } catch (err) {
    console.warn('[DB] pg.stop() warning (may be benign):', err);
  } finally {
    pg = null;
  }

  // On Windows, Electron's exit can leave orphaned postgres.exe processes in a
  // "Suspended" state rather than terminating them. A suspended postgres still
  // holds port 5433, so the next app launch fails to start a new instance.
  // Force-kill any remaining postgres.exe processes after pg.stop() returns.
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM postgres.exe /T', { stdio: 'ignore' });
      console.log('[DB] Killed residual postgres.exe processes on Windows');
    } catch {
      // taskkill exits with code 128 when no matching process is found — that's fine.
    }
  }
}