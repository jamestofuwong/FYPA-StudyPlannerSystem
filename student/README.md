# student: the student web app

A normal Next.js 16 (App Router) site for students (public pages and a plan builder) and a CMS for editors. It deploys to Vercel. It has its own `package.json`, Prisma 7 schema (`prisma/schema.prisma`, `pg` adapter, 22 models) and tests. It is separate from the desktop app, with two exceptions: it imports `core/shared` and `core/services/scheduling` through the `@core` alias, so both apps build the same plan. It must not import `core/db` or anything else.

## Layout

| Path | Content |
|---|---|
| `app/page.tsx`, `app/planners/`, `app/units/`, `app/plan-builder/`, `app/help/` | Public pages (Server Components). |
| `app/cms/` | The CMS pages and Server Actions (for example `app/cms/(app)/help/faq/faq-actions.ts`). |
| `app/api/{cms,generate-plan,planners}` | Route handlers. |
| `proxy.ts` | Verifies the CMS JWT for `/cms/*` and sets a Content-Security-Policy with a nonce on every response and request (Next.js 16 name for what used to be `middleware.ts`). |
| `lib/catalog.ts` | Cached reads (`unstable_cache` with tags) and `revalidateStudentCache(tag)`. |
| `lib/generate-plan.ts`, `plan-builder.ts` | Plan building (calls the shared scheduler). |
| `lib/cms/` | `auth.ts` (JWT), `session.ts`, `rateLimit.ts`, `schemas.ts` (zod), `permissions.ts` (roles and access levels, pure), `access.ts` (checks against the database), `issueSession.ts`. |
| `lib/prisma.ts` | The Prisma client with the `pg` adapter. `DATABASE_URL_UNPOOLED`, when set (even empty), replaces `DATABASE_URL` at run time. |
| `prisma/` | Schema, 4 migrations, `seed.ts`. |
| `data/`, `scripts/` | Official unit detail data and the script that fetches it. |
| `next.config.ts` | Fails the build when `DATABASE_URL` or `CMS_JWT_SECRET` is missing. Sets security headers (HSTS, X-Frame-Options and others). |

## Commands (run in `student/`)

`npm run dev`, `npm run build`, `npm run db:migrate` (development), `npm run db:seed` (needs `CMS_SEED_*`), `npm run db:migrate:prod` and `npm run db:seed:prod` (read `.env.production`). The full list is generated: [commands](../docs/ai/generated/commands-and-pipelines.md). Tests run from the repository root: `npm run test:student`, `npm run test:student:integration`.

## CMS accounts and access

- Two roles. A **superadmin** has full access to every section and manages accounts (`/cms/users`). An **admin** has one level per section: `none`, `view` or `edit`. The sections are `units`, `planners`, `faq`, `contacts` and `hod` (`CMS_MODULES` in `lib/cms/permissions.ts`). Add a section there, in the sidebar and in the checks below.
- Every account can change its own name, email and password in `/cms/account`.
- Role, permissions and the active flag are read from the database on every request (`getCurrentUser`), not from the token, so a change applies at once and a deactivated account is refused.
- Every Server Action in `app/cms` must call `requireAccess('<section>', 'edit')` before it changes data, and every page must call `requirePageAccess('<section>')`. Hiding a button is only for the user. A view-only page is wrapped in `ReadOnly`.
- Rules: nobody can remove, deactivate or delete their own account, and the last active superadmin cannot be removed. A new password or a deactivation ends the sessions of that account. Existing accounts became superadmins in the migration that added roles.
- Tests: `tests/unit/permissions.test.ts`, `tests/integration/cms-accounts.test.ts`, `e2e/student/cms-accounts.spec.ts`.

## Rules

- Every page renders per request (`await connection()` in `app/layout.tsx`), because the Content-Security-Policy uses a nonce for each request (`proxy.ts` sets it on the request and the response). A static page has no nonce, its scripts are blocked, and nothing responds to clicks. Test it with `npm run test:e2e` (`e2e/student`, on a production build).
- Save in the CMS, then call `revalidateStudentCache(tag)` so public pages show the new data.
- Schema changes need a migration in `student/prisma/migrations`. The deploy workflow migrates before it deploys.
- Production needs different `CMS_JWT_SECRET` and database values from staging. Never commit `.env` files.
- The student app has its own copy of React. Its Jest config maps `react` to `student/node_modules`. Do not run student tests with the root config.
- The build type-checks the app (`ignoreBuildErrors` is off). `tsc --noEmit` in `student/` is clean and must stay clean.

Deployment: [docs/ai/deployment.md](../docs/ai/deployment.md). Secrets: [docs/ai/config-and-secrets.md](../docs/ai/config-and-secrets.md).
