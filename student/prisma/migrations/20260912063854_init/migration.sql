-- CreateEnum
CREATE TYPE "unit_category" AS ENUM ('core', 'major_core', 'prescribed_elective', 'elective', 'wil', 'mpu');

-- CreateEnum
CREATE TYPE "requisite_type" AS ENUM ('prerequisite', 'corequisite', 'antirequisite');

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "majors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "major_id" UUID,
    "intake_month" SMALLINT NOT NULL,
    "intake_year" SMALLINT NOT NULL,
    "duration_years" SMALLINT NOT NULL DEFAULT 3,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "planner_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "year_number" SMALLINT NOT NULL,
    "sem_number" SMALLINT NOT NULL,
    "label" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semester_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "semester_id" UUID NOT NULL,
    "unit_id" UUID,
    "category" "unit_category" NOT NULL,
    "is_elective_slot" BOOLEAN NOT NULL DEFAULT false,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "semester_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elective_pool_units" (
    "template_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,

    CONSTRAINT "elective_pool_units_pkey" PRIMARY KEY ("template_id","unit_id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "credit_points" DECIMAL(5,1) NOT NULL DEFAULT 12.5,
    "year_level" SMALLINT NOT NULL,
    "overview" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_availability" (
    "unit_id" UUID NOT NULL,
    "month" SMALLINT NOT NULL,

    CONSTRAINT "unit_availability_pkey" PRIMARY KEY ("unit_id","month")
);

-- CreateTable
CREATE TABLE "unit_requisites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "requisite_type" "requisite_type" NOT NULL,
    "requisite_unit_id" UUID NOT NULL,

    CONSTRAINT "unit_requisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_learning_outcomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "ulo_number" SMALLINT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "unit_learning_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_content_topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "topic" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

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
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "unit_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

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
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "heads_of_department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "majors_course_id_name_key" ON "majors"("course_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "planner_templates_course_id_major_id_intake_month_intake_ye_key" ON "planner_templates"("course_id", "major_id", "intake_month", "intake_year");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_template_id_year_number_sem_number_key" ON "semesters"("template_id", "year_number", "sem_number");

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "unit_requisites_unit_id_requisite_type_requisite_unit_id_key" ON "unit_requisites"("unit_id", "requisite_type", "requisite_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_learning_outcomes_unit_id_ulo_number_key" ON "unit_learning_outcomes"("unit_id", "ulo_number");

-- CreateIndex
CREATE UNIQUE INDEX "unit_content_topics_unit_id_position_key" ON "unit_content_topics"("unit_id", "position");

-- AddForeignKey
ALTER TABLE "majors" ADD CONSTRAINT "majors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_templates" ADD CONSTRAINT "planner_templates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_templates" ADD CONSTRAINT "planner_templates_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "planner_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_units" ADD CONSTRAINT "semester_units_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_units" ADD CONSTRAINT "semester_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_pool_units" ADD CONSTRAINT "elective_pool_units_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "planner_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elective_pool_units" ADD CONSTRAINT "elective_pool_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_availability" ADD CONSTRAINT "unit_availability_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_requisites" ADD CONSTRAINT "unit_requisites_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_requisites" ADD CONSTRAINT "unit_requisites_requisite_unit_id_fkey" FOREIGN KEY ("requisite_unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_learning_outcomes" ADD CONSTRAINT "unit_learning_outcomes_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_content_topics" ADD CONSTRAINT "unit_content_topics_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_assessments" ADD CONSTRAINT "unit_assessments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
