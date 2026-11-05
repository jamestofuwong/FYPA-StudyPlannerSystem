# Configuration and secrets

**No secret value is ever written in this repository or in these documents.** This file names variables and says where to set them. The list of every variable that the code reads is generated: [generated/env-vars.md](generated/env-vars.md).

## Environment files

| File | In Git? | Used when | Content |
|---|---|---|---|
| `.env` (root) | No | Development, tests, Prisma CLI | `DATABASE_URL` for the embedded database (port 5433). Loaded by `web/next.config.mjs`. |
| `web/.env` | No | Development, `npm run build:python` | `PYTHON_EXECUTABLE`: the path of the Python in your virtual environment. |
| `student/.env` | No | Student app, local | `DATABASE_URL`, `CMS_JWT_SECRET`. The build stops if either is missing (`student/next.config.ts`). |
| `student/.env.production` | No | `npm run db:seed:prod`, `db:migrate:prod` | The production `DATABASE_URL` (session pooler, port 5432) and the `CMS_SEED_*` values. |
| Vercel project settings | n/a | The student app on Vercel | `DATABASE_URL`, `CMS_JWT_SECRET`, optional `DATABASE_URL_UNPOOLED`. |
| GitHub secrets | n/a | Workflows | See the table below. |

Each ignored file has a committed template: `.env.example`, `web/.env.example`, `student/.env.example` and `student/.env.production.example`. Copy one and fill it in. The templates hold names and safe placeholders only.

The packaged desktop app has no `.env`. The main process sets `DATABASE_URL` and `APP_DATA_DIR` in code. Everything else uses defaults. If the packaged app needs a new value, set it in `electron/main.ts` or give it a default in code.

## Where each value comes from

| Variable | Where it is set | How to get or create it | Secret? |
|---|---|---|---|
| `DATABASE_URL` (desktop) | Root `.env`. The packaged app sets it in `main.ts`. | Development: `postgresql://studyplanner_user:<default password>@127.0.0.1:5433/studyplanner`. The defaults are in `runtime/postgres/db.ts` (`DB_*` variables override them). | No (local only) |
| `DATABASE_URL` (student) | `student/.env`; Vercel (Production); GitHub secrets `DATABASE_URL_DEV` and `DATABASE_URL_PROD` for migrations | Supabase, Connect, **Session pooler** string, port 5432, with the real password. Encode special characters. Prisma migrations hang on port 6543. | Yes |
| `DATABASE_URL_UNPOOLED` | Vercel (optional) | The Supabase pooler string (port 6543). Despite the name it holds the pooled string. If set (even empty), it replaces `DATABASE_URL` at run time in `student/lib/prisma.ts`. | Yes |
| `CMS_JWT_SECRET` | `student/.env`; Vercel, a different value for each environment | A random string of 32 bytes or more: `openssl rand -base64 32` | Yes |
| `CMS_SEED_EMAIL`, `CMS_SEED_PASSWORD`, `CMS_SEED_NAME` | `student/.env.production`, only when you seed | Choose them. The defaults are insecure. | Yes (password) |
| `VERCEL_TOKEN` | GitHub secret | Vercel, Account Settings, Tokens | Yes |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_STAGING`, `VERCEL_PROJECT_ID_PROD` | GitHub secrets | `orgId` and `projectId` in `.vercel/project.json` after `vercel link` | Keep private |
| `GITHUB_TOKEN` | GitHub creates it for each run | Nothing to do in a workflow. For `npm run download:ollama` on your computer, make a personal access token (`GH_TOKEN` also works). | Yes |
| `PYTHON_EXECUTABLE` | `web/.env` | The Python in `core/services/plannerImport/.venv` | No |
| `APP_DATA_DIR`, `NEXT_DEV_SERVER_URL`, `DB_*` | The code or `npm run dev` | Nothing to do | No |
| `CLASS_ESTIMATION_SOURCE` | The process environment (optional) | Chooses the mock or the real portal source (`core/services/classEstimation/sources/resolvePortalSource.ts`) | No |

The default local database password is in the source code. This is acceptable only because the database listens on 127.0.0.1 and holds no student records. Do not copy this pattern for a network database.

## Fixed settings in code

| Setting | Value | File |
|---|---|---|
| Ollama port and model | 11435, `qwen2.5:3b` | `core/config/ollama.ts` |
| Database port | 5433 | `runtime/postgres/db.ts` |
| Next.js dev server | 3000 | the `dev` script |
| Update check | 5 s after start, then every 4 h | `electron/main.ts` |
| Matching weights and thresholds | see the matching README | `core/shared/types/matching.ts` |
| Scheduler caps | 4 standard and 1 MPU per semester | `SchedulerConfig` in `customPlannerScheduler.ts` |
| Privacy notice version | `NOTICE_VERSION` | `web/lib/privacyNoticeContent.ts` |

## Rotate a secret or hand over to a new owner

Never put a value in Git, an email or a chat. Give the new owner access to the accounts. Then the new owner creates new values.

| Secret | Can you read it later? | How to replace it |
|---|---|---|
| GitHub Actions secret | No | Add it again with the same name. |
| Vercel environment variable | Yes, in the project settings | Edit it and redeploy. |
| Supabase database password | No, only reset | Reset in Supabase, then update `DATABASE_URL` in Vercel and `DATABASE_URL_DEV` or `DATABASE_URL_PROD` in GitHub. |
| `CMS_JWT_SECRET` | Yes, in Vercel | Make a new random value and redeploy. Every CMS user signs in again. |
| `VERCEL_TOKEN` | No | Create a new token. Delete the old one. |
| CMS account password | No (only a hash is stored) | The person changes it in the CMS (`/cms/account`), or a superadmin sets a new one in `/cms/users`. If every superadmin lost it, seed again with a new `CMS_SEED_EMAIL`. The seed never changes an existing account. |

Rotate `CMS_JWT_SECRET` at once if it was ever shown on a screen, in a chat or in a log.

## Add an environment variable

1. Read it with `process.env.NAME` in code. Give it a default if the packaged app needs one.
2. Set it for development in the right `.env` file, in Vercel, and in GitHub secrets if a workflow needs it.
3. Run `npm run docs:facts`. The new name appears in [generated/env-vars.md](generated/env-vars.md). Describe it in the table above.
