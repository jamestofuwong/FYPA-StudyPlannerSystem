-- CreateTable
CREATE TABLE "cms_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

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
CREATE UNIQUE INDEX "cms_users_email_key" ON "cms_users"("email");

-- AddForeignKey
ALTER TABLE "cms_refresh_tokens" ADD CONSTRAINT "cms_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "cms_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
