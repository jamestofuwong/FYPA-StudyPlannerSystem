# Build, release and deployment

Three GitHub Actions workflows run the project. A person does not deploy by hand. The generated list is [generated/commands-and-pipelines.md](generated/commands-and-pipelines.md).

| Pipeline | Starts when | What it does | Where to check it |
|---|---|---|---|
| Desktop release (`release-local.yml`) | You push a tag that starts with `v` | Builds installers on macOS and Windows. Publishes them to GitHub Releases. | Actions, Release Local App; then Releases |
| Student staging (`deploy-student.yml`) | You push to `main` and the push changes a file in `student/` | Migrates the staging Supabase database if the schema changed. Then deploys the staging Vercel project. | Actions, Deploy Student App; then the staging site |
| Student production | You push to `production` | The same steps for the production projects. The `production` GitHub environment can ask for approval. | The same; then the live site |
| Tests (`tests.yml`) | A pull request, or a push to `main` | Typecheck and lint; unit, integration (real PostgreSQL) and end-to-end tests | Actions, Tests |

## Build commands

See [generated/commands-and-pipelines.md](generated/commands-and-pipelines.md) for the full list. The main ones: `npm run dev`, `npm run build` (prisma generate, `next build web --webpack`, tsup for `electron/`), `npm run build:python` (PyInstaller into `resources/python/`), `npm run download:ollama`, `npm run pack` (unpacked app in `release/`), `npm run dist` (installers), `npm run release` (publish; CI runs it).

`electron-builder` settings are in `package.json` under `build`. The app id is `com.fyp.studyplannersystem`. The `afterPack` hook `scripts/fix-embedded-postgres-dylibs.js` restores macOS library links. The app is packed in an asar archive, and a program cannot run from inside it, so three things must stay true (`tests/unit/packaging-embedded-postgres.test.ts` checks them). `scripts/apply-patches.js` (run by `postinstall` and by the release workflow on every platform) makes each `@embedded-postgres/<platform>` package look in `app.asar.unpacked` first. `prisma` is a runtime dependency, and it and every package it needs are listed in `asarUnpack`, because the first start runs `prisma migrate deploy` in a separate Node process. `core/db` is unpacked for the same reason. If one of these is missing, a new installation starts with no database tables and every page shows an error. Before a release, pack the app (`npx electron-builder --mac --dir`), start it with an empty `--user-data-dir`, and check that `/api/planners` returns data.

## Release the desktop app

Before the first release: GitHub Actions is on; the `publish` block in `package.json` names the right owner and repository (the updater reads releases from there); the repository allows `contents: write` for workflows.

1. Merge to `main`. Make sure that `npm run build` works.
2. Choose a version. List tags with `git tag --sort=-v:refname | head`.
3. `git tag v0.1.42` then `git push origin v0.1.42`.
4. Watch Actions, Release Local App. Both jobs (macOS and Windows) must pass.
5. Releases must list `.dmg`, `.zip`, `.exe`, `latest.yml` and `latest-mac.yml`.
6. Install on a clean machine. Settings shows the new version.

The workflow sets the app version from the tag. The `version` in `package.json` in Git stays `0.1.0`. This is normal. The builds are not code-signed (SmartScreen and Gatekeeper warn; macOS auto-update can fail). To sign, add `CSC_LINK` and `CSC_KEY_PASSWORD` and remove `CSC_IDENTITY_AUTO_DISCOVERY: false` in the workflow.

**Auto-update.** `electron-updater` reads the release files from GitHub. `autoDownload` is false, so the user chooses. `autoInstallOnAppQuit` is true. `updater-install` stops the database first, then calls `quitAndInstall`, to avoid a corrupt update on Windows. Test an update before you announce a release: install release N, publish N+1, open N, click Check for updates.

## Deploy the student app

`deploy-student.yml` has three jobs. **Detect changes** sets `db` (schema or migrations changed) and `app` (other `student/` files changed). **Migrate** runs `prisma migrate deploy` when `db` is true. **Deploy** runs `vercel deploy --prod` when `app` is true, and only if Migrate passed or did not run. A manual run forces both. A change that touches only `student/prisma/**` migrates and does not redeploy. A change to only `student/README.md` (or only to files outside `student/`) deploys nothing. The workflow never seeds.

The workflow does not require a pull request or an approval, except the optional reviewers of the `production` GitHub environment. Branch rules (who may push or merge to `main` and `production`) are GitHub settings, and the repository does not hold them: check **Settings, Branches** before you rely on them.

Node versions: the migrate and deploy jobs of `deploy-student.yml` use Node 20 on the runner. The Vercel project builds with Node 22.x (a project setting), and `tests.yml` and the release workflow use Node 22.

Secrets: `DATABASE_URL_DEV`, `DATABASE_URL_PROD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_STAGING`, `VERCEL_PROJECT_ID_PROD`. How to get them: [config-and-secrets.md](config-and-secrets.md). Staging and production are two separate Vercel projects. Each is deployed to its own Production environment.

**Build the pipeline from zero**

1. Create two Supabase projects (staging, production). Copy the Session pooler string (port 5432) of each, with the real password.
2. Create two Vercel projects from the same repository. Settings, General: Root Directory `student`; turn on Include source files outside of the Root Directory; Node.js 22.x.
3. In each Vercel project add `DATABASE_URL` and `CMS_JWT_SECRET` for Production. Use a different `CMS_JWT_SECRET` for each.
4. Disconnect the Git repository in each Vercel project (`student/vercel.json` also sets `git.deploymentEnabled` to false). Actions must be the only deployer.
5. Add the GitHub secrets. Create a GitHub environment named `production`. Add required reviewers if you want an approval gate.
6. Run Actions, Deploy Student App, Run workflow on `main`. It creates the tables in staging and deploys staging.
7. Seed staging from your computer: put the staging URL in `student/.env.production`, set the `CMS_SEED_*` values, run `npm run db:seed:prod`. The seeded account is a superadmin. It creates the other accounts in the CMS (`/cms/users`).
8. Merge `main` into `production`. Run the workflow on `production`. Seed production in the same way.
9. Open the site and sign in at `/cms/login`.

A new database has tables but no data until you seed it. A push that changes no schema file does not migrate. Use a manual run for a new environment. zsh: wrap a database URL in single quotes (`%` and `&` break it).

## Check that a deployment worked

| Pipeline | Check |
|---|---|
| Desktop release | Both jobs green. Releases list the five file types. Install on a clean machine. Settings shows the version. The previous version finds the update. |
| Student app | The three jobs are green or skipped on purpose. The newest Vercel deployment is Ready for the right commit. A planner page shows data. `/cms/login` works. After a migration, Supabase shows the new tables. |
| Tests | The four jobs are green. |

## Rollback

- Student app: redeploy an older commit with Actions, Run workflow, or Promote an older deployment in Vercel.
- Database: write a new migration that reverses the change. Prisma has no automatic down migration.
- Desktop app: publish a new tag with the fix. Installed apps cannot go back. Delete a bad release on GitHub so new users do not get it.

## Environments

| | Development | Staging | Production |
|---|---|---|---|
| Desktop app | `npm run dev` | None | A release tag |
| Student app | `npm run dev` in `student/` | Branch `main`, Vercel staging, Supabase dev | Branch `production`, Vercel production, Supabase live |
| Database | Embedded PostgreSQL (desktop) or any PostgreSQL (student) | Supabase dev project | Supabase live project |
