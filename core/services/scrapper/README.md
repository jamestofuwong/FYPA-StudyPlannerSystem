# scrapper: the older webview scraper

The first way to read the portal: scripts run inside an Electron `<webview>` that shows the portal page, step by step (open the student dropdown, enter the id, read the grid). The newer way is `core/services/portal` (REST calls with a saved session). This folder is kept for compatibility. The folder name is spelled "scrapper" in the code. Keep the spelling.

## Entry points

- `scraperOrchestrator.ts`: `runAutoRun`, `runStudentScrape`. Runs the steps in order and reports progress.
- `advisorScraperService.ts`: one function per step, and the portal URLs.
- `advisorScraperScripts.ts`: the JavaScript strings that run inside the page.
- Client: `web/components/providers/ScraperContext.tsx`, `web/components/layout/PortalLoginModal.tsx`. The server side store is `web/app/api/scraper/store.ts` (`globalThis`). The route `web/app/api/scraper/route.ts` maps a scraped result to the app's student type.

## Rules

- It works only in Electron, because of the `<webview>` tag.
- A portal change breaks the scripts. Prefer the portal service for new work.
- Student data from a scrape is held in memory only.

## Tests

`tests/unit/scrapper`, `tests/core/advisorScraperService.test.ts` (has known failing tests), `tests/ui/scrapper*.test.tsx`, `tests/api/scrapper.test.ts`.
