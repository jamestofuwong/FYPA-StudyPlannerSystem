// Point the app's own Prisma client (core/db/client.ts) at the temporary database before any module loads.
process.env.DATABASE_URL = process.env.TEST_DESKTOP_DB_URL;
