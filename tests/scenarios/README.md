# Student scenario suite

50 realistic test students run through the three advisor features, with the result compared against what
*should* happen:

| Feature | The question the suite asks |
|---|---|
| **Matching** | Does it name the major and planner version the student is actually following? |
| **Graduation audit** | Does it say correctly whether the student can graduate, and what they still owe? |
| **Pathway** | Does it produce a plan that finishes the course, obeys the unit rules, is as short as possible, and stays aligned with the planner? |

## Running it

```
SCENARIO_DB_URL=postgresql://user:password@host:port/database npx jest tests/scenarios
```

`SCENARIO_DB_URL` must point at a database holding the application's study planners (the app's own embedded
database works: copy its `pgdata` folder and start it on another port). Without it the scenario file is skipped;
`oracle.test.ts` always runs because it needs no database.

Every run rewrites **`RESULTS.md`** (read this) and `results/latest.json`.

## What is in here

| File | Role |
|---|---|
| `scenarios.ts` | The 50 students, grouped A to F, each a story built from a real planner |
| `support/transcript.ts` | Builds a transcript in the portal / Excel format and bends it (fail, exempt, swap, move, conceded pass) |
| `support/oracle.ts` | The **expected** outcome, derived from the planners and university rules, never from the code under test |
| `support/actual.ts` | Runs the **real** features: `runDashboardMatch`, `auditGraduation` and the `POST /api/custom-planner` handler |
| `support/checks.ts` | Compares expected with actual, one named check at a time |
| `support/dataChecks.ts` | Compares the database planners and prerequisites with the official PDFs |
| `tools/extract-pdf-planners.py` | Reads `study-planner-pdfs/` into `fixtures/` (needs `pdftotext`) |
| `oracle.test.ts` | Tests the expectation rules themselves, so a wrong expectation cannot hide a real bug |

## Rules the expectations use

- **Graduation**: every core, major-core, prescribed-elective and WIL unit passed; enough elective credit
  (on older planners the WIL placement is worth two electives); nothing still in progress; at most one Conceded
  Pass; 300 credits. A later pass clears an earlier fail. An exemption (complete, no grade) counts as passed.
- **Matching**: only a unit that sits on one major's planner and no other major's counts as evidence for that
  major. With no such unit, saying "no major yet" (or the student's real major) is acceptable; naming another
  major is not.
- **Pathway**: must contain every unit still owed (a Conceded Pass that a needed unit depends on counts as owed
  again), exactly the electives still owed, place nothing where it is not offered or its requisites are unmet,
  keep to 4 standard units a semester, start in the semester that really comes next, and be no longer than
  the minimum the prerequisite chains and the 4-unit load allow. A student exactly on schedule must get the
  planner back, semester for semester.

## Known limits

- MPU units are left out of the graduation and pathway expectations, as they are in the application: which of a
  pair applies depends on nationality, which is not recorded.
- Planners for 2022 and 2023 intakes have no PDFs, so no student is built on them.
