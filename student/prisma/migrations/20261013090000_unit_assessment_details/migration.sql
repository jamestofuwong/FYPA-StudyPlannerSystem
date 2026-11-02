-- AlterTable
ALTER TABLE "unit_assessments"
  DROP COLUMN "title",
  ALTER COLUMN "weight" DROP NOT NULL,
  ADD COLUMN "task" VARCHAR(255),
  ADD COLUMN "weighting_raw" TEXT;
