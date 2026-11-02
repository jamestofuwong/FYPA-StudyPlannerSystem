# Where this project differs from standard Next.js

The desktop app uses Next.js 16 with the App Router, as a UI and API framework. It does not run or structure the app in the usual way. Read this before you copy an example from the Next.js documentation. The student app follows the usual conventions more closely.

| Topic | Standard Next.js | This project | Why |
|---|---|---|---|
| Where it runs | `next dev` or `next start`, or Vercel ([Custom server](https://nextjs.org/docs/app/guides/custom-server)) | The Electron main process starts Next.js with `next({ dev: false })` in its own HTTP server on a random local port (`startNextServer` in `electron/main.ts`). In development, `npm run dev` runs `next dev web --webpack -p 3000` and Electron loads that URL. | One installable app. No server for the advisor. |
| Bundler | Turbopack is the default in Next.js 16 ([webpack](https://nextjs.org/docs/app/api-reference/config/next-config-js/webpack)) | `web/next.config.mjs` has a `webpack` function (fallbacks for `fs`, `net`, `tls`). Next.js 16 reports a conflict when Turbopack runs with a webpack config, so every script passes `--webpack` (a fix commit added it to `next build`). | Keep the flag. Remove it only after you test a Turbopack build of the packaged app. |
| Project root | The app is at the repository root | The app is in `web/`. Commands use `next dev web` and `next build web`. Shared code is in `core/` outside it. `transpilePackages: ['core']` compiles it. | Two apps share `core/`. |
| Pages and navigation | A folder with `page.tsx` is a route | Pages are in the route group `(pages)`. One client layout (`web/app/(pages)/layout.tsx`) is an app shell with a sidebar and tabs. Tabs are client state. `web/lib/navigation.ts` maps a panel id to a path. `web/app/page.tsx` redirects to `/dashboard`. | The UI works like a desktop app with open tabs. |
| Data and changes | Server Components read. Server Actions change. | Pages are Client Components (`'use client'`) that call `fetch('/api/...')`. Route handlers are thin. Services and repositories hold the logic. The desktop app has no Server Actions. | A plain API layer is easy to test and does not depend on Electron. |
| State between requests | A route handler keeps no state | One long-lived Node.js process serves one user. The portal session, the estimation runs and the Ollama status are singletons on `globalThis`. | They survive hot reload. A web deployment needs an external store. |
| Node.js features in routes | Choose the runtime ([route segment config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)) | Routes use `child_process` (Python), Puppeteer and `fs`. Some routes set `export const runtime = 'nodejs'`. | The app runs on the advisor computer. |
| Prisma client | Import from `@prisma/client` | `base.prisma` sets the generator `output` to `node_modules/@local/prisma-client`. `core/db/client.ts` creates one client on `globalThis`. `next.config.mjs` lists it in `serverExternalPackages`. | The two apps use different Prisma versions and schemas. |
| Environment variables | Next.js loads `.env*` | A packaged app has no `.env`. The main process sets `DATABASE_URL` and `APP_DATA_DIR` in code. `next.config.mjs` loads the root `.env` for development only. | Users must not edit configuration files. |
| Streaming | Not required | Some handlers stream NDJSON or SSE (copilot chat, class-estimation run). | Show progress and text at once. |
| Middleware | Next.js 16 renamed `middleware` to `proxy` ([proxy.js](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)) | The desktop app has none. The student app uses `student/proxy.ts` (renamed from `middleware.ts` in October 2026). | Follow the Next.js 16 name. |
| Student app, rendering | Pages are static when they can be | Every page renders per request: `student/app/layout.tsx` awaits `connection()`. The Content-Security-Policy has a new nonce for each request (`student/proxy.ts` sets it on the request and the response), and Next.js can add the nonce to its inline scripts only while it renders the request ([CSP guide](https://nextjs.org/docs/app/guides/content-security-policy)). A prerendered page has no nonce, so the browser blocks its scripts and nothing responds to clicks. | Security (no `unsafe-inline` for scripts). Data stays cached in `student/lib/catalog.ts`. |
| Student app | Server Components and caching | Server Components. Cached reads with `unstable_cache` and tags. A CMS save calls `revalidateTag`. The CMS has its own JWT login and uses zod for input. | A normal web app on Vercel. |

## Next.js conventions that the project follows

- App Router files: `layout.tsx`, `page.tsx`, `route.ts`.
- A route handler exports one function for each HTTP method.
- `params` is a `Promise` in Next.js 15 and later. Await it: `const { id } = await params`.
- A file with state or browser APIs starts with `'use client'`.
- Styles are CSS Modules (`page.module.css`).
- Tests use `next/jest`.

## Gaps between the project conventions and Next.js conventions

Follow the project rule in new code.

| Topic | Next.js | Project |
|---|---|---|
| Errors in routes | Throw or return a `Response`. Pages use `error.tsx`. | A route returns `NextResponse.json({ error }, { status })` inside `try/catch`. A copilot workflow returns `{ ok: false, error }`. A page shows the error from its own state. |
| Loading states | `loading.tsx` and Suspense | A page keeps a `loading` flag and shows its own text. |
| Input checks | Check in the handler. Libraries such as Zod are common. | Desktop routes use a small helper without a library: `readBody(req, SPEC)` in `web/lib/requestBody.ts` refuses unknown fields, missing fields and wrong types with 400. The student CMS uses zod. | Section 12.6 |
| File names | Lower-case folders | Services use camelCase and take the name of their export. Components use PascalCase. A panel folder uses the panel id (`class-estimation`). |
| Shared code | A lib folder inside the app | `core/` for shared logic. `web/lib` for web-only helpers. `web/components` for components. |
| Server or client default | Server | Desktop pages are Client Components. Student pages are Server Components. |
| Two designs | Not defined | Classic and Easy from one set of components ([web/styles](../../web/styles/README.md)). A new page must work in both. |
| Where tests live | No fixed place | `tests/`, `student/tests/` and `e2e/`. None sit next to the code. |
