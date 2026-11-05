# web/app/api: route handlers

One folder for each URL, with a `route.ts` that exports one function for each HTTP method. The full list is generated from the files: [api-routes](../../../docs/ai/generated/api-routes.md).

## Pattern (thin controller)

```ts
export async function GET() {
  try {
    const courses = await courseRepository.getAllCourses();
    return NextResponse.json(courses, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
  }
}
```

A route parses the request, calls one service or repository, and replies. The logic is in `core/`. A dynamic segment uses `[id]` and `params` is a `Promise` (`const { id } = await params`).

## Rules

- Return `{ error }` with a status code: 400 for bad input (including a body that is not JSON), 401 when the portal session is missing or expired, 404 for a missing row, 500 for a database refusal, 502 for a portal failure. The UI relies on these codes.
- Check every request body with `readBody(req, SPEC)` from `web/lib/requestBody.ts` before it reaches a repository. It refuses unknown fields (a caller must not set `id`, `created_at` or a foreign key), missing fields and wrong types with 400. Add the spec of a new table next to the others in that file.
- Routes that start Python, Puppeteer or read files run in Node.js: set `export const runtime = 'nodejs'`.
- `copilot/chat` and `class-estimation/run` stream NDJSON or SSE.
- The privacy gate: `POST /api/import` returns 403 until the privacy notice of the current `NOTICE_VERSION` is acknowledged (`/api/privacy/acknowledge`, `/api/privacy/status`).
- Routes that keep state use stores on `globalThis` (`scraper/store.ts`, `ollama/store.ts`). They must survive hot reload.
- `mock` is legacy. Do not extend it. (The retired cloud sync route and page were removed in October 2026.)

## Tests

`tests/api/*` call the exported functions with a `Request` and mock the repository. `tests/integration-db/api-db.test.ts` and `api-crud.test.ts` call routes against a real database without mocks. `tests/api/portal-routes.test.ts` covers the portal routes.
