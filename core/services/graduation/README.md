# graduation: the graduation audit

`graduationAudit.ts` has one function, `auditGraduation(planner, transcript, options)`. The dashboard's Graduation tab and the AI Copilot both call it, so the two always agree.

## The rule

A student can graduate only when all of these hold:

1. Every compulsory unit on the planner is passed: core, major core, prescribed elective, and the work placement (WIL) when the planner lists one.
2. Enough elective credit is earned. The planner's elective credits count prescribed electives and any other passed unit that is not compulsory. On older planners where `wil_cp` is null, the 25-credit placement is folded into the electives and is worth two elective units.
3. Nothing is in progress (results are not in yet).
4. At most one Conceded Pass (`MAX_CONCEDED_PASSES` in `core/shared/constants/grades.ts`).
5. The credit total reaches what the course needs. The default is 300 (`DEFAULT_REQUIRED`). The portal's own figure is used when given.

MPU units are left out. Which unit of a pair applies depends on nationality, which the portal data does not carry.

## Invariants

- Grade sets live in `core/shared/constants/grades.ts` (`PASS_GRADES`, `CONCEDED_PASS_GRADES`, `FAIL_GRADES`: N and SN fail). Do not write your own grade lists.
- Code that reads planner credit targets must handle null (older planners).
- A requirement of 0 or missing falls back to 300, never to "no requirement".

## Tests

`tests/unit/graduation` (including the credit-limit tests in `graduationAudit.credits.test.ts`) and `tests/ui/dashboard-graduation-credits.test.tsx`. The copilot workflow `check_graduation_status` has its own test, `tests/unit/copilot/checkGraduationStatus.test.ts`.
