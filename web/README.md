# web: the desktop UI and its API

A Next.js 16 (App Router) app in `web/`, not at the repository root. Electron starts it. Read [docs/ai/nextjs-differences.md](../docs/ai/nextjs-differences.md) first: this app is not standard Next.js in several ways.

## Layout

| Folder | Content |
|---|---|
| `app/(pages)/<panel>/page.tsx` | One folder for each panel. The list is generated: [panels](../docs/ai/generated/panels.md). Next to `page.tsx`: `page.module.css` and page-only components. |
| `app/(pages)/layout.tsx` | The app shell: top bar (Classic), sidebar, tab bar, status bar (Classic), update banner, privacy notice gate, portal login modal, database and shutdown overlays, and the context providers. A client component. |
| `app/layout.tsx`, `app/page.tsx` | The root layout, and a redirect from `/` to `/dashboard`. |
| `app/api/**/route.ts` | Route handlers ([README](app/api/README.md)). |
| `components/layout` | Shell parts: `Sidebar`, `TabBar`, `StatusBar`, `TopBar`, `UpdateBanner`, `PortalLoginModal`. |
| `components/common` | Shared building blocks for both designs (`Primitives`, `MeadowBits`, `HueWheel`, `MinorProgressCard`). |
| `components/providers` | React contexts: `PortalAuthContext`, `ScraperContext`, `StudentSessionContext`, `ToastProvider`, `CopilotHandoffLoader`. |
| `components/privacy`, `components/planner`, `ExportModal.tsx` | The privacy notice, planner table pieces, the Excel export dialog. |
| `styles/` | Themes ([README](styles/README.md)). |
| `lib/` | `navigation.ts` (panel registry), `panelIcons.ts`, `copilotLinks.ts`, `resultsSheet.ts` (Excel results parser), `privacyNoticeContent.ts` (notice text and `NOTICE_VERSION`), `scrollToTop.ts`. |
| `components/tour`, `lib/tour` | The interactive walkthroughs (see below). |
| `public/guide` | Screenshots for the user guide page (Easy, and Classic in `web/public/guide/classic`). |

## Rules

- Pages are Client Components that call `/api/*`. No Server Actions here.
- The student, the portal state and the toasts are shared through the providers. Student data stays in memory.
- A panel appears in five places: the `PanelId` type, `PANEL_IDS` and `PANEL_PATHS` in `lib/navigation.ts`; `TAB_META` in `components/layout/TabBar.tsx`; `PANEL_LABELS` in `components/layout/StatusBar.tsx`; and `PANEL_ICONS` in `lib/panelIcons.ts`. Add a `page.tsx` folder too. `tests/unit/navigation-registry.test.ts` fails if one is missing. It does not check that the panel has a sidebar item: add one to `NAV_SECTIONS` yourself.
- Make every page work in both designs (Classic and Easy). Easy styles use the `m` classes in the page CSS module and the shared components.
- Call the Electron bridge only with a guard (`window.xAPI?.fn()`). The page must run in a plain browser.
- Add the page to the user guide (`app/(pages)/user-guide/GuideParts.tsx`, `shots.ts`) when it is a user-visible feature.

## Walkthroughs

Each job in the user guide has a **Walk me through it** button. It starts a walkthrough that highlights the real buttons and says what to do, step by step, on the real pages.

- The steps are in `lib/tour/tours.ts`: one walkthrough for each job of `app/(pages)/user-guide/page.tsx`, with the same id as the `tour` of the job. A test checks that every job has one.
- A step names a page (`path`), a `target` and the text. The target uses the same finder as the user-guide screenshots (`lib/tour/findElement.ts`: visible text, or a CSS selector). Use `{ meadow, classic }` when Easy and Classic do not show the same thing.
- `missing` says what to do when the target is not on the screen yet (for example "Load a student first"). The card waits and picks the target up when it appears. Give every step that needs data a `missing` text.
- `advanceOnClick` moves on when the person presses the highlighted thing.
- `components/tour/TourProvider.tsx` holds the state (kept in `sessionStorage`, so a reload goes on at the same step) and opens the page of each step. `TourOverlay.tsx` draws the highlight and the card. They are in `app/(pages)/layout.tsx`. The highlight lets every click through, so the whole app stays usable.
- The sidebar buttons have `data-tour="nav-<panel>"`, so that a step can point at them in both designs.
- Tests: `tests/ui/walkthrough.test.tsx` (data, finder, card placement, behaviour) and `e2e/walkthrough.spec.ts` (every step, in both designs, on the real pages). If a page changes and a step cannot find its target, the e2e test fails.

## Add a panel

1. `web/app/(pages)/<id>/page.tsx` (start with `'use client'` if it has state).
2. Add the id in the five places above, and a sidebar item in `NAV_SECTIONS`.
3. API: `web/app/api/<name>/route.ts`, then a service or repository.
4. Tests: a component test in `tests/ui` (for example `tests/ui/unit-offerings-modal.test.tsx` renders a page component with Testing Library), and a route test in `tests/api` (mocked) or `tests/integration-db` (real database).
5. `npm run docs:facts`.

## Tests

`tests/ui` (jsdom), `tests/api` (route handlers), `e2e/` (Chromium, both designs).
