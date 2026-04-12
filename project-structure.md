# Study Planner System – Project Architecture & Structure (Desktop Application)

## 1. Overview

This project is implemented as a **single bundled desktop application** using Electron.  
All components — frontend, backend, and database — are packaged and executed locally.

The system follows a:

> **Modular Monolithic Architecture with Service-Based Layered Design and Embedded Database**

### Key Characteristics

- Single deployable application (Electron bundle)
- No external server required
- Local API layer using Next.js (frontend + backend)
- Embedded PostgreSQL database
- Clear internal separation of concerns

---

## 2. High-Level Architecture


Electron (Application Shell)
↓
Next.js (UI + Internal API Layer)
↓
Service Layer (Business Logic)
↓
Database Layer (Prisma ORM)
↓
Embedded PostgreSQL


---

## 3. Project Structure


study-planner-system/
│
├── web/ # Next.js application (UI + API)
│ ├── app/ # Pages (UI rendered by Next.js)
│ ├── app/api/ # Internal API routes (Next.js backend)
│ └── components/ # Reusable components
│
├── electron/ # Electron application shell
│ ├── main.ts # Main process
│ ├── preload.ts # Preload scripts / IPC bridge for OS features
│ └── ipc/ # OS-level IPC handlers (dialogs, filesystem)
│
├── core/ # Core system logic
│ ├── services/ # Business logic layer
│ ├── db/ # Database layer (Prisma + repositories)
│ └── shared/ # Shared utilities and types
│
├── runtime/
│ └── postgres/ # Embedded PostgreSQL binaries and data
│
├── scripts/ # Development and build scripts
├── package.json
└── tsconfig.json


---

## 4. Detailed Breakdown

### 4.1 `app/` – Next.js Application Layer

Handles both:

- **User Interface (UI)** rendered by Next.js pages
- **Internal API routes** for frontend → service communication

#### Responsibilities

- Render UI using Next.js pages
- Handle user interactions
- Provide API endpoints for the frontend to call business logic

#### Role in Architecture

- Acts as:
  - **View layer (UI)**
  - **Controller layer (API routes)**

---

### 4.1.1 Frontend Organization: Type‑Based (Layer‑Based) Structure

The frontend code inside `web/` follows a **type‑based (layer‑based) organization**:
web/
├── app/ # Next.js App Router pages (views)
│ ├── dashboard/
│ │ └── page.tsx
│ ├── planners/
│ │ └── page.tsx
│ └── import-export/
│ └── page.tsx
├── components/
│ ├── ui/ # Pure, reusable UI components
│ │ ├── Button.tsx
│ │ ├── Table.tsx
│ │ └── ...
│ └── layout/ # Layout components (sidebar, status bar, etc.)
│ ├── MainLayout.tsx
│ └── ...
├── styles/ # Global styles and theme variables
│ ├── globals.css # Resets, base element styles, font imports
│ └── variables.css # CSS custom properties (light/dark theme)
├── hooks/ # Shared custom hooks
├── services/ # API calls to the internal Next.js backend
├── stores/ # Global state management (if needed)
├── types/ # Shared TypeScript types
└── utils/ # Pure helper functions

text

- **Views** (`web/app/`) contain only page‑level components that compose reusable UI pieces and handle routing.
- **UI components** (`components/ui/`) are stateless, purely presentational, and designed to be reused across views.
- **Layout components** assemble the persistent UI shell (sidebar, main panel, status bar) as required by the VSCode‑inspired design (Section 11 of AGENTS.md).
- **Global styles** are kept in `styles/` – `globals.css` for resets and base styles, `variables.css` for theme‑related custom properties (enabling dark mode support).

#### Why type‑based?

- The frontend is intentionally **simple and data‑focused** – its main role is to display backend results and guide the user through a few core workflows (lookup, planner upload, export).  
- A type‑based structure is easy to understand, quick to scaffold, and aligns perfectly with the **separation of UI and logic** mandated by REQ‑MAI‑101 and REQ‑CON‑107.  
- It avoids the overhead of a feature‑based architecture, which would introduce unnecessary complexity for a project of this scope.

### 4.1.2 CSS Strategy: Co‑located CSS Modules + Global Theme

All component‑specific styles are written using **CSS Modules** and stored **next to their respective component** (e.g., `Button.module.css` beside `Button.tsx`).  

- **Encapsulation:** Class names are scoped locally, eliminating naming collisions and making styles predictable.  
- **Maintainability:** When a component is deleted, its styles disappear with it – no orphaned CSS.  
- **Theme support:** Global CSS variables defined in `styles/variables.css` (e.g., `--color-background`, `--color-text`) are consumed inside component modules. The dark theme is toggled by adding a class to the `<html>` element that swaps the variable values.  
- **Base styles:** `styles/globals.css` contains resets (e.g., a modern normalizer), default font families, and any element‑level styles that should apply everywhere.

This approach is natively supported by Next.js, requires zero extra tooling, and keeps the codebase clean and scalable – even as the UI grows.

### 4.2 `electron/` – Application Shell

