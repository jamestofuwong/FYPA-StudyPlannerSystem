-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "unit_category" AS ENUM ('core', 'major_core', 'prescribed_elective', 'elective', 'wil', 'mpu');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50),
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "majors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_code" VARCHAR(20) NOT NULL,
    "unit_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "replaced_by_unit_id" UUID,
    "credit_points" DECIMAL(5,1) NOT NULL DEFAULT 12.5,
    "year_level" SMALLINT NOT NULL DEFAULT 1,
    "overview" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_offerings" (
    "unit_id" UUID NOT NULL,
    "offered_in" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_offerings_pkey" PRIMARY KEY ("unit_id","offered_in")
);

-- CreateTable
CREATE TABLE "unit_requisite_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,

    CONSTRAINT "unit_requisite_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_requisite_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "unit_id" UUID,
    "credit_points" DECIMAL(5,1),
    "requisite_type" VARCHAR(20),
    "external_requisite" VARCHAR(255),

    CONSTRAINT "unit_requisite_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "major_id" UUID,
    "intake_year" SMALLINT NOT NULL,
    "intake_month" SMALLINT,
    "course_type" VARCHAR(50) NOT NULL DEFAULT 'bachelor',
    "duration_semesters" SMALLINT NOT NULL DEFAULT 6,
    "core_count" SMALLINT,
    "core_cp" SMALLINT,
    "major_count" SMALLINT,
    "major_cp" SMALLINT,
    "elective_count" SMALLINT,
    "elective_cp" SMALLINT,
    "wil_count" SMALLINT,
    "wil_cp" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planner_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planner_template_id" UUID NOT NULL,
    "unit_id" UUID,
    "category" "unit_category" NOT NULL,
    "year_level" SMALLINT NOT NULL,
    "semester" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planner_template_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elective_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_group_units" (
    "elective_group_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,

    CONSTRAINT "elective_group_units_pkey" PRIMARY KEY ("elective_group_id","unit_id")
);

-- CreateTable
CREATE TABLE "minors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planner_template_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minor_units" (
    "minor_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,

    CONSTRAINT "minor_units_pkey" PRIMARY KEY ("minor_id","unit_id")
);

-- CreateTable
CREATE TABLE "unit_learning_outcomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "ulo_number" SMALLINT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_learning_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_content_topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "topic" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_content_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "weight" SMALLINT NOT NULL,
    "ulos" INTEGER[],
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_enquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_name" VARCHAR(255) NOT NULL,
    "location" VARCHAR(255) NOT NULL,
    "hours" VARCHAR(255) NOT NULL,
    "closed_note" VARCHAR(255),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "general_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_help_desk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telephone" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "location" VARCHAR(100) NOT NULL,
    "hours_mon_thu" VARCHAR(255) NOT NULL,
    "hours_fri" VARCHAR(255) NOT NULL,
    "closed_note" VARCHAR(255),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "it_help_desk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heads_of_department" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "faculty" VARCHAR(255) NOT NULL,
    "department" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heads_of_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "majors_course_id_name_key" ON "majors"("course_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "units_unit_code_key" ON "units"("unit_code");

-- CreateIndex
CREATE UNIQUE INDEX "planner_templates_course_id_major_id_intake_year_intake_mon_key" ON "planner_templates"("course_id", "major_id", "intake_year", "intake_month");

-- CreateIndex
CREATE UNIQUE INDEX "template_units_planner_template_id_unit_id_key" ON "template_units"("planner_template_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "minors_planner_template_id_name_key" ON "minors"("planner_template_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "unit_learning_outcomes_unit_id_ulo_number_key" ON "unit_learning_outcomes"("unit_id", "ulo_number");

-- CreateIndex
CREATE UNIQUE INDEX "unit_content_topics_unit_id_position_key" ON "unit_content_topics"("unit_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "cms_users_email_key" ON "cms_users"("email");

-- AddForeignKey
ALTER TABLE "majors" ADD CONSTRAINT "majors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_replaced_by_unit_id_fkey" FOREIGN KEY ("replaced_by_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "planner_templates" ADD CONSTRAINT "planner_templates_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_units" ADD CONSTRAINT "template_units_planner_template_id_fkey" FOREIGN KEY ("planner_template_id") REFERENCES "planner_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_units" ADD CONSTRAINT "template_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_groups" ADD CONSTRAINT "elective_groups_planner_template_id_fkey" FOREIGN KEY ("planner_template_id") REFERENCES "planner_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "unit_learning_outcomes" ADD CONSTRAINT "unit_learning_outcomes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_content_topics" ADD CONSTRAINT "unit_content_topics_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_assessments" ADD CONSTRAINT "unit_assessments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_refresh_tokens" ADD CONSTRAINT "cms_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "cms_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
