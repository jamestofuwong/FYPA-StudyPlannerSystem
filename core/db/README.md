# core/db: database access

Prisma 6 for the desktop app. All queries are here. A service never calls Prisma.

## Layout

- `prisma/schema/base.prisma`: the schema. The generator writes the client to `node_modules/@local/prisma-client`.
- `prisma/schema/migrations/`: the migrations. The app runs `prisma migrate deploy` on every start.
- `client.ts`: exports one `prisma` client, stored on `globalThis` outside production so hot reload does not open new connections.
- `repositories/*`: one file per aggregate: course, major, unit, plannerRepository, templateUnit, electiveGroup, electiveGroupUnit, estimationRun. A function takes plain arguments and returns rows. The list is generated: [modules](../../docs/ai/generated/modules.md).
- `utils/parse-requisite.ts`: turns requisite text into groups of conditions (the seed SQL uses it too).

## Rules

- Routes and services import a repository, never `@local/prisma-client`.
- Repository create and update functions still accept `any`, so the check is in the route: `web/lib/requestBody.ts` lists the fields that a caller may set, and refuses the rest with 400. A new route that passes a body to a repository must use `readBody` with a spec (`tests/integration-db/api-db.test.ts` shows the rules).
- The two databases are separate. This folder never serves the student app (`student/` has its own Prisma 7 schema).
- If you add a table, also decide whether the embedded PostgreSQL `userData` data needs a seed.

## Change the schema

1. Edit `base.prisma`.
2. `node scripts/db-up.js` in one terminal (starts the embedded cluster without Electron; close the app first, both use port 5433).
3. `npx prisma migrate dev --schema core/db/prisma/schema --name <change>`. Open the new `migration.sql` and check that it holds only your change. The schema and the migrations agree and a test keeps them so, so an index or foreign key that you did not touch in that file means that they have drifted (details: [data-model.md](../../docs/ai/data-model.md)).
4. `npm run prisma:generate`.
5. `npm run test:integration` (it applies all migrations to an empty database).

More: [docs/ai/data-model.md](../../docs/ai/data-model.md).

## Tests

`tests/integration-db`: `migrations`, `repositories`, `api-db`, `api-crud`, `seed-data`, `pipelines`.
