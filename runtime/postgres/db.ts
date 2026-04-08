import EmbeddedPostgres from 'embedded-postgres'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let pg: EmbeddedPostgres | null = null

function getDataDir(): string {
    return path.join(app.getPath('userData'), 'pgdata');
};

function getSchemaPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'runtime', 'postgres', 'scripts', 'init.psql')
    : path.resolve(__dirname, '..', '..', 'runtime', 'postgres', 'scripts', 'init.psql')
};

// Get all seed files in order
function getSeedFiles(): string[] {
  const seedDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'runtime', 'postgres', 'scripts', 'seed')
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
    });

    // initialise (create data dir and pg cluster if first run)
    if (isFirstRun) {
        await pg.initialise()
    }
    await pg.start();

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
    // Stop embedded Postgres
    await pg.stop();
    console.log('[DB] PostgreSQL stopped cleanly');

    // give time for the underlying process to fully exit
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));

  } catch (err) {
    console.warn('[DB] pg.stop() warning (may be benign):', err);
  } finally {
    pg = null;
  }
}