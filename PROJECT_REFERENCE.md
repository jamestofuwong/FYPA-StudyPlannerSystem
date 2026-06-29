# Study Planner System — Project Reference

> **Purpose of this document:** Single source of truth for AI agents and developers. Read this before touching any part of the codebase. It covers background, problem statement, architecture, every feature, data models, API contracts, and known gaps.
>
> **Source of truth priority:** This document was derived from the actual codebase. Where it conflicts with other documentation files (`docs/AGENTS.md`, `FYPA-StudyPlannerSystem.wiki/**`), **this document wins** — those files are outdated and have not been kept in sync with the codebase. Always defer to the actual source files in `core/`, `web/`, `electron/`, and `runtime/` if any doubt remains.

---

## Table of Contents

1. [Background & Problem Statement](#1-background--problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Architecture](#5-architecture)
6. [Database Schema](#6-database-schema)
7. [Core Services (Business Logic)](#7-core-services-business-logic)
   - 7.1 [Major Detection Pipeline](#71-major-detection-pipeline)
   - 7.2 [Student Portal Scraper](#72-student-portal-scraper)
   - 7.3 [Planner Website Scraper (Cloud Only)](#73-planner-website-scraper-cloud-only)
   - 7.4 [Planner PDF Import (Python Service)](#74-planner-pdf-import-python-service)
   - 7.5 [Excel Export Service](#75-excel-export-service)
   - 7.6 [Analytics Service](#76-analytics-service)
8. [API Routes (Local App)](#8-api-routes-local-app)
9. [Frontend Pages & UI](#9-frontend-pages--ui)
10. [Electron Shell](#10-electron-shell)
11. [Cloud Admin App](#11-cloud-admin-app)
12. [Build & Distribution](#12-build--distribution)
13. [Testing](#13-testing)
14. [Environment Variables & Configuration](#14-environment-variables--configuration)
15. [Key Data Flows](#15-key-data-flows)
16. [Known Gaps & Undocumented Areas](#16-known-gaps--undocumented-areas)

---

## 1. Background & Problem Statement

This is a **Final Year Project (FYP)** for a Malaysian university, built for **Swinburne University of Technology Sarawak Campus**.

**The problem:**
- Academic Advisors and Heads of Department need to manually track which major each student is enrolled in and whether they are on track for graduation.
- Student progression data lives in a university portal (CampusNexus `sisportal-100380.campusnexus.cloud/CMCPortal`), but there is no automated tool to cross-reference a student's completed units against official study planners.
- Official study planners exist as PDFs on the university website (`swinburne.edu.my`) but are not in any structured database format.
- There is no existing tool that can take a student's transcript and tell an advisor: "this student is in the AI major, they have completed 78% of their requirements, and these 4 units are still missing."

**The solution:**
A self-contained desktop application that:
1. Extracts student data from the portal (automated or manual).
2. Runs a major detection algorithm against study planner templates stored locally.
3. Shows advisors the detected major, match percentage, per-category breakdown, and missing units.
4. Optionally exports a structured Excel report.

**Privacy constraint:** All student data must remain on the advisor's machine. No student records are sent to any external server.

---

## 2. Solution Overview

The system has two distinct parts:

### Local Desktop Application (primary)
An Electron app that runs entirely on the advisor's machine. It embeds:
- A **Next.js web server** (the UI + API layer)
- A **PostgreSQL database** (stores planner templates and configuration)
- An **Ollama LLM server** (optional, for AI-assisted planner review)
- A **Python binary** (for PDF structure extraction)

No network connection is required for daily use. Student data never leaves the device.

### Cloud Admin Application (secondary, optional)
A separate Next.js app deployed via Docker Compose, operated by an admin (not end-users). Its sole purpose is to:
1. Scrape the Swinburne website to download planner PDFs.
2. Parse those PDFs into structured data using the Python service.
3. Expose the parsed planners via an API so the local app can "sync" them.

The local app can work entirely without the cloud app — planners can also be imported manually via PDF upload or manual unit entry.

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop shell | Electron | ^41.3.0 |
| UI framework | React | 19.2.4 |
| Web framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | 5.9.3 |
| Database ORM | Prisma | ^6.19.2 |
| Database | PostgreSQL (embedded) | 18.3.0-beta.16 |
| Icon library | lucide-react | ^1.14.0 |
| Excel generation | xlsx-js-style | ^1.2.0 |
| Web scraping | Puppeteer | ^25.0.4 |
| LLM runtime | Ollama (local) | bundled binary |
| PDF extraction | Python 3 (PyInstaller binary) | bundled binary |
| Auto-update | electron-updater | ^6.8.3 |
| Build (Electron) | tsup | 8.5.1 |
| Packaging | electron-builder | 26.8.1 |
| Testing | Jest | ^30.3.0 |
| CSS | CSS Modules + CSS Variables | — |

**Build tools:** concurrently, cross-env, wait-on, patch-package, tsx

**Distribution targets:** macOS (DMG + ZIP), Windows (NSIS installer), Linux (AppImage)

---

## 4. Repository Structure

```
FYPA-StudyPlannerSystem/
│
├── electron/                    # Electron main process
│   ├── main.ts                  # App lifecycle, IPC, embedded DB/Ollama startup
│   └── preload.ts               # Secure renderer bridge (contextBridge)
│
├── web/                         # Next.js application
│   ├── app/
│   │   ├── (pages)/             # Route group — user-facing pages
│   │   │   ├── layout.tsx       # Shell layout (Sidebar, TabBar, TopBar, StatusBar)
│   │   │   ├── dashboard/       # Major detection results UI
│   │   │   ├── scraping/        # Portal scraping interface
│   │   │   ├── import/          # Planner PDF import UI
│   │   │   ├── planners/        # Planner template viewer
│   │   │   ├── cloud-sync/      # Cloud planner sync
│   │   │   ├── settings/        # App settings (theme, threshold, updates)
│   │   │   └── user-guide/      # Built-in help docs
│   │   ├── api/                 # Next.js route handlers (HTTP API)
│   │   │   ├── ping/            # Health check
│   │   │   ├── match/           # POST — runs major detection pipeline
│   │   │   ├── scraper/         # POST — receives scraped student data
│   │   │   ├── import/          # POST — parses Excel transcript file
│   │   │   ├── planners/        # CRUD for planner templates
│   │   │   │   └── save/        # POST — saves a parsed planner to DB
│   │   │   ├── courses/         # CRUD for courses
│   │   │   ├── majors/          # CRUD for majors
│   │   │   ├── units/           # CRUD for units
│   │   │   │   └── check/       # POST — validate unit codes
│   │   │   ├── elective-groups/ # CRUD for elective groups
│   │   │   ├── elective-group-units/ # Add/remove units from groups
│   │   │   ├── template-units/  # CRUD for template units
│   │   │   ├── export/          # POST — generate Excel workbook
│   │   │   ├── cloud-sync/      # GET list / POST pull from cloud
│   │   │   ├── ollama/          # GET status / POST pull model
│   │   │   ├── privacy/         # GET status / POST acknowledge
│   │   │   ├── config/          # GET/POST system config
│   │   │   ├── custom-planner/  # POST — save custom planner schedule
│   │   │   └── mock/student/    # GET — hardcoded test student
│   │   └── lib/                 # Shared web utilities
│   │       └── privacyNoticeContent.ts  # Privacy notice text + version
│   ├── components/
│   │   ├── layout/              # Shell components
│   │   │   ├── TopBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── StatusBar.tsx
│   │   │   ├── UpdateBanner.tsx
│   │   │   └── PortalLoginModal.tsx
│   │   ├── planner/             # Reusable planner display components
│   │   │   ├── CourseListTable.tsx
│   │   │   └── PlannerHeader.tsx
│   │   ├── providers/           # React context providers
│   │   │   ├── PortalAuthContext.tsx   # Portal login state
│   │   │   ├── ScraperContext.tsx      # Scraper state machine
│   │   │   └── ToastProvider.tsx       # Toast notifications
│   │   ├── ExportModal.tsx      # Export section selector
│   │   └── privacy/
│   │       └── PrivacyNoticeModal.tsx
│   └── styles/
│       ├── themeProvider.tsx    # Theme (system/light/dark/portal)
│       └── globals.css          # CSS variables, base styles
│
├── core/                        # Pure business logic — no React/Electron/Next deps
│   ├── services/
│   │   ├── matching/            # 6-phase major detection algorithm
│   │   │   ├── matchingService.ts      # Pipeline orchestrator (entry point)
│   │   │   ├── plannerFilter.ts        # Phase 1: filter by intake
│   │   │   ├── unitNormalizer.ts       # Phase 2a: normalize unit codes
│   │   │   ├── profileBuilder.ts       # Phase 2a: classify student units
│   │   │   ├── scoringEngine.ts        # Phase 2b/3: weighted scoring
│   │   │   ├── majorDetector.ts        # Phase 4/5: ranking & detection
│   │   │   ├── outputPackager.ts       # Phase 6: build display payload
│   │   │   └── configValidator.ts      # Validate algorithm config
│   │   ├── scrapper/            # Student portal scraper
│   │   │   ├── advisorScraperService.ts    # Step runner + orchestration
│   │   │   └── advisorScraperScripts.ts    # JS scripts executed in webview
│   │   ├── plannerScraper/      # Swinburne website planner scraper (cloud use)
│   │   │   ├── plannerScraperService.ts    # Step definitions
│   │   │   ├── plannerScraperOrchestrator.ts
│   │   │   ├── plannerScraperAdapter.ts    # BrowserAdapter interface
│   │   │   ├── plannerScraperScripts.ts    # DOM scripts
│   │   │   └── types.ts
│   │   ├── plannerImport/       # PDF → structured planner data (via Python)
│   │   │   ├── plannerImportService.ts     # Spawns Python binary
│   │   │   └── plannerStructureService.py  # Python PDF extraction script
│   │   ├── export/
│   │   │   └── exportService.ts            # Multi-sheet Excel workbook
│   │   ├── scheduling/
│   │   │   └── customPlannerScheduler.ts   # Custom planner creation
│   │   ├── analyticsService.ts  # Credit progress calculations
│   │   ├── pingService.ts       # Health check
│   │   └── studentService.ts    # Mock/hardcoded student for testing
│   ├── db/
│   │   ├── client.ts            # Singleton Prisma client
│   │   ├── prisma/
│   │   │   └── schema/
│   │   │       ├── base.prisma  # Shared schema (local + cloud)
│   │   │       └── cloud.prisma # Cloud-only tables
│   │   └── repositories/        # Database access layer
│   │       ├── courseRepository.ts
│   │       ├── majorRepository.ts
│   │       ├── unitRepository.ts
│   │       ├── plannerRepository.ts        # Most complex (24KB)
│   │       ├── templateUnitRepository.ts
│   │       ├── electiveGroupRepository.ts
│   │       └── electiveGroupUnitRepository.ts
│   └── shared/
│       └── types/               # Shared TypeScript type definitions
│           ├── matching.ts      # Algorithm types (AlgorithmConfig, PlannerTemplate, etc.)
│           ├── scraping.ts      # Scraper types (ScraperPhase, StepResult, etc.)
│           ├── student.ts       # ScrapedStudent, ScrapedCourseListItem
│           ├── export.ts        # ExportInput, ExportSection
│           ├── plannerImport.ts # PlannerImportPlanner, PlannerImportReport
│           └── global.d.ts      # Window type augmentations for IPC APIs
│
├── runtime/
│   ├── postgres/
│   │   ├── db.ts                # DB startup/shutdown/init logic
│   │   └── scripts/
│   │       ├── init.psql        # Schema DDL
│   │       └── seed/            # Seed SQL files (executed in order on first launch)
│   │           ├── 01_units.sql
│   │           ├── 02_prerequisites.sql
│   │           ├── 03_courses_majors.sql
│   │           ├── 04_planner_templates.sql
│   │           └── 05_elective_groups.sql
│   └── ollama/
│       └── ollama.ts            # Ollama process management
│
├── cloud/                       # Cloud admin app (separate Next.js app)
│   ├── app/
│   │   ├── (admin)/             # Admin-only pages (protected by session)
│   │   │   ├── page.tsx         # Dashboard
│   │   │   ├── planners/        # Planner management
│   │   │   ├── scraper/         # Trigger planner website scrape
│   │   │   └── history/         # Scrape run history
│   │   ├── api/
│   │   │   ├── auth/login/      # POST — admin login
│   │   │   ├── auth/logout/     # POST — logout
│   │   │   ├── planners/        # GET list / GET by ID
│   │   │   │   └── [id]/export/ # GET — export planner in import format
│   │   │   ├── scraper/run/     # POST — trigger a scrape run
│   │   │   └── history/         # GET — scrape run history
│   │   └── login/               # Login page
│   └── lib/                     # Cloud utilities
│
├── tests/                       # Jest test suite
│   ├── api/                     # Route handler tests
│   ├── core/                    # Service unit tests
│   ├── integration/             # End-to-end workflow tests
│   └── performance/             # Matching pipeline benchmarks
│
├── scripts/                     # Dev/build automation scripts
│   ├── ensure-ollama.js         # Check Ollama is available before dev start
│   ├── download-ollama.js       # Download Ollama binary
│   ├── build-python.js          # PyInstaller build for Python service
│   └── fix-embedded-postgres-dylibs.js  # macOS dylib path fix (afterPack hook)
│
├── docs/                        # Additional docs
│   └── UAT.md                   # User Acceptance Testing document
│
├── resources/                   # Pre-bundled runtime resources
│   ├── ollama/                  # Ollama binary (per platform)
│   └── python/                  # PyInstaller-built Python binary
│
├── patches/                     # patch-package patches for npm deps
├── release/                     # Built distributable output
├── package.json
├── tsconfig.json
├── jest.config.js
├── eslint.config.mjs
├── docker-compose.yml           # Cloud app local dev
├── docker-compose.prod.yml      # Cloud app production
└── .env.example
```

---

## 5. Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Shell                         │
│  electron/main.ts                                           │
│  - Creates BrowserWindow (1280×800)                         │
│  - Starts embedded PostgreSQL (port 5433, userData/pgdata)  │
│  - Starts Next.js server in production (dynamic port)       │
│  - Starts Ollama server (non-blocking, port 11434)          │
│  - Exposes OS APIs via preload.ts (contextBridge)           │
│  - Handles auto-updates and graceful shutdown               │
└────────────────────────────┬────────────────────────────────┘
                             │ loads URL
┌────────────────────────────▼────────────────────────────────┐
│                   Next.js Application                       │
│                                                             │
│  ┌──────────────────┐  HTTP fetch    ┌────────────────────┐ │
│  │   React UI        │ ────────────→  │   API Routes       │ │
│  │   web/app/(pages) │ ←────────────  │   web/app/api/     │ │
│  └──────────────────┘                └────────┬───────────┘ │
└───────────────────────────────────────────────┼─────────────┘
                                                │ calls
                              ┌─────────────────┴──────────────────┐
                              │                                     │
                        service calls                    repository calls
                              │                                     │
                 ┌────────────▼──────────┐       ┌─────────────────▼────┐
                 │   Core Services        │       │   Repository Layer    │
                 │   core/services/       │       │   core/db/repositories│
                 │   Pure functions,      │       │   Prisma ORM wrappers │
                 │   no DB/HTTP deps      │       └──────────┬───────────┘
                 └───────────────────────┘                  │ Prisma
                                                 ┌──────────▼───────────┐
                                                 │  Embedded PostgreSQL   │
                                                 │  port 5433            │
                                                 └───────────────────────┘
```

### Communication Rules

| From | To | How |
|------|----|-----|
| React UI | API Routes | HTTP fetch to `/api/*` |
| API Routes | Repositories | Direct function call |
| API Routes | Services | Direct function call (data in, result out) |
| Services | API Routes | Return value only — services never call out |
| Repositories | Database | Prisma ORM |
| Electron main | Next.js | Child process in production, dev server in dev |
| Renderer | Electron APIs | IPC via `window.themeAPI / portalAPI / dbAPI / updaterAPI / shutdownAPI` |

**Critical rule:** Services never import from repositories or HTTP. API routes are the orchestrators — they fetch from DB, pass to service, persist the result. This keeps services pure and independently testable.

### Layer Responsibilities

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Electron shell** | `electron/` | App lifecycle, DB/Ollama startup, IPC bridge, auto-update |
| **React UI** | `web/app/(pages)/` | User interface, local state, HTTP fetch to API routes |
| **API Routes** | `web/app/api/` | Thin controllers — orchestrate repos and services, no business logic |
| **Services** | `core/services/` | All business logic — pure functions, zero external deps |
| **Repositories** | `core/db/repositories/` | All DB access — only called by API routes |
| **Runtime** | `runtime/` | Embedded PostgreSQL init scripts, Ollama process management |

---

## 6. Database Schema

The database is embedded PostgreSQL running on **port 5433**. Data is stored at `${app.getPath('userData')}/pgdata` (OS user-data directory) — it persists across app updates and restarts.

Prisma schema source: `core/db/prisma/schema/base.prisma`
Prisma client output: `node_modules/@local/prisma-client` (custom local package)

### Entity Relationship

```
Course ──────< Major
  │                │
  └───< PlannerTemplate >──┘
              │
              ├───< TemplateUnit >─── Unit
              │                         │
              ├───< ElectiveGroup        ├───< UnitRequisiteGroup
              │       │                 │           │
              │       └──< ElectiveGroupUnit        └──< UnitRequisiteCondition
              │
              └───< Minor
                      │
                      └──< MinorUnit >── Unit
```

### Tables

#### `courses`
Degree programs (e.g., Bachelor of Computer Science).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| code | String? | Unique (e.g., `BCS`) — nullable |
| name | String | Unique (e.g., "Bachelor of Computer Science") |
| created_at / updated_at | DateTime | Managed by Prisma |

#### `majors`
Specialisations within a course (e.g., Artificial Intelligence within BCS).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| course_id | UUID FK → courses | |
| name | String | |
| unique | | `[course_id, name]` |

#### `units`
Academic units (subjects). Master catalogue.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| unit_code | String | Unique (e.g., `CSC1024`) |
| unit_name | String | Full unit title |
| offered_in | Int? | 1 = Semester 1, 2 = Semester 2, NULL = both |

#### `planner_templates`
An official study plan for a specific course/major/intake combination.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| course_id | UUID FK → courses | |
| major_id | UUID? FK → majors | Nullable (some planners are course-wide) |
| intake_year | Int | e.g., 2022 |
| intake_month | Int? | Month number, e.g., 3 for March intake |
| course_type | String | Default `"bachelor"` |
| duration_semesters | Int | Default 6 |
| core_count / core_cp | Int? | Count and credit points for core units |
| major_count / major_cp | Int? | Count and credit points for major core |
| elective_count / elective_cp | Int? | Count and credit points for electives |
| wil_count / wil_cp | Int? | Count and credit points for WIL |
| unique | | `[course_id, major_id, intake_year, intake_month]` |

#### `template_units`
A unit placed in a specific position (year/semester/category) within a planner.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| planner_template_id | UUID FK → planner_templates | |
| unit_id | UUID? FK → units | Nullable (for elective placeholder slots) |
| category | Enum `unit_category` | See below |
| year_level | Int | 1, 2, 3, or 4 |
| semester | Int | 1 or 2 |
| unique | | `[planner_template_id, unit_id]` |

**`unit_category` enum values:**

| Value | Meaning |
|-------|---------|
| `core` | Mandatory core units for the course |
| `major_core` | Mandatory units specific to the major |
| `prescribed_elective` | Elective chosen from a fixed pool (elective group) |
| `elective` | Free elective — student's own choice |
| `wil` | Work Integrated Learning unit |
| `mpu` | Mata Pelajaran Umum (Malaysian university compulsory subjects) — **excluded from matching scoring** |

#### `elective_groups`
A named pool of units from which a student picks N slots (e.g., "Pick 2 from Group A").

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| planner_template_id | UUID FK → planner_templates | |
| created_at / updated_at | DateTime | |

> **Note:** The `name` and `slots_required` fields described in older documentation do not appear in the current `base.prisma` schema. The `ElectiveGroup` model currently only has id, planner_template_id, and timestamps. This is a known documentation gap.

#### `elective_group_units`
Composite join table — units that belong to an elective group.

| Column | Type | Notes |
|--------|------|-------|
| elective_group_id | UUID FK → elective_groups | Composite PK |
| unit_id | UUID FK → units | Composite PK |

#### `unit_requisite_groups`
A prerequisite group for a unit. Multiple groups = OR logic (any satisfied = prerequisite met).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| unit_id | UUID FK → units | The unit that requires prerequisites |

#### `unit_requisite_conditions`
A single condition within a prerequisite group. Multiple conditions = AND logic.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| group_id | UUID FK → unit_requisite_groups | |
| type | String | Condition type (e.g., "unit", "credit_points") |
| unit_id | UUID? FK → units | The required unit (if type = "unit") |
| credit_points | Decimal? | Required credits (if type = "credit_points") |
| requisite_type | String? | "prerequisite", "corequisite", etc. |

#### `minors`
Minor programmes defined within a planner template.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| planner_template_id | UUID FK → planner_templates | |
| name | String | Minor name |
| unique | | `[planner_template_id, name]` |

#### `minor_units`
Units that belong to a minor programme.

| Column | Type | Notes |
|--------|------|-------|
| minor_id | UUID FK → minors | Composite PK |
| unit_id | UUID FK → units | Composite PK |

#### System Tables

| Table | Purpose |
|-------|---------|
| `system_config` | Key-value config store (key: String PK, value: String). Currently used for `second_major_threshold`. |
| `privacy_events` | Tracks privacy notice interactions. event_type: "presented" / "acknowledged" / "withdrawn". notice_version: Int. |
| `security_incident_log` | Security event log with event_type, severity, message. |
| `audit_log` | Data change audit trail with action, entity_type, entity_id, old_value (JSON), new_value (JSON). |
| `schema_migrations` | Internal migration tracking (version String PK). |

### Seed Data

On **first launch only**, the database is initialized and seeded from `runtime/postgres/scripts/seed/` in this order:

1. `01_units.sql` — All unit definitions (unit_code, unit_name, offered_in)
2. `02_prerequisites.sql` — Prerequisite relationships
3. `03_courses_majors.sql` — Course and major records
4. `04_planner_templates.sql` — Planner templates per intake year
5. `05_elective_groups.sql` — Elective group definitions

The first-run check uses the presence of the `pgdata` directory.

### Database Connection

```
Host:     127.0.0.1
Port:     5433
Database: studyplanner
User:     studyplanner_user
Password: superidol
URL:      postgresql://studyplanner_user:superidol@127.0.0.1:5433/studyplanner
```

To inspect during development: connect any PostgreSQL client (TablePlus, psql) while the app is running.

---

## 7. Core Services (Business Logic)

All services live in `core/services/`. They are **pure functions** — they receive data as parameters and return results. They never import Prisma, React, Electron, or Next.js. This makes them independently testable.

### 7.1 Major Detection Pipeline

**Location:** `core/services/matching/`
**Entry point:** `matchingService.ts` → `runMatchingPipeline(input): { payload: DisplayPayload, durationMs: number }`

#### Input

```typescript
interface MatchingServiceInput {
  student: RawStudentInput;
  planners: PlannerTemplate[];       // All planner templates from DB
  unitMasterTable: UnitMasterEntry[]; // All units across all planners
  config?: Partial<AlgorithmConfig>; // Optional overrides
}

interface RawStudentInput {
  studentID: string;
  intakeYear: number;
  intakeSemester: 1 | 2;
  completedUnitCodes: string[];  // Raw unit codes (may have inconsistent casing)
  hasWIL: boolean;
  courseType?: string;           // "degree" etc.
  currentSemester?: number;
}
```

#### Output (`DisplayPayload`)

```typescript
{
  studentID: string;
  status: "detected" | "noMajorDetected" | "overridden";
  isOverride: boolean;
  primaryMajor: MajorDisplay | null;
  secondMajor: MajorDisplay | null;
  detectedPrimary?: MajorDisplay;   // Algorithm result before any manual override
  topAlternatives: MajorDisplay[];
  detectedMinors: string[];
  rankedPlanners: PlannerScoreRecord[];
  // Additional fields added by match API route:
  unmatchedCore?: string[];
  totalCredits?: number;
}
```

#### The 6 Phases

**Phase 1 — Planner Filtering** (`plannerFilter.ts`)

Narrows all planners to candidates relevant to the student's intake. The API currently calls the pipeline with `preferIntakeYear: false`, so all planners are candidates regardless of intake year.

Fallback order (when preferIntakeYear is true):
1. Exact match: intake_year + intake_semester
2. Year-only match
3. Most recent available planner
4. Error if none found in strict mode

**Phase 2a — Unit Normalisation** (`unitNormalizer.ts`)

`normaliseUnitCodes(rawCodes: string[]): Set<string>`
- Uppercases all codes
- Trims whitespace
- Deduplicates (returns a `Set<string>`)
Runs once; all downstream phases use the normalised set.

**Phase 2a — Profile Building** (`profileBuilder.ts`)

`buildStudentProfile(raw, normalisedCodes, unitMasterTable): StudentProfile`

Classifies each completed unit by looking it up in the unit master table:

| StudentProfile field | Description |
|---------------------|-------------|
| `completedCore` | Units classified as `core` in the master table |
| `completedMajorCore` | Units classified as `majorCore` |
| `completedPrescribed` | Units classified as `prescribed` |
| `completedFreeElectives` | Units classified as `freeElective` |
| `electivesByTag` | Map of tag → units (for minor detection) |
| `unclassifiedUnits` | Units not found in master table — excluded from scoring |
| `hasWIL` | Passed through from input |

**Phase 2b/3 — Scoring** (`scoringEngine.ts`)

`scorePlanners(profile, planners, config): PlannerScoreRecord[]`

Scores every candidate planner using a weighted formula:

| Component | Default Weight | What it measures |
|-----------|---------------|-----------------|
| Core | 0.40 | % of required core units completed |
| Major core | 0.30 | % of major-specific core units completed |
| Prescribed electives | 0.20 | Elective group slots filled |
| Free electives | 0.05 | Free elective pool slots filled |
| WIL | 0.05 | 1.0 if WIL completed, 0.0 if not |

**WIL Exemption (Phase 2b):** If a student has WIL completed, `freeElectiveSlotsRequired` is reduced by `wilExemptionCount` (default: 2) before scoring free electives. This reflects that WIL completion exempts 2 free elective slots.

**Match % formula:** Weighted sum of the five components, scaled 0–100.

**Phase 4 — Ranking** (`majorDetector.ts`)

Stable O(n log n) merge sort of all scored planners:
- Primary sort: `majorCoreScore` descending
- Tiebreaker: `matchPct` descending

`majorCoreScore` is the strongest signal for major classification, so it ranks first.

**Phase 5 — Detection** (`majorDetector.ts`)

`assignMajors(ranked, config, manualOverride?): DetectionResult`

| Threshold | Default | Meaning |
|-----------|---------|---------|
| `noMajorThreshold` | 0.30 | Minimum `majorCoreScore` for the top planner to be a valid primary major |
| `secondMajorThreshold` | 0.70 | Minimum `majorCoreScore` for the 2nd ranked planner to be a second major |

The `secondMajorThreshold` is user-configurable via Settings and stored in `system_config`.

Detection statuses:
- `detected` — primary major found above threshold
- `noMajorDetected` — top planner below threshold; top alternatives returned
- `overridden` — user has manually set a major; algorithm result preserved in `detectedPrimary`

**Phase 6 — Output Packaging** (`outputPackager.ts`)

Converts internal `DetectionResult` → `DisplayPayload` ready for the dashboard:
- Per-category breakdown: matched / required / missing counts
- Missing prescribed elective details (which groups, how many slots unfilled)
- Missing free elective slot count
- Top alternative planners for the no-match case

#### Algorithm Configuration

```typescript
interface AlgorithmConfig {
  weightCore: number;               // default 0.40
  weightMajorCore: number;          // default 0.30
  weightPrescribedElective: number; // default 0.20
  weightFreeElective: number;       // default 0.05
  weightWIL: number;                // default 0.05
  // Weights must sum to exactly 1.0 (tolerance: 1e-9)

  noMajorThreshold: number;         // default 0.30
  secondMajorThreshold: number;     // default 0.70 (user-configurable)
  minorUnitThreshold: number;       // default 3

  wilExemptionCount: number;        // default 2

  preferIntakeYear: boolean;        // default true (API currently passes false)
  preferIntakeSemester: boolean;    // default true
}
```

Config validation runs before the pipeline (`configValidator.ts`) and throws `ConfigValidationError` if weights don't sum to 1.0.

#### How the API Route Prepares the Input

`web/app/api/match/route.ts` does the following before calling the service:
1. Reads `second_major_threshold` from `system_config` table.
2. Calls `plannerRepository.getAllPlannersWithUnits()` to get all planners with their units and elective groups.
3. Builds the `unitMasterTable` by iterating all template units across all planners. When a unit appears in multiple planners with different categories, the higher-priority category wins: `major_core > prescribed_elective > core > elective > wil`. Note: `mpu` category is excluded from the master table (not scored).
4. Maps DB planner rows to `PlannerTemplate` shape expected by the matching service.
5. Calls `runMatchingPipeline()` with `preferIntakeYear: false` (intake year filtering disabled).
6. Also computes a `graduationCheck`: eligible if `unmatchedCore.length === 0` AND `totalCredits >= 300`.

#### Gotchas

- **Weights must sum to 1.0** (within 1e-9). Changing any weight without adjusting others will throw.
- **MPU units** are never scored — they are excluded from the unit master table.
- **Unclassified units** (not found in any planner template) are excluded from scoring. Check `unclassifiedUnits` in `StudentProfile` when debugging.
- **Manual override** wraps the algorithm result — it does not re-run the pipeline.
- **`preferIntakeYear: false`** is hardcoded in the API call, so all planners are always candidates regardless of intake year.

---

### 7.2 Student Portal Scraper

**Location:** `core/services/scrapper/`
**Main file:** `advisorScraperService.ts`

Automates extraction of a student's academic record from the university portal by controlling an Electron `<webview>` element.

**Target portal:** `https://sisportal-100380.campusnexus.cloud/CMCPortal`

#### Adapter Pattern

The scraper accepts a `WebviewAdapter` interface, decoupling it from Electron:

```typescript
interface WebviewAdapter {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  executeJavaScript<T = unknown>(code: string): Promise<T>;
}
```

Real implementation wraps `document.querySelector('webview')`. A mock can be passed for tests.

#### 8 Scraper Steps

| Step ID | What it does |
|---------|-------------|
| `go-degree` | Navigate to the degree audit page |
| `open-degree-iframe` | Locate and open the iframe containing student data |
| `click-student-dropdown` | Click the student ID input dropdown |
| `wait-for-kendo-list` | Wait for the Kendo UI dropdown to render |
| `enter-student-id` | Type the student ID into the search field |
| `click-dropdown` | Select the student from the dropdown list |
| `select-dropdown` | Confirm the selection |
| `scrape-program-data` | Extract the programme grid data from the page |

#### Key Functions

- `runScraperStep(stepId, adapter, opts)` — run a single step, returns `StepResult`
- `runAllSteps(adapter, opts)` — run all steps in sequence; stops on first failure

#### Output

```typescript
// ScrapedStudent (core/shared/types/student.ts)
{
  studentId?: string;
  studentName?: string;
  course: string;
  status: string;
  cgpa: number;
  creditsRequired: number;
  creditsCompleted: number;
  scheduledCredits: number;
  gradeLevel: string;
  enrollmentDate: string;
  graduationDate: string | null;
  areasOfStudy?: string[];
  courseList: ScrapedCourseListItem[];
}

// ScrapedCourseListItem
{
  courseId: string;       // Unit code, e.g., "CSC1024"
  courseTitle: string;
  credits: number;
  creditsEarned: number;
  status: string;         // "Complete", "In Progress", "Registered", etc.
  grade: string;
  term: string;           // e.g., "2023/2024 Semester 1"
}
```

#### Scraper State Machine (UI Layer)

The `ScraperContext` React provider manages state. The service itself is stateless.

```
idle → browser → login → ready → scraping → done
                                          → error
```

- `login` phase: portal redirected to Microsoft OAuth login. User must log in manually. Detected by URL pattern matching `login.microsoftonline.com`.
- The webview uses a persistent session partition: `persist:sisportal-advisor`.

#### Testing Without Portal

`GET /api/mock/student` returns a hardcoded `ScrapedStudent` from `studentService.ts`.

#### Gotchas

- DOM selectors are tied to the portal's HTML structure. Portal updates may break steps.
- Login detection is URL-pattern based — fragile if the OAuth flow changes.
- Code inside `executeJavaScript()` runs in webview context and cannot import Node.js modules.
- Steps are tightly ordered. Do not reorder or skip.

---

### 7.3 Planner Website Scraper (Cloud Only)

**Location:** `core/services/plannerScraper/`
**Entry point:** `plannerScraperOrchestrator.ts`

This scraper is used exclusively by the **cloud admin app**, not the local desktop app. It scrapes the Swinburne website to discover and download study planner PDFs.

**Target URL:** `https://www.swinburne.edu.my/current-students/get-started/program-study-planner/`

#### Steps

| Step ID | What it does |
|---------|-------------|
| `navigate-to-index` | Navigate to the planner index page |
| `wait-for-content` | Wait for page content to load |
| `detect-year-tabs` | Detect year tabs (different intake years) |
| `scrape-planner-index` | Scrape list of available planners and PDF links |
| `download-pdf` | Download a specific PDF |
| `parse-planner-pdf` | Parse the downloaded PDF using the Python service |

Uses a `BrowserAdapter` interface (same adapter pattern as the portal scraper) wrapping Puppeteer in the cloud context.

---

### 7.4 Planner PDF Import (Python Service)

**Location:** `core/services/plannerImport/plannerImportService.ts`
**Python script:** `core/services/plannerImport/plannerStructureService.py`
**Packaged binary:** `resources/python/plannerStructureService` (macOS/Linux) or `.exe` (Windows)

The Python service does the heavy lifting of extracting structured data from a planner PDF.

#### How It Works

1. `extractPlannerFromPdf(pdfBuffer, options)` is called from the import API route.
2. The PDF is written to a temp directory (`os.tmpdir()/study-planner-import-*`).
3. A child process is spawned:
   - In production: runs the bundled `plannerStructureService` binary.
   - In development: runs `python3 plannerStructureService.py`.
4. Optional flags: `--no-llm` (skip LLM review), `--model <name>`, `--llm-retries <n>`.
5. The Python service outputs a JSON result to stdout.
6. The result is parsed and validated: must have `{ planner, report }` shape.

#### LLM Integration (Optional)

The Python service optionally calls the local Ollama server (`http://127.0.0.1:11434`) for quality review of extracted planner data. This is configured via the `useLlm` option. The LLM is used for planner parsing assistance, not for the main detection algorithm.

#### Output Shape

```typescript
interface PlannerImportResult {
  planner: PlannerImportPlanner;  // Structured planner data
  report: PlannerImportReport;    // Extraction quality report
}

// PlannerImportReport includes:
// - confidence_score (0–1): overall extraction confidence
// - validation_issues: array of detected problems
```

**Confidence thresholds used in the UI:**
- ≥ 0.90: High — "Ready"
- ≥ 0.75: Medium — "Check Before Saving"
- < 0.75: Low — "Manual Review Required"

#### Import API Route

`POST /api/planners/save` saves the parsed `PlannerImportPlanner` to the database via `savePlannerFromImport()` in `plannerRepository.ts`.

---

### 7.5 Excel Export Service

**Location:** `core/services/export/exportService.ts`

Generates a multi-sheet Excel workbook (`xlsx-js-style`) from matching results.

#### Sheets

1. **Report Info** — export metadata (date, student ID, etc.)
2. **Student Profile** — student details (CGPA, credits, enrollment date, etc.)
3. **Major & Course Match** — detection results, match %, per-category breakdown, missing units
4. **Completed Units** — full transcript of completed units with grades and terms
5. **Study Planner** — full planner grid by year/semester with completion status

#### Export API

`POST /api/export` accepts an `ExportInput`:
```typescript
interface ExportInput {
  student: ScrapedStudent;
  dashboardData: DisplayPayload;
  sections: ExportSection[];  // "student_profile" | "major_match" | "unit_plan" | "study_planner"
}
```

Returns binary XLSX data as an attachment.

---

### 7.6 Analytics Service

**Location:** `core/services/analyticsService.ts`

Provides `calculateProgress(student)` — returns credit completion percentage (`creditsCompleted / creditsRequired`).

---

## 8. API Routes (Local App)

All routes are in `web/app/api/`. They follow Next.js App Router conventions.

**Convention:** Try/catch wrapping all handlers. Success: `Response.json(data)` with 200. Error: `Response.json({ error: string })` with appropriate status code.

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ping` | Returns `{ ok: true, message: "pong", timestamp }` |
| GET | `/api/mock/student` | Returns hardcoded `ScrapedStudent` for testing |

### Major Detection

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/match` | Run the 6-phase matching pipeline. Body: `{ student: ScrapedStudent }`. Returns `{ success, data: DisplayPayload, graduationCheck, processingTime }` |

### Courses

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/courses` | List all courses |
| POST | `/api/courses` | Create course |
| GET | `/api/courses/[id]` | Get single course |
| PUT | `/api/courses/[id]` | Update course |
| DELETE | `/api/courses/[id]` | Delete course |
| GET | `/api/courses/[id]/majors` | List majors for a course |
| GET | `/api/courses/[id]/planners` | List planner templates for a course |

### Majors

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/majors` | List all majors |
| POST | `/api/majors` | Create major |
| GET | `/api/majors/[id]` | Get single major |
| PUT | `/api/majors/[id]` | Update major |
| DELETE | `/api/majors/[id]` | Delete major |

### Units

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/units` | List all units |
| POST | `/api/units` | Create unit |
| GET | `/api/units/[id]` | Get single unit |
| PUT | `/api/units/[id]` | Update unit |
| DELETE | `/api/units/[id]` | Delete unit |
| GET | `/api/units/[id]/prerequisite-groups` | Get prerequisite groups for unit |
| POST | `/api/units/check` | Validate unit codes |

### Planner Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/planners` | List all planner templates |
| POST | `/api/planners` | Create planner template |
| GET | `/api/planners/[id]` | Get planner with units and elective groups |
| PUT | `/api/planners/[id]` | Update planner |
| DELETE | `/api/planners/[id]` | Delete planner |
| GET | `/api/planners/[id]/template-units` | List units in planner |
| GET | `/api/planners/[id]/elective-groups` | List elective groups in planner |
| POST | `/api/planners/save` | Save a parsed `PlannerImportPlanner` to the database |

### Template Units

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/template-units` | List template units |
| POST | `/api/template-units` | Create template unit |
| GET | `/api/template-units/[id]` | Get single template unit |
| DELETE | `/api/template-units/[id]` | Delete template unit |

### Elective Groups & Units

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/elective-groups` | List all elective groups |
| POST | `/api/elective-groups` | Create elective group |
| GET | `/api/elective-groups/[id]` | Get single group |
| DELETE | `/api/elective-groups/[id]` | Delete group |
| GET | `/api/elective-groups/[id]/units` | List units in group |
| POST | `/api/elective-group-units/[electiveGroupId]/[unitId]` | Add unit to group |
| DELETE | `/api/elective-group-units/[electiveGroupId]/[unitId]` | Remove unit from group |
| GET | `/api/elective-group-units` | List all elective group unit relationships |

### Student Data Import (Excel Transcript)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/import` | Parse an uploaded Excel transcript file. Body: multipart form with `file`. Requires privacy acknowledgement (REQ-PRI-101). Returns `{ courseList: ScrapedCourseListItem[] }` |

**Excel format expected by `/api/import`:**
Columns: Course | Course Title | Credits | Earned | Status | Grade | Term
(First row is header, skipped.)

### Scraper

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scraper` | Submit completed scrape result (ScrapedStudent). Stores in server-side memory store. |
| POST | `/api/scraper/start` | Initialize scraper session |
| GET | `/api/scraper/status` | Get current scraper status from memory store |

The scraper uses a server-side in-memory store (`web/app/api/scraper/store.ts`).

### Cloud Sync

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cloud-sync` | List all planners available on cloud, enriched with local import status (`available` or `already_imported`). Requires `CLOUD_API_URL` env var. |
| POST | `/api/cloud-sync` | Pull selected planners from cloud into local DB. Body: `{ ids: string[] }`. Returns `{ results: { id, status: 'pulled'|'duplicate'|'failed' }[] }` |

### Ollama (LLM)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ollama/status` | Check if Ollama server is running and model is available |
| POST | `/api/ollama/pull` | Download a model. Body: `{ model: string }` |

### Privacy

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/privacy/status` | Check if current notice version has been acknowledged |
| POST | `/api/privacy/acknowledge` | Record privacy acknowledgement in `privacy_events` table |

### Configuration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config?key=<key>` | Get a system config value |
| POST | `/api/config` | Set a system config value. Body: `{ key: string, value: string }` |

**Currently used config keys:**
- `second_major_threshold` — float string, e.g., `"0.70"`. Default: 0.70.

### Custom Planner

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/custom-planner` | Save a custom planner schedule |

---

## 9. Frontend Pages & UI

### Shell Layout

The app uses a VSCode-inspired shell defined in `web/app/(pages)/layout.tsx`:

```
┌─────────────────────────────────────────────────┐
│  TopBar — app name, theme toggle, window controls│
├────────┬────────────────────────────────────────┤
│        │  TabBar — open page tabs               │
│Sidebar │──────────────────────────────────────  │
│(nav)   │  Page Content                          │
│        │                                        │
├────────┴────────────────────────────────────────┤
│  StatusBar — DB status, version info            │
└─────────────────────────────────────────────────┘
```

**Theme options** (user-selectable in Settings):
- `system` — follows OS preference (default)
- `light` — always light
- `dark` — always dark
- `portal` — dark sidebar, white content, steel-blue accents (matches the student portal aesthetic)

**React Context Providers:**
- `PortalAuthContext` — tracks portal login state, exposes `isLoggedIn`, `openLoginModal()`
- `ScraperContext` — tracks scraper phase/state, exposes `fetchStudentSuggestions()`
- `ToastProvider` — toast notification system

### Privacy Notice

`PrivacyNoticeModal.tsx` blocks access until the user acknowledges the privacy notice. The notice version is defined in `web/app/lib/privacyNoticeContent.ts`. Acknowledgement is checked server-side on the `/api/import` endpoint (REQ-PRI-101).

### Pages

#### Dashboard (`/dashboard`)

The primary work surface. Features:
- Student ID input with autocomplete suggestions (fetched via `ScraperContext.fetchStudentSuggestions`)
- **Import Panel** (collapsible): three import modes:
  - `xlsx` — upload Excel transcript file (calls `/api/import`)
  - `manual` — enter units one by one
  - `paste` — paste a list of unit codes
- **Enrollment Mode** selector: `latest` / `earliest` / `mpu` — controls which term dates are used
- **Match button** — sends `ScrapedStudent` to `POST /api/match`
- **Results display:**
  - Detected major name and match percentage with progress bar
  - Per-category breakdown table (core, major core, prescribed, free electives, WIL): matched/required counts
  - Missing units list for each category
  - Second major (if detected)
  - Alternative majors (if no major detected)
  - Graduation eligibility check
- **Manual override** — user can force-select a different major
- **Planner picker** — search and select any planner template to view against student data
- **Export button** — opens `ExportModal`

#### Scraping (`/scraping`)

Portal data extraction interface:
- Embedded webview loads the university portal
- Login detection: if portal redirects to Microsoft OAuth, shows "please log in" message
- Student ID input
- Step-by-step scraper execution (runs the 8 steps sequentially)
- Real-time log display
- On completion: pushes `ScrapedStudent` to the scraper store

#### Import (`/import`)

Planner PDF import workflow:
- PDF file upload via drag-and-drop or file picker
- Calls the Python extraction service via `POST /api/planners/save`... actually this calls the import service which spawns the Python binary, then the result is shown in the UI.
- Displays extraction results with confidence score and validation issues
- User reviews and edits the extracted planner data (unit-by-unit table)
- "Save to Database" saves the planner via `POST /api/planners/save`
- Import history sidebar shows recent import attempts

#### Planners (`/planners`)

Study planner template viewer:
- Left panel: list of all planners grouped by course, searchable
- Right panel: selected planner details
  - Planner metadata (course, major, intake year/month, credit summaries)
  - Units organized by year and semester in a grid (`CourseListTable` component)
  - Color-coded by category
  - Shows prerequisite information

#### Cloud Sync (`/cloud-sync`)

Pull planners from the cloud admin system:
- Lists all planners available on the cloud (GET `/api/cloud-sync`)
- Shows local status: `available` or `already imported`
- Multi-select and bulk import
- POST `/api/cloud-sync` with selected IDs to pull them

#### Settings (`/settings`)

- **Theme selector** — radio buttons for system/light/dark/portal
- **Second Major Detection Threshold** — slider (0–100%), saved to `system_config`
- **Auto-update** — check for updates, download, install; shows version number
- (No algorithm weights UI — those are code-level constants)

#### User Guide (`/user-guide`)

Built-in help documentation page with workflow instructions and troubleshooting.

### Reusable Components

| Component | Location | Description |
|-----------|----------|-------------|
| `CourseListTable` | `components/planner/` | Renders units in a year/semester grid with category badges |
| `PlannerHeader` | `components/planner/` | Displays planner metadata header |
| `ExportModal` | `components/` | Section selector for Excel export |
| `UpdateBanner` | `components/layout/` | Auto-update status banner |
| `PortalLoginModal` | `components/layout/` | Modal for portal login instructions |

---

## 10. Electron Shell

**Main file:** `electron/main.ts`
**Preload:** `electron/preload.ts`

### Startup Sequence

```
1. app.whenReady()
2. initLogger() → writes to userData/logs/main.log
3. process.env.DATABASE_URL = getDatabaseUrl()
4. startOllama() — non-blocking (app opens even if Ollama fails)
5. setupAutoUpdater() — production only
6. startDatabase() — non-blocking parallel with window creation
   └── on success: dbReady = true, broadcasts 'db-ready' to renderer
7. createMainWindow()
   └── in production: startNextServer() on dynamic port → loadURL
   └── in dev: loads NEXT_DEV_SERVER_URL (http://127.0.0.1:3000)
```

### Window Configuration

```typescript
BrowserWindow({
  width: 1280,
  height: 800,
  webPreferences: {
    preload: 'dist/electron/preload.js',
    contextIsolation: true,  // Renderer cannot access Node.js
    nodeIntegration: false,
    sandbox: true,           // OS-level sandboxing
    webviewTag: true         // Required for portal scraping
  }
})
```

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `get-system-theme` | Renderer → Main | Request OS theme (light/dark) |
| `system-theme-changed` | Main → Renderer | OS theme changed notification |
| `clear-portal-session` | Renderer → Main | Clear portal cookies/cache (session partition `persist:sisportal-advisor`) |
| `get-database-url` | Renderer → Main | Get DB connection string |
| `is-db-ready` | Renderer → Main | Synchronous DB readiness check |
| `db-ready` | Main → Renderer | DB initialization complete |
| `updater-check` | Renderer → Main | Trigger update check |
| `updater-download` | Renderer → Main | Start downloading update |
| `updater-install` | Renderer → Main | Stop services and install update |
| `updater-status` | Main → Renderer | Update progress broadcast |
| `app-shutting-down` | Main → Renderer | Shutdown starting (show overlay) |
| `shutdown-progress` | Main → Renderer | Per-service shutdown status |

### Preload Bridge (`window.*` APIs)

| API | Purpose |
|-----|---------|
| `window.themeAPI` | `getSystemTheme()`, `onThemeChange(cb)` |
| `window.native` | `platform`, `appVersion` |
| `window.portalAPI` | `clearSession()` |
| `window.dbAPI` | `isReady()`, `onReady(cb)`, `getUrl()` |
| `window.updaterAPI` | `check()`, `download()`, `install()`, `onStatus(cb)` |
| `window.shutdownAPI` | `onShuttingDown(cb)`, `onProgress(cb)` |

### Shutdown Sequence

Orderly shutdown to prevent data corruption and Windows file-lock issues:

```
1. broadcast 'app-shutting-down' (UI shows overlay)
2. Close Next.js server (releases Prisma connection pool)
3. broadcast shutdown-progress { service: 'server', done: true }
4. In parallel:
   - stopDatabase() → broadcast shutdown-progress { service: 'database', done: true }
   - stopOllama()   → broadcast shutdown-progress { service: 'ollama', done: true }
```

This sequence is also triggered before installing updates (via `updater-install` IPC) to avoid Windows file-lock race conditions with the NSIS installer.

### Auto-Update

- Only active in packaged production builds (`app.isPackaged`)
- `autoDownload: false` — user must approve download
- `autoInstallOnAppQuit: true` — install on next quit (if downloaded)
- Checks for updates 5 seconds after startup, then every 4 hours
- Provider: GitHub Releases (`owner: jamestofuwong`, `repo: FYPA-StudyPlannerSystem`)

### Database Management (`runtime/postgres/db.ts`)

- Uses `embedded-postgres` npm package
- `startDatabase()`: initializes cluster if first run, starts server, creates DB, runs init.psql, runs seed files
- `stopDatabase()`: graceful PostgreSQL shutdown
- `getDatabaseUrl()`: returns connection string
- First-run detection: presence of `pgdata` directory in `userData`

---

## 11. Cloud Admin App

**Location:** `cloud/`
**Deployment:** Docker Compose (`docker-compose.yml` / `docker-compose.prod.yml`)
**Purpose:** Admin-only tool for scraping and managing planner templates centrally.

### Authentication

Session-based admin login:
- `POST /api/auth/login` — validates username + bcrypt password hash, creates session
- `POST /api/auth/logout` — destroys session
- Protected via middleware (all `/admin` routes require active session)

### Pages (Admin Only)

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/(admin)/` | Overview |
| Planners | `/(admin)/planners/` | List all scraped/parsed planners |
| Planner detail | `/(admin)/planners/[id]/` | View and manage a single planner |
| Scraper | `/(admin)/scraper/` | Trigger a planner website scrape run |
| History | `/(admin)/history/` | View past scrape run history |

### Cloud API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/planners` | List all cloud planners (consumed by local app's GET `/api/cloud-sync`) |
| GET | `/api/planners/[id]` | Get single cloud planner |
| GET | `/api/planners/[id]/export` | Export planner in `PlannerImportPlanner` format (consumed by local app's POST `/api/cloud-sync`) |
| POST | `/api/scraper/run` | Trigger a scrape run (scrapes Swinburne website) |
| GET | `/api/history` | Get scrape run history |

### Cloud-Only DB Tables (Prisma schema: `cloud/prisma/` or `core/db/prisma/schema/cloud.prisma`)

| Table | Purpose |
|-------|---------|
| `PortalPlannerEntry` | Portal PDF entries awaiting parsing |
| `SyncRun` | History of cloud scrape runs |

### Environment Variables (Cloud)

```env
POSTGRES_DB=fypa_cloud
POSTGRES_USER=fypa
POSTGRES_PASSWORD=<changeme>
CLOUD_PORT=3001
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH_B64=<bcrypt hash in base64>
SESSION_SECRET=<random 32-byte hex>
SCRAPER_SIMULATE=false  # true = mock scraper, false = real Puppeteer
```

### How Local App Connects to Cloud

1. Set `CLOUD_API_URL=http://<cloud-host>:3001` in local app environment.
2. The local `/api/cloud-sync` route fetches from `${CLOUD_API_URL}/api/planners`.
3. To pull a planner: fetches `${CLOUD_API_URL}/api/planners/${id}/export`.
4. Duplicate detection: checks `[course_code, intake_year, intake_month]` uniqueness.

---

## 12. Build & Distribution

### Development

```bash
npm install               # Also runs: patch-package, prisma generate
npm run dev               # Starts: Next.js (port 3000), Electron build watcher, Electron app
```

Dev starts three concurrent processes:
1. `next dev web --webpack -p 3000`
2. `tsup electron/main.ts electron/preload.ts --watch`
3. `wait-on dist/electron/main.js http://127.0.0.1:3000 && NEXT_DEV_SERVER_URL=http://127.0.0.1:3000 electron .`

### Production Build

```bash
npm run build             # prisma:generate + next build web + build:electron
npm run dist              # build + build:python + electron-builder
npm run release           # build + build:python + electron-builder --publish always
```

### Build Artifacts

| Platform | Format | Output |
|----------|--------|--------|
| macOS | DMG + ZIP | `release/mac-arm64/` |
| Windows | NSIS | `release/win-x64/` |
| Linux | AppImage | `release/linux-x64/` |

### ASAR Configuration

The app is bundled as ASAR (Electron's archive format). These paths are excluded from ASAR (unpacked) because they need filesystem access at runtime:

- `node_modules/embedded-postgres/**` — PostgreSQL binaries
- `node_modules/@embedded-postgres/**` — PostgreSQL support
- `node_modules/@local/**` — Prisma client (generated, not in dependency graph)
- `runtime/**` — init scripts, Ollama process management

### Extra Resources (Bundled Binaries)

Bundled alongside the ASAR — accessible at `process.resourcesPath`:
- `plannerStructureService` / `plannerStructureService.exe` — Python PDF extractor binary
- `ollama` / `ollama.exe` — Ollama LLM server binary

### After-Pack Hook

`scripts/fix-embedded-postgres-dylibs.js` runs after packing to fix macOS dynamic library paths in the embedded PostgreSQL binaries.

### npm Scripts Reference

| Script | Purpose |
|--------|---------|
| `dev` | Start development (Next + Electron watch + Electron) |
| `build:app` | `prisma:generate` + `next build web` |
| `build:electron` | `tsup` compile Electron main + preload |
| `build` | `build:app` + `build:electron` |
| `build:python` | PyInstaller build for Python service |
| `download:ollama` | Download Ollama binary to `resources/ollama/` |
| `pack` | Build + package (no distribution file) |
| `dist` | Build + package + create DMG/NSIS/AppImage |
| `release` | `dist` + publish to GitHub Releases |
| `prisma:generate` | Generate Prisma client to `@local/prisma-client` |
| `lint` | ESLint on `web`, `electron`, `core` |
| `typecheck` | `tsc --noEmit` on root + `web/tsconfig.json` |
| `test` | Run all Jest tests |
| `test:watch` | Jest watch mode |
| `test:coverage` | Jest with coverage report |

---

## 13. Testing

**Framework:** Jest + ts-jest

**Config:** `jest.config.js`
- Test environment: `node`
- Module aliases: `@core` → `./core`, `@shared` → `./core/shared`, `@/` → `./web`
- CSS Module mocking via `identity-obj-proxy`
- Global fetch polyfill (Next.js undici)

### Test Files

| Directory | Purpose |
|-----------|---------|
| `tests/api/` | Route handler tests (courses, majors, planners, scraper) |
| `tests/core/` | Service unit tests (advisorScraperService, etc.) |
| `tests/integration/` | End-to-end workflow tests (planner workflow) |
| `tests/performance/` | Matching pipeline benchmarks |

### What the Matching Tests Cover

The matching algorithm has dedicated tests in `core/services/matching/__tests__/`:
- Config validation (bad weights, out-of-range thresholds)
- Planner filtering (exact match, year-only fallback, most-recent fallback)
- Unit normalisation (casing, whitespace, deduplication)
- Profile building (category classification, unclassified units)
- Scoring accuracy (weighted formula correctness)
- Ranking (stable sort by majorCoreScore then matchPct)
- Detection thresholds

---

## 14. Environment Variables & Configuration

### Local App

```env
# Database (auto-configured by Electron at startup)
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=studyplanner
DB_USER=studyplanner_user
DB_PASSWORD=superidol
DATABASE_URL=postgresql://studyplanner_user:superidol@127.0.0.1:5433/studyplanner

# Dev only — tells Electron to use Next.js dev server instead of starting its own
NEXT_DEV_SERVER_URL=http://127.0.0.1:3000

# Cloud sync (optional — required for cloud-sync feature)
CLOUD_API_URL=http://localhost:3001

# Python service (dev only — production uses bundled binary)
PYTHON_EXECUTABLE=python3

NEXT_TELEMETRY_DISABLED=1
```

### Cloud App

```env
POSTGRES_DB=fypa_cloud
POSTGRES_USER=fypa
POSTGRES_PASSWORD=<changeme>
CLOUD_PORT=3001
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH_B64=<bcrypt hash>
SESSION_SECRET=<random 32-byte hex>
SCRAPER_SIMULATE=false
```

### Runtime Configuration (stored in DB)

| Key | Default | Description |
|-----|---------|-------------|
| `second_major_threshold` | `"0.70"` | Float string. Minimum majorCoreScore for a second major. Configurable via Settings page. |

---

## 15. Key Data Flows

### Flow 1: Student Major Detection (Full)

```
1. User enters Student ID on Dashboard
2. [Optional] Scraping page: 8-step portal scraper extracts ScrapedStudent
   OR user imports Excel transcript via Dashboard import panel
   OR user manually enters unit codes
3. Dashboard sends POST /api/match with { student: ScrapedStudent }
4. API route:
   a. Reads second_major_threshold from system_config
   b. Calls plannerRepository.getAllPlannersWithUnits()
   c. Builds unitMasterTable (category priority resolution)
   d. Maps DB planners to PlannerTemplate[]
   e. Calls runMatchingPipeline({ student, planners, unitMasterTable, config })
   f. Adds graduationCheck (unmatchedCore.length === 0 && totalCredits >= 300)
5. Matching pipeline runs 6 phases → DisplayPayload
6. Dashboard renders: detected major, match %, per-category breakdown, missing units, alternatives
7. [Optional] User clicks Export → ExportModal → POST /api/export → downloads XLSX
```

### Flow 2: Planner Import (PDF)

```
1. User opens Import page, uploads PDF file
2. Frontend sends PDF to plannerImportService.extractPlannerFromPdf()
   (via the import API route - details unclear, see §16)
3. plannerImportService spawns Python binary with PDF file path
4. Python extracts unit codes, structure, metadata → JSON to stdout
5. [Optional] Python calls Ollama for quality review
6. Result { planner, report } returned to caller
7. UI displays extraction results with confidence score
8. User reviews/edits, clicks "Save"
9. POST /api/planners/save → savePlannerFromImport() → DB
10. Planner now available for future matching runs
```

### Flow 3: Cloud Sync

```
1. User opens Cloud Sync page
2. GET /api/cloud-sync → fetches cloud planner list from CLOUD_API_URL/api/planners
3. Local app checks which cloud planners are already imported (by course_code + intake_year + intake_month)
4. UI shows list with available/already_imported status
5. User selects planners, clicks "Import"
6. POST /api/cloud-sync { ids: [...] }
7. For each ID: fetch CLOUD_API_URL/api/planners/${id}/export → savePlannerFromImport()
8. Returns results: pulled | duplicate | failed per ID
```

### Flow 4: Excel Export

```
1. User clicks Export button on Dashboard
2. ExportModal appears: select sections (student_profile, major_match, unit_plan, study_planner)
3. POST /api/export with { student, dashboardData, sections }
4. exportService.generateExport() builds multi-sheet xlsx-js-style workbook
5. Binary XLSX returned as attachment → browser downloads file
```

### Data Type Transformations (Matching)

```
Portal HTML (webview)
    ↓ advisorScraperService
ScrapedStudent            ← what the UI and scraper API work with
    ↓ match API route transformation
RawStudentInput           ← stripped to what matching needs (unit codes only)
    ↓ unitNormalizer
Set<string>               ← normalised unit codes
    ↓ profileBuilder
StudentProfile            ← units classified into categories
    ↓ scoringEngine
PlannerScoreRecord[]      ← score per planner
    ↓ majorDetector
DetectionResult           ← which major(s) detected
    ↓ outputPackager
DisplayPayload            ← final structure rendered on dashboard
```

---

## 16. Known Gaps & Undocumented Areas

These are areas where the code exists but is not fully documented, or where the current understanding has uncertainty. **Do not assume — investigate the code directly for these.**

### 1. Planner Import API Route

The import page's flow for triggering PDF extraction is not fully clear. `web/app/api/planners/save/route.ts` saves an already-parsed `PlannerImportPlanner` — but it's unclear which API route triggers the Python extraction step from the import page UI. The `/api/import` route handles Excel transcript files (not PDFs). The import page likely calls the Python service directly via a different mechanism or the `plannerImportService` is called from the UI via a different route.

### 2. ElectiveGroup Schema vs Documentation

The `ElectiveGroup` Prisma model in `base.prisma` does **not** have `name` or `slots_required` fields — only `id`, `planner_template_id`, and timestamps. Earlier documentation (wiki) described these fields. Either they were removed, or they exist in the DB schema (init.psql) but not in the Prisma model. Verify `runtime/postgres/scripts/init.psql` for the actual DDL.

### 3. Custom Planner Scheduler

`core/services/scheduling/customPlannerScheduler.ts` exists but its logic, inputs, outputs, and how it connects to the UI are not documented. The `POST /api/custom-planner` route and the planners page likely use it.

### 4. Scraper Store

The scraper uses a server-side in-memory store (`web/app/api/scraper/store.ts`). The exact shape of this store, what it caches, and its lifecycle (does it clear on each request? on app restart?) are not documented.

### 5. `scraperOrchestrator.ts` vs `advisorScraperService.ts`

Two files exist in `core/services/scrapper/`: `advisorScraperService.ts` and `scraperOrchestrator.ts`. The relationship between them (whether one wraps the other, or they serve different purposes) is not clear from filenames alone.

### 6. Python Service Internals

The Python service (`plannerStructureService.py`) does the actual PDF parsing but its internal logic — what libraries it uses (pdfplumber? pdfminer? pytesseract?), how it structures unit extraction, how it formats the output JSON — is not documented here. Inspect the script directly for implementation details.

### 7. Scraping Page → Dashboard Integration

How the scraping page passes the `ScrapedStudent` to the dashboard is via the server-side scraper store. The exact handoff mechanism (polling? event? direct navigation with state?) needs to be verified in the UI code.

### 8. Student ID Suggestions

The dashboard has an autocomplete for student IDs. `ScraperContext.fetchStudentSuggestions()` is called — but where these suggestions come from (portal? local cache? mock?) is not fully documented.

### 9. Requisite System Usage

The `UnitRequisiteGroup` and `UnitRequisiteCondition` tables exist and prerequisites are stored in the DB (seed file `02_prerequisites.sql`). However, prerequisites are displayed in the planners page but are **not** used in the matching algorithm scoring. There is a `RequisiteFlag` type in `matching.ts` suggesting future use.

### 10. Graduation Eligibility Threshold

The graduation eligibility check uses `totalCredits >= 300` hardcoded in `web/app/api/match/route.ts`. This assumes 300 credits for graduation. Whether this is configurable or correct for all courses at this university is not documented.

### 11. `areasOfStudy` Field

`ScrapedStudent` has an optional `areasOfStudy?: string[]` field. It is not clear how this is used in the matching or display logic.

### 12. Ollama Model Management in UI

The `/api/ollama/status` and `/api/ollama/pull` routes exist, but there is no visible Settings UI for model selection or download progress in the current `settings/page.tsx`. The Ollama management may be accessed elsewhere or may be partially implemented.

### 13. `scraper/start` Endpoint Purpose

`POST /api/scraper/start` exists alongside `POST /api/scraper` — the distinction between "starting" a scraper session and submitting results is not documented in the routes themselves.