Handles:

- Desktop window creation
- Application lifecycle
- OS-level interactions via IPC

#### Responsibilities

- Launch the application
- Start internal services (Next.js, PostgreSQL)
- Load UI into a desktop window

> **Note:** IPC here is only for OS-level features (file dialogs, filesystem access).  
> Business logic communication between frontend and backend occurs over **HTTP locally**, not IPC.

---

### 4.3 `core/services/` – Business Logic Layer

This is the **core of the system**.

#### Responsibilities

- OCR processing
- PDF parsing
- Matching algorithms
- Data transformation
- Business rules execution

#### Key Principle

> Services are independent of UI, HTTP, and Electron

---

### 4.4 `core/db/` – Database Layer

#### Responsibilities

- Define database schema using Prisma
- Manage database access
- Abstract queries using repositories

---

### 4.5 `core/shared/` – Shared Code

Contains reusable components:

- `types/` → TypeScript types
- `utils/` → Helper functions
- `constants/` → Shared constants

Used across:

- Next.js frontend and backend
- Service layer
- Database layer

---

### 4.6 `runtime/postgres/` – Embedded Database

Contains:

- `bin/` → PostgreSQL binaries
- `data/` → Database files
- `scripts/` → Start/stop scripts

#### Purpose

- Enables **offline functionality**
- Removes need for external database setup
- Ensures portability

---

### 4.7 `scripts/`

Handles:

- Development startup
- Build processes
- Application orchestration

---

## 5. Application Execution Flow

When the application starts:


Electron launches
↓
Starts embedded PostgreSQL
↓
Starts Next.js server (local)
↓
Loads UI in desktop window


---

## 6. Data Flow Example

### Planner Upload Pipeline


User Interaction (Next.js page)
↓
Next.js API Route (HTTP request)
↓
planner.service
↓
ocr.service
↓
parser.service
↓
match.service
↓
export.service
↓
Response back to Next.js page


> Note: Communication between frontend pages and API routes is over **HTTP locally**, not IPC.

---

## 7. Architectural Decisions

### 7.1 Why Modular Monolith?

- Simpler deployment (single Electron bundle)
- Strong internal structure
- No network overhead
- Easier debugging

**Alternative: Microservices**

| Aspect | Modular Monolith | Microservices |
|--------|-----------------|--------------|
| Deployment | Simple | Complex |
| Performance | High (local calls) | Network overhead |
| Complexity | Lower | Higher |
| Suitability | Desktop apps | Distributed systems |

**Decision:** Modular monolith is ideal for this desktop application.

---

### 7.2 Why Service-Based Architecture?

- All business logic centralized in `core/services/`
- Reusable across multiple frontend API routes
- Clear separation of concerns
- Easier testing and maintenance

---

### 7.3 Comparison with MVC

| Aspect | MVC | Service-Based |
|--------|-----|---------------|
| Controllers | Required | Not emphasized |
| Business Logic | Often in controllers | Centralized in services |
| Complexity | Higher | Lower |
| Suitability for Next.js | Less natural | More natural |

> Thin controllers in MVC effectively become service-based architecture anyway.

---

### 7.4 Why Layered Architecture?


UI (Next.js pages) → API (Next.js routes) → Services → Database


- Predictable flow
- Easier debugging
- Maintainability

---

### 7.5 Why `core/` instead of `packages/`?

- Single application (not multi-app monorepo)
- Internal logic, not reusable modules for external publishing
- Avoids misleading naming

---

### 7.6 Why Embedded PostgreSQL?

- No external dependencies
- Offline capability
- Consistent environment
- Easier deployment

**Alternative:** External DB requires user setup and reduces portability

### 7.7 Why Type‑Based Frontend Structure + CSS Modules?

| Aspect | Chosen Approach | Alternative (Feature‑Based) | Why This Fits |
|--------|------------------|-----------------------------|----------------|
| **Organization** | Type‑based (views, components/ui, services) | Feature‑based (each feature has its own components, hooks, etc.) | The frontend is a thin presentation layer; feature boundaries already exist at the view level. Type‑based is simpler and faster to implement. |
| **CSS** | Co‑located CSS Modules + global variables | Single global CSS folder | CSS Modules guarantee scoping and co‑location, making styles easy to maintain and delete. Global variables enable theming with minimal effort. |

Given the project’s tight schedule and the primary complexity residing in the backend, the type‑based structure with co‑located CSS Modules offers the best balance of clarity, speed, and maintainability.

---

## 8. Strengths of This Architecture

- Fully self-contained
- Clear separation of concerns
- Scalable internal design
- Suitable for complex processing (OCR, matching, pipelines)
- Academically robust and industry-aligned

---

## 9. Limitations

- Higher initial setup complexity
- Requires discipline to maintain structure
- Not suitable for distributed scaling

---

## 10. Conclusion

The combination of:

- **Modular monolith**
- **Service-based architecture**
- **Layered design**
- **Embedded database**

ensures the system is:

- Self-contained and portable
- Maintainable and scalable
- Academically and professionally sound