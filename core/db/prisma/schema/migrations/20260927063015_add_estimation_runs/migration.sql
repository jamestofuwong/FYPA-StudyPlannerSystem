-- Class estimation run history (Phase 8).
--
-- Hand-trimmed from what `prisma migrate dev --create-only` generated. That output also dropped and
-- recreated every foreign key in the schema, dropped 18 existing indexes, and created portal_planner_entries,
-- sync_runs and schema_migrations. None of that belongs to this change: it is pre-existing drift between the
-- Prisma schema and the database, and reconciling it here would have quietly dropped indexes the rest of the
-- app relies on. Only the two tables this feature needs are created below.

-- CreateTable
CREATE TABLE "estimation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label" VARCHAR(200),
    "target_year" INTEGER NOT NULL,
    "target_semester" SMALLINT NOT NULL,
    "load_cap" INTEGER NOT NULL,
    "retention_rate" DECIMAL(4,3) NOT NULL,
    "new_intake" INTEGER NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "student_count" INTEGER NOT NULL,
    "group_count" INTEGER NOT NULL,
    "common_core_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estimation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimation_run_units" (
    "run_id" UUID NOT NULL,
    "unit_code" VARCHAR(20) NOT NULL,
    "from_named_picks" DECIMAL(10,4) NOT NULL,
    "from_electives" DECIMAL(10,4) NOT NULL,
    "from_new_intake" DECIMAL(10,4) NOT NULL,
    "projected" DECIMAL(10,4) NOT NULL,
    "headcount" INTEGER NOT NULL,

    CONSTRAINT "estimation_run_units_pkey" PRIMARY KEY ("run_id","unit_code")
);

-- CreateIndex
CREATE INDEX "estimation_runs_created_at_idx" ON "estimation_runs"("created_at");

-- CreateIndex
CREATE INDEX "estimation_run_units_unit_code_idx" ON "estimation_run_units"("unit_code");

-- AddForeignKey
ALTER TABLE "estimation_run_units" ADD CONSTRAINT "estimation_run_units_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "estimation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
