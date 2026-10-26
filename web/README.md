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
| `public/guide` | Screenshots for the user guide page (Easy, and Classic in `web/public/guide/classic`). |

## Rules

- Pages are Client Components that call `/api/*`. No Server Actions here.
- The student, the portal state and the toasts are shared through the providers. Student data stays in memory.
- A panel appears in five places: the `PanelId` type, `PANEL_IDS` and `PANEL_PATHS` in `lib/navigation.ts`; `TAB_META` in `components/layout/TabBar.tsx`; `PANEL_LABELS` in `components/layout/StatusBar.tsx`; and `PANEL_ICONS` in `lib/panelIcons.ts`. Add a `page.tsx` folder too. `tests/unit/navigation-registry.test.ts` fails if one is missing. It does not check that the panel has a sidebar item: add one to `NAV_SECTIONS` yourself.
- Make every page work in both designs (Classic and Easy). Easy styles use the `m` classes in the page CSS module and the shared components.
- Call the Electron bridge only with a guard (`window.xAPI?.fn()`). The page must run in a plain browser.
- Add the page to the user guide (`app/(pages)/user-guide/GuideParts.tsx`, `shots.ts`) when it is a user-visible feature.

## Add a panel

1. `web/app/(pages)/<id>/page.tsx` (start with `'use client'` if it has state).
2. Add the id in the five places above, and a sidebar item in `NAV_SECTIONS`.
3. API: `web/app/api/<name>/route.ts`, then a service or repository.
4. Tests: a component test in `tests/ui` (for example `tests/ui/unit-offerings-modal.test.tsx` renders a page component with Testing Library), and a route test in `tests/api` (mocked) or `tests/integration-db` (real database).
5. `npm run docs:facts`.

## Tests

`tests/ui` (jsdom), `tests/api` (route handlers), `e2e/` (Chromium, both designs).
