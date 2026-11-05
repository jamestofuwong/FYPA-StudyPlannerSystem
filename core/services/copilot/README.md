# copilot: the AI Copilot

A small local model (`qwen2.5:3b` on Ollama, port 11435) routes a question to one **workflow**. Code runs the workflow and computes every fact. The model only chooses the workflow and phrases the answer.

## Entry points

- `copilotService.ts`: `routeAndExtract(messages, workflows, options)`. The router.
- `workflowRegistry.ts`: the list of workflows (`allWorkflows`, `workflowRegistry`).
- `workflows/*.ts`: one file per workflow. The list with ids, parameters and descriptions is generated: [docs/ai/generated/copilot-workflows.md](../../../docs/ai/generated/copilot-workflows.md).
- `responseFormatter.ts`: `streamResponse`. Phrases the answer from the workflow result.
- `workflowLinks.ts`: which page can show each answer. Links are decided in code, never by the model. A test requires every workflow to be in the table.
- `handoff.ts`: prepares a student's dashboard data in memory so a link opens the page already filled.
- `plannerNames.ts`, `semester.ts`: planner names to ids, and "this semester".
- Caller: `web/app/api/copilot/chat/route.ts` (NDJSON stream; `runtime = 'nodejs'`).

## How a message is routed

1. **Write requests are refused.** A message that starts with a verb such as change, delete, update or add gets `refusal: 'read_only'`. No model call.
2. **Keyword filter** (`rankWorkflows`). Words from the message are matched against each workflow's id, `keywords`, parameter names and description. A word counts by how rare it is among workflows. Id and keyword matches count more. A unit code, a student id, a planner id, a year or a major name raises the workflows that take that value. At most 10 candidates go on (3 when one is far ahead). When nothing matches, no model call is made.
3. **Model call.** The model sees only the candidate ids and descriptions and answers with one id (`pickWorkflowId` accepts extra words, a `:suffix`, quotes and `<think>` blocks). An id that was not a candidate is refused. When the model says "none" for a clear question and the filter has one clear winner, the winner is used.
4. **Parameter extraction** by regular expressions (`extractParamsRegex`): `studentId` (7 to 10 digits), `unitCode`, `plannerId` (UUID), `intakeYear`, `semester` ("sem 2", "summer", "this or next semester"), `prefix`, `majorName`, `enrollMode`. A required parameter that is missing is asked for.
5. **Planner names.** When the workflow needs a planner and the message has no UUID, `loadPlanners` (passed in by the chat route) lets "the Data Science planner" become a planner id. A year picks the intake, otherwise the latest intake is used and the answer says so.

## Add or change a workflow

1. Create `workflows/<name>.ts` exporting `const <name>Workflow: Workflow` with `id` (snake_case), a clear `description` (what the model reads; say when to use it and when not), `keywords` (everyday words that the description lacks) and `params`.
2. Register it in `workflowRegistry.ts`.
3. Add it to `workflowLinks.ts` (a workflow with nothing to show maps to `none`). `tests/unit/copilot/workflowLinks.test.ts` fails if a workflow is missing from the table. You do not edit that test.
4. Add at least four prompts to `tests/unit/copilot/routing-prompts.data.ts` in the style of an advisor (casual, formal, lower case, slang). This is the only test table that you edit: `routing-prompts.test.ts` fails when a workflow has fewer than four prompts, and `workflow-registry.test.ts` fails when a workflow is not registered or its description is poor.
5. If it needs a parameter, check that `extractParamsRegex` understands the name (a test checks required ones).
6. Run `npx jest tests/unit/copilot`, then `npm run docs:facts`.
7. Optional but recommended: `RUN_OLLAMA_TESTS=1 npx jest tests/unit/copilot/routing-ollama.test.ts` and read `tests/unit/copilot/ROUTING-OLLAMA-RESULTS.md`.

The description is the most important text. A poor description makes the router pick the wrong workflow. Contrast confusing siblings in their descriptions ("Not for X (use Y)").

## Rules

- Never let the model compute a fact or decide a link.
- Do not import `workflowRegistry` in a script or a test without mocking `puppeteer`: it loads the portal service, which tries to restore a session and call the real portal.
- A workflow returns `{ ok: true, data }` or `{ ok: false, error }`. It does not throw across the layer.
- Workflows that take `studentId` need a portal session. The chat route checks it before it runs them.

## Tests

`tests/unit/copilot`: `routing.test.ts` (stub workflows), `routing-prompts.test.ts` (real registry, stand-in model, writes `ROUTING-RESULTS.md`), `routing-ollama.test.ts` (real model, opt in, writes `ROUTING-OLLAMA-RESULTS.md`), `router-improvements.test.ts` (planner names, semesters, refusals), `workflow-registry.test.ts`, `workflowLinks.test.ts`, `handoff.test.ts`. Also `tests/api/copilot-chat-links.test.ts` and `tests/ui/copilot-*`.
