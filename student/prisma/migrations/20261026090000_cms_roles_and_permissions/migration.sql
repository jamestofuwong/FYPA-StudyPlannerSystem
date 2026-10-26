-- CreateEnum
CREATE TYPE "CmsRole" AS ENUM ('superadmin', 'admin');

-- AlterTable
ALTER TABLE "cms_users"
  ADD COLUMN "role" "CmsRole" NOT NULL DEFAULT 'admin',
  ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Every account that exists before this migration had full access, so each one becomes a superadmin.
UPDATE "cms_users" SET "role" = 'superadmin';
