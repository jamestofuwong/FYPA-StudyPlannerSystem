# docs/ai

Documents for people and AI agents who work on this repository. Start at [AGENTS.md](../../AGENTS.md), which says which file to read for which task.

| File | Content |
|---|---|
| [architecture.md](architecture.md) | Parts, layers, start-up order and the main flows |
| [nextjs-differences.md](nextjs-differences.md) | Where the project differs from standard Next.js, and why |
| [electron-bridge.md](electron-bridge.md) | How the UI reaches the operating system, and the web-conversion notes |
| [data-model.md](data-model.md) | Schema, migrations, seed data and where data lives |
| [config-and-secrets.md](config-and-secrets.md) | Variables, where to set them, rotation (no values) |
| [deployment.md](deployment.md) | The three pipelines, release, deploy, verify, rollback |
| [testing.md](testing.md) | Test layers, commands, how to write a test, known gaps |
| [glossary.md](glossary.md) | The words of the project |
| [generated/](generated/) | Lists written from the code by `npm run docs:facts` |

Module documents sit next to the code, in a `README.md` inside the module folder.
