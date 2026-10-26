# scheduling: the pathway scheduler

Builds a semester-by-semester plan for the units a student still needs. The advisor's Student Pathway page and the student web app both use it, so they give the same plan.

## Entry points

- `customPlannerScheduler.ts`: `buildCustomPlan(...)`. The scheduler itself. Pure: no database, clock or globals. Anything it cannot place goes to `unschedulableUnits` with a warning. It also exports `calendarTermFor`, `resolveSchedulerConfig` and `SchedulerConfig`.
- `planForPlanner.ts`: `startPlanForPlanner` and `finishPlanForPlanner`. They build the plan from a planner and a list of completed units. The work is split in two because the advisor looks at the free elective slots between the halves (sibling majors and minors depend on how many slots are free). `plannedSlotOf` is exported for tests.
- Callers: `web/app/api/custom-planner/route.ts` (desktop) and `student/lib/generate-plan.ts` (student app). Both load their own rows, map them with `unitRowToSchedulable` (`core/shared/scheduling/schedulableUnit.ts`) and pass them in.

## Rules

- Caps per semester: 4 standard units and 1 MPU (`SchedulerConfig`).
- A unit is placed only in a semester that it is offered in (calendar terms from its `unit_offerings`). A unit with no rows can go in any semester.
- Only semesters 1 and 2 are scheduled. A unit offered only in summer or winter is reported and never placed in an ordinary semester.
- Prerequisites, corequisites, credit-point requisites, Project A before Project B, and the work placement in a break.
- A Conceded Pass counts as taken and earns credit, but cannot satisfy a prerequisite or corequisite. The scheduler plans such a unit again when a later unit needs it.
- The start semester comes from the calendar term codes on the transcript (`resolveNextStudyTerm`).
- With `plannedSlot` on units, a second plan follows the planner order. It is accepted only when it finishes no later than the fastest plan. Recommended electives take the latest open slots.
- Semester numbers in a planner are 1 or 2. Calendar terms are 1 (Feb or Mar), 2 (Aug or Sep), 3 and 4 (breaks). Convert with `calendarTermFor`. Never convert by hand.

## Shared helpers (`core/shared/scheduling`)

`electiveSlots.ts`, `planEdits.ts`, `planTerms.ts`, `planValidator.ts`, `planWarnings.ts`, `schedulableUnit.ts`. The student app imports some of them, so keep them pure.

## How to change a rule

1. Edit `customPlannerScheduler.ts` (or `planForPlanner.ts`).
2. Add a test in `tests/unit/scheduling` that fails first.
3. Run `npx jest tests/unit/scheduling`. Run the scenario suite if you can (`tests/scenarios`).
4. The student app must still build. Run `npm run test:student`.

## Tests

`tests/unit/scheduling`, `tests/integration-db/pipelines.test.ts` (every seed planner through the real scheduler; known unplaceable units are listed there).
