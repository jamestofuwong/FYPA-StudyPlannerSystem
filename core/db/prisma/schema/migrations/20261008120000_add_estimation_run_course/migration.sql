-- Records which course a saved class estimate was for.
--
-- Written by hand rather than generated with `prisma migrate dev`, which would also try to reconcile the
-- unrelated drift between the Prisma schema and the database (see 20260927063015_add_estimation_runs). This
-- only adds one nullable column: existing estimates keep working and simply have no course recorded.

-- AlterTable
ALTER TABLE "estimation_runs" ADD COLUMN "course" VARCHAR(255);
