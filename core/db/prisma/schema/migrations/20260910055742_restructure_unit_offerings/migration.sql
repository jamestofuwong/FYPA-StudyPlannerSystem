-- CreateEnum
CREATE TYPE "unit_category" AS ENUM ('core', 'major_core', 'prescribed_elective', 'elective', 'wil', 'mpu');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "majors" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    "unit_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_offerings" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_requisite_groups" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,

    CONSTRAINT "unit_requisite_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_requisite_conditions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit_id" TEXT,
    "credit_points" DECIMAL(65,30),
    "requisite_type" TEXT,

    CONSTRAINT "unit_requisite_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_templates" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "major_id" TEXT,
    "intake_year" INTEGER NOT NULL,
    "intake_month" INTEGER,
    "course_type" TEXT NOT NULL DEFAULT 'bachelor',
    "duration_semesters" INTEGER NOT NULL DEFAULT 6,
    "core_count" INTEGER,
    "core_cp" INTEGER,
    "major_count" INTEGER,
    "major_cp" INTEGER,
    "elective_count" INTEGER,
    "elective_cp" INTEGER,
    "wil_count" INTEGER,
    "wil_cp" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_units" (
    "id" TEXT NOT NULL,
    "planner_template_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "category" "unit_category" NOT NULL,
    "year_level" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_groups" (
    "id" TEXT NOT NULL,
    "planner_template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elective_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_group_units" (
    "elective_group_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,

    CONSTRAINT "elective_group_units_pkey" PRIMARY KEY ("elective_group_id","unit_id")
);

-- CreateTable
CREATE TABLE "minors" (
    "id" TEXT NOT NULL,
    "planner_template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "minors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minor_units" (
    "minor_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,

    CONSTRAINT "minor_units_pkey" PRIMARY KEY ("minor_id","unit_id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "privacy_events" (
    "id" BIGSERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "notice_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_incident_log" (
    "id" BIGSERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_incident_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" TEXT NOT NULL,
    "description" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_name_key" ON "courses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "majors_course_id_name_key" ON "majors"("course_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_unit_code_key" ON "units"("unit_code");

-- CreateIndex
CREATE UNIQUE INDEX "unit_offerings_unit_id_semester_key" ON "unit_offerings"("unit_id", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "planner_templates_course_id_major_id_intake_year_intake_mon_key" ON "planner_templates"("course_id", "major_id", "intake_year", "intake_month");

-- CreateIndex
CREATE UNIQUE INDEX "template_units_planner_template_id_unit_id_key" ON "template_units"("planner_template_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "minors_planner_template_id_name_key" ON "minors"("planner_template_id", "name");

-- AddForeignKey
ALTER TABLE "majors" ADD CONSTRAINT "majors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_offerings" ADD CONSTRAINT "unit_offerings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_requisite_groups" ADD CONSTRAINT "unit_requisite_groups_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_requisite_conditions" ADD CONSTRAINT "unit_requisite_conditions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "unit_requisite_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_requisite_conditions" ADD CONSTRAINT "unit_requisite_conditions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_templates" ADD CONSTRAINT "planner_templates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_templates" ADD CONSTRAINT "planner_templates_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_units" ADD CONSTRAINT "template_units_planner_template_id_fkey" FOREIGN KEY ("planner_template_id") REFERENCES "planner_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_units" ADD CONSTRAINT "template_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_planner_template_id_fkey" FOREIGN KEY ("planner_template_id") REFERENCES "planner_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_group_units" ADD CONSTRAINT "elective_group_units_elective_group_id_fkey" FOREIGN KEY ("elective_group_id") REFERENCES "elective_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_group_units" ADD CONSTRAINT "elective_group_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minors" ADD CONSTRAINT "minors_planner_template_id_fkey" FOREIGN KEY ("planner_template_id") REFERENCES "planner_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minor_units" ADD CONSTRAINT "minor_units_minor_id_fkey" FOREIGN KEY ("minor_id") REFERENCES "minors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minor_units" ADD CONSTRAINT "minor_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
