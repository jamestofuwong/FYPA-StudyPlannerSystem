// ============================================================
// Starts the embedded Postgres cluster the Electron app normally manages, without launching Electron.
//
// Needed because runtime/postgres/db.ts resolves the data directory through Electron's app.getPath, so any
// database work outside the running app, a Prisma migration in particular, otherwise has no way to bring
// the cluster up. Close the app first: both want port 5433.
//
//   node scripts/db-up.js            leave it running in one terminal
//   npx prisma migrate deploy --schema core/db/prisma/schema     in another
//
// Ctrl-C stops the cluster, because embedded-postgres shuts it down when this process exits.
// ============================================================

const EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres');
const path = require('path');

// Matches getDataDir() in runtime/postgres/db.ts: Electron's userData folder for this app.
const dataDir = path.join(process.env.APPDATA, 'fypa-study-planner-system', 'pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'studyplanner_user',
  password: 'superidol',
  port: 5433,
  persistent: true,
});

pg.start()
  .then(() => {
    console.log('READY: postgres on 5433 from', dataDir);
    console.log('Leave this running. Ctrl-C to stop.');
    setInterval(() => {}, 1 << 30);
  })
  .catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
