-- CreateEnum
CREATE TYPE "UnitDetailSection" AS ENUM ('overview', 'learning_outcomes', 'content_topics', 'assessments');

-- CreateTable
CREATE TABLE "unit_detail_section_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unit_id" UUID NOT NULL,
    "section" "UnitDetailSection" NOT NULL,
    "pending_snapshot" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "unit_detail_section_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_detail_section_states_unit_id_section_key"
ON "unit_detail_section_states"("unit_id", "section");

-- AddForeignKey
ALTER TABLE "unit_detail_section_states"
ADD CONSTRAINT "unit_detail_section_states_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
