# Study Planner System

Two products in one repository, for Swinburne Sarawak:

- **Desktop app** (Windows and macOS) for academic advisors and Heads of Department. It finds the major of a student, checks graduation, builds study pathways, imports study planner PDFs, forecasts class sizes and answers questions with a local AI. It runs on one computer with its own database. It does not store student records: student data stays in memory.
- **Student web app** (`student/`) with public planner and unit pages, a plan builder and a CMS. It runs on Vercel with a Supabase database.

Built with Electron 41, Next.js 16, React 19, TypeScript, Prisma, embedded PostgreSQL, Ollama and a Python PDF extractor.

## Start

```bash
npm install
cp .env.example .env          # and web/.env.example to web/.env (see the files)
npm run dev                   # the first start downloads Ollama
```

The student app: `cd student && npm install && cp .env.example .env && npm run dev`.

## Check your work

```bash
npm run verify        # typecheck, lint, docs check and the fast tests
npm run verify:full   # also the integration, student and browser tests
```

## Where to read

| You are | Read |
|---|---|
| An AI coding agent, or a developer who works with one | [AGENTS.md](AGENTS.md) (rules, commands, and which document to read for which task) |
| A new developer | The Developer Guide (a Word file, kept next to the repository), or [docs/ai](docs/ai) |
| Looking for a module | The `README.md` in its folder (`core/services/*`, `core/db`, `electron`, `web`, `student`, ...) |
| An advisor who uses the app | The Setup and User Guide (a Word file), or the **User Guide** page in the app |

Tests: [tests/README.md](tests/README.md). Deployment and release: [docs/ai/deployment.md](docs/ai/deployment.md).
