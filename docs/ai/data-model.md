# Data model

## Desktop app (`core/db`)

Schema: `core/db/prisma/schema/base.prisma` (Prisma 6, generator output `node_modules/@local/prisma-client`). Models: Course, Major, Unit, UnitOffering, UnitRequisiteGroup, UnitRequisiteCondition, PlannerTemplate, TemplateUnit, ElectiveGroup, ElectiveGroupUnit, Minor, MinorUnit, SystemConfig, PrivacyEvent, SecurityIncidentLog, AuditLog, EstimationRun, EstimationRunUnit.

Facts to know:

- A `PlannerTemplate` belongs to a `Course` and, normally, a `Major`. It has `TemplateUnit` rows. A row with no unit is an empty elective slot.
- Credit and count targets (`core_cp`, `core_count`, `elective_count`, `wil_cp` and others) are on the planner. They can be null on older planners. Code must handle null.
- A unit has `UnitOffering` rows (terms 1 to 4) and requisites. A requisite group is a set of conditions that must all be true (AND). A unit is allowed when any group is true (OR). `core/db/utils/parse-requisite.ts` parses the requisite text.
- `unit_category` is `core`, `major_core`, `prescribed_elective`, `elective`, `wil`, `mpu`.
- `SystemConfig` is a key-value table. The second-major threshold is stored there (`parseSecondMajorThreshold` reads it as a percentage or a fraction). The allowed keys are in `web/app/api/config/route.ts`.
- `onDelete: Restrict` protects a course that still has majors or planners. A planner delete cascades to its elective groups.
- Unique rules: a major name is unique per course. A planner is unique per course, major, intake year and intake month (a null major can repeat: known gap).

All database access is in `core/db/repositories/*`. A service never calls Prisma. The list of repositories and migrations is generated: [generated/modules.md](generated/modules.md).

## Migrations

- Folder: `core/db/prisma/schema/migrations`. The app runs `prisma migrate deploy` on every start (`runMigrations` in `electron/main.ts`) with `base.prisma`. In development it also runs `prisma generate`.
- To change the schema: edit `base.prisma`, run `node scripts/db-up.js` in one terminal, then `npx prisma migrate dev --schema core/db/prisma/schema --name <change>`, then `npm run prisma:generate`. Never edit a migration that has run.
- The integration tests apply every migration to an empty database (`tests/integration-db/migrations.test.ts`).

**The schema and the migrations agree, and a test keeps them so.** `base.prisma` declares the 18 `idx_*` indexes that the first migration creates, uses `onUpdate: NoAction` on the relations (the database default), and has no model without a table. `tests/integration-db/migrations.test.ts` runs `prisma migrate diff` from the migrations to the schema and fails unless the result is empty. So `prisma migrate dev` now writes only your change. Before you commit, open the new `migration.sql` and check that it holds only what you meant. If a migration drops an index or a foreign key that you did not touch, the schema and the migrations have drifted again: fix `base.prisma` (or the migration) first.

How to see a difference without creating a migration:

```
npx prisma migrate diff --from-migrations core/db/prisma/schema/migrations --to-schema-datamodel core/db/prisma/schema/base.prisma --shadow-database-url <an empty database> --script
```

Never run `prisma migrate reset` or `db push` against a database that holds data you care about.

## Seed data

Five SQL files in `runtime/postgres/scripts/seed` (units, prerequisites, courses and majors, planner templates, elective groups). They run only when the database is new (`isFirstRun` in `runtime/postgres/db.ts`). An existing install never runs them again. `tests/integration-db/seed-data.test.ts` and `pipelines.test.ts` check them. Seed problems that the tests found are fixed in the seed files and, for existing installs, in the migration `20261026000000_fix_seed_data_and_strict_loader` (see [testing.md](testing.md)). `add_template_units` fails on a unit code that matches no unit.

## Where data lives at run time

| Data | Where | Kept after restart? |
|---|---|---|
| Planners, units, prerequisites, settings | Embedded PostgreSQL, `userData/pgdata` | Yes |
| A student (portal or import) | Memory: `StudentSessionContext` and services | No |
| Class-estimation records of students | Memory: `estimationStore` | No. Only the aggregate run is saved. |
| Portal session (cookies, token) | `APP_DATA_DIR` file and the `persist:sisportal-advisor` browser partition | Yes. "Log out" clears it. |
| AI models | `userData/ollama-models` | Yes |
| Logs | `userData/logs/main.log` (overwritten at each start) | Until the next start |

## Student app

Own schema: `student/prisma/schema.prisma` (Prisma 7 with the `pg` adapter, 22 models). It holds the same catalogue (Course, Major, Unit, PlannerTemplate and others), unit detail tables, help content (FAQ, Head of Department and others) and CMS users with refresh tokens. Migrations: `student/prisma/migrations`. The two schemas are not linked. A change to one does not change the other.
