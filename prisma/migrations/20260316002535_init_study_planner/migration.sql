-- CreateEnum
CREATE TYPE "UnitCategory" AS ENUM ('core', 'major_core', 'elective_major', 'elective_free', 'mpu', 'WIP');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scraper_aliases" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "majors" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    "unit_name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_templates" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "major_id" TEXT,
    "intake_year" INTEGER NOT NULL,
    "intake_month" INTEGER,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "label" TEXT,
    "review_status" TEXT NOT NULL DEFAULT 'pending',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_units" (
    "id" TEXT NOT NULL,
    "planner_template_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "category" "UnitCategory" NOT NULL,
    "year_level" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "is_compulsory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "template_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "majors_code_key" ON "majors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "units_unit_code_key" ON "units"("unit_code");

-- CreateIndex
CREATE UNIQUE INDEX "planner_templates_course_id_major_id_intake_year_intake_mon_key" ON "planner_templates"("course_id", "major_id", "intake_year", "intake_month", "version");

-- CreateIndex
CREATE UNIQUE INDEX "template_units_planner_template_id_unit_id_key" ON "template_units"("planner_template_id", "unit_id");

-- AddForeignKey
ALTER TABLE "majors" ADD CONSTRAINT "majors_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_templates" ADD CONSTRAINT "planner_templates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_templates" ADD CONSTRAINT "planner_templates_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_units" ADD CONSTRAINT "template_units_planner_template_id_fkey" FOREIGN KEY ("planner_template_id") REFERENCES "planner_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_units" ADD CONSTRAINT "template_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
