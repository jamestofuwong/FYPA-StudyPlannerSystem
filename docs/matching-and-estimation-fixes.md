# Matching and class estimation: final fixes and known limitations

Branch `feature/matching-bug-fixes`, November 2026. This is the final check before handover. The app already worked; these fixes make major detection and the class forecast more accurate and make every part of the app give the same answer for the same student. No feature was added.

Module documents: [matching](../core/services/matching/README.md), [class estimation](../core/services/classEstimation/README.md).

## How the work was checked

1. A five-part code review (correctness, readability, architecture, security, performance) of `core/services/matching` and `core/services/classEstimation`.
2. Every suspected bug was first reproduced with a small test that failed. Each fix below has a regression test that fails on the old code and passes on the new code.
3. A mutation check: 12 key rules were broken on purpose, one at a time (for example adding new students before the retention discount, or counting a unit twice). The tests caught all 12.
4. The full suites were run again after the fixes (see [Test results](#test-results)).

## The fixes

### 1. A unit in a prescribed pool and the free-elective pool could seat one student twice

- **What was wrong.** If one unit was listed both in an elective group and as a free elective, it became a candidate in both, so the student's seats were counted in it twice.
- **Why.** The scoring engine has the rule "a unit in a prescribed pool never also counts as a free elective". The candidate resolver did not apply it.
- **Fix.** The resolver applies the same rule.
- **Effect.** None on today's planners, which have no such overlap. It stops a future planner import from inflating a figure.
- **Test.** "a unit in a prescribed pool is never also a free-elective candidate" (same file).

### 2. The second major could be the same planner or the same major as the primary

- **What was wrong.** The second major was simply the planner ranked second, with no check against the primary. If two planners of the same major were both candidates, the dashboard could report "Primary: Cybersecurity, Second major: Cybersecurity". With a manual override onto the second-ranked planner, the same planner came back as both primary and second major.
- **Why.** `majorDetector.ts` read `ranked[1]` without checking it against the primary.
- **Fix.** The second major is the best-ranked planner of a different major name, and it must still reach `secondMajorThreshold`. The ranking itself is unchanged.
- **Effect.** This is a safety check against bad or duplicate data, not a change to how majors are detected. For a normal student nothing changes: the planner filter narrows the candidates to one intake, and each major has one planner per intake. It only applies when:
  - the same planner is imported twice, for example an updated PDF loaded without removing the old one
  - two courses use the same major name, since the dashboard matches against every course's planners, not only the student's own
  - a manual override points at the second-ranked planner (nothing in the app sets an override today, but the code supports it)

  It affects the dashboard and the copilot. Class estimation does not use the second major.
- **Test.** `tests/unit/matching/major-tiebreak.test.ts`, "MajorDetector second major".

### 3. The copilot could name a different major from the dashboard

- **What was wrong.** The copilot workflow "what major is this student in" (`getStudentMajor.ts`) ran its own copy of the matching set-up and differed from the dashboard in two ways:
  - It read the intake with `new Date("DD/MM/YYYY")`, which swaps day and month. 1 September 2023 was read as 9 January 2023, so an Aug/Sept student was matched against Feb/Mar planners.
  - It counted every transcript row as completed, failed units included.
- **Why.** The planner mapping and unit table had been copied into the dashboard and three copilot workflows. The copies drifted apart.
- **Fix.** `getStudentMajor.ts` now calls `runDashboardMatch` with the same inputs as the dashboard and the copilot's graduation check. `getPlannerScoreBreakdown.ts` now uses the shared builders and counts only passed and in-progress units.
- **Effect.** The dashboard, the copilot and class estimation now build planners the same way, through `buildPlannerTemplatesForMatching` and `buildUnitMasterTable`.

### 4. "Or" prerequisites were read as "and"

- **What was wrong.** A rule like "COS10009 or COS10010" was turned into "COS10009 and COS10010", so a student who took only one of the two would be flagged as missing the other.
- **Why.** `flattenRequisites` in `unitMasterTableBuilder.ts` listed every condition of every alternative. The database stores alternatives as separate groups (`core/db/utils/parse-requisite.ts`: `/` is OR, `&` is AND).
- **Fix.** The flat list keeps only the conditions found in every alternative, which hold whichever one the student took. Plain "and" rules are unchanged.
- **Effect.** Nothing visible yet: no page or workflow shows these flags today (see [Pending: the copilot prerequisite check](#pending-the-copilot-prerequisite-check)). When they are used, they never flag a student falsely, at the cost of possibly missing a violation of an "or" rule. Class estimation's eligibility check is not affected: it reads the full rule from the database.
- **Test.** `tests/unit/matching/unit-master-table-builder.test.ts`, "keeps only the requisites shared by every alternative group".

### 5. The dashboard used an incomplete unit table

- **What was wrong.** `/api/match` built a placeholder unit table with no names, no requisites and no offering semesters. `unitMasterTableBuilder.ts` had been written to replace it, but only class estimation used it. A side effect was that the `unavailableUnits` field listed every missing unit as "not offered".
- **Fix.** `dashboardMatch.ts` uses `buildPlannerTemplatesForMatching` and `buildUnitMasterTable`.
- **Effect.** No visible change on the dashboard: scoring does not read the fields that were missing, and no page shows `unavailableUnits` or `requisiteFlags`. The data behind the page is now correct and matches class estimation.

### 6. Starred prescribed electives were never forecast

- **What was wrong.** The starred units on a planner (for example COS10003\* and COS30019\* on Software Development) never got a seat. On the Feb/Mar 2026 Software Development planner, that left 2 of the 6 elective units out of every student's forecast. On the dashboard, the same planners got full marks for prescribed electives.
- **Why.** "Prescribed" means two things. On the planner, a starred unit is a prescribed elective: a recommended pick from the course's approved list. A student may take another elective instead (the HoD accepts this), unless a unit the student needs requires the starred one. In the database these are `prescribed_elective` rows with a slot. In the matcher, "prescribed" means the database's elective groups (the unslotted pool), and `prescribed_elective` rows are not read at all (`plannerTemplateBuilder.ts`). Class estimation takes its candidates only from what the matcher read.
- **Fix.** Class estimation now reads the starred units from the planner itself (`getStarredElectiveCodes`). Each one the student has not passed is a whole seat on that unit, ranked by the semester the planner puts it in and counted under "Needed to graduate". A student who picks another unit from the approved list is still counted on the starred unit. That over-prepares the starred unit on purpose, and keeps the student's number of seats right. Students with no detected major get the starred units that every major of their course shares, such as COS10003 in Year 1.
- **Effect.** Higher "Needed to graduate" figures for the starred units. The dashboard score is unchanged (see the [Future improvements](#future-improvements)).
- **Known over-count on the 2024 planners.** The Feb/Mar 2024 planners have 4 starred electives and no WIL unit. A student there could take WIL instead of 2 of the starred electives and still graduate (confirmed with the HoD). Class estimation assumes every student does WIL, so by that rule a 2024 student owes only 2 of the 4 starred units. The forecast still gives a seat to every starred unit the student has not passed, so it can count up to 2 seats too many per 2024 student, on the starred units. This is accepted: it errs towards preparing too many seats, and the data cannot tell which 2 a student would drop. The 2025 and later planners are not affected, because WIL is already one of their 24 units (Mar 2025: "1 WIL Placement Unit, 25 credit points").
- **Test.** `planner-candidate-resolver.test.ts`, "a starred prescribed elective the student has not passed is a named candidate" and "proposes starred units every candidate planner shares"; `unit-ranker.test.ts`, "ranks a named prescribed unit by its slot".

### 7. WIL removed 2 free electives a second time

- **What was wrong.** For the Sept 2025 and later planners, class estimation counted each student as owing 2 of the 4 listed free electives instead of 4.
- **Why.** WIL is compulsory, so class estimation assumes every student does it (`defaultHasWIL: true`). That is intended: WIL itself is never forecast, because it is an off-campus placement in the semester break. But in the matcher, "has WIL" also waives 2 free electives (`applyWILExemption`). The planners already leave those 2 out: the Feb/Mar 2026 planner lists 22 units plus WIL ("equivalent to 2 elective units"), 24 in all. So the waiver removed them twice. In the older planners the free electives are an elective group, which the waiver never touches, so there it had no effect.
- **Fix.** Class estimation runs the matcher with `wilExemptionCount: 0`. WIL is still assumed. The dashboard is unchanged: it sends "no WIL", so the waiver never applies there, and the WIL line in the breakdown reminds the advisor that it is still to do.
- **Effect.** Higher Optional (free elective) figures for Sept 2025 and later intakes. Older intakes are unchanged.
- **Test.** `estimation-preview.test.ts`, "assuming WIL does not waive any of the free electives the planner lists". It replaces a test that had pinned the old behaviour.
- **Impact check.** To see whether the change does anything beyond the free electives, every seed planner (50) was run through the matcher with the old and the new setting. For each planner, a simulated student followed it exactly, at each of 7 stages of the degree (0 to 6 semesters done): 350 runs in all.

  | What was compared | Result |
  |---|---|
  | Free electives owed changed | 48 of 350, all on Sept 2025 and later planners. Each student owes 1 to 2 more, for example Cybersecurity Sept 2026 after 2 semesters: 1 before, 3 after. This is the intended fix. |
  | Planner ranking the same as the dashboard's | 309 of 350 before, 350 of 350 after |
  | Top-ranked planner changed | 14 of 350 |
  | Major detected or not detected changed | 2 of 350 |
  | Largest drop in match % | 5 points (the free-elective weight is 5%) |

  **Why the top planner changed in 14 runs.** Planners are ranked by the major-core score, and the match % only decides a tie. The old waiver gave some planners full marks on free electives for nothing: AI Feb/Mar 2023 has one free elective, the waiver took it to zero, so AI won every tie. Ties are now decided by the electives a student has really passed, the same way the dashboard decides them. That is why the ranking now matches the dashboard in every run.
  - 12 of the 14 are students with no major detected, either way. For them the top planner only stands in for the eligibility lookup, so their forecast does not change.
  - The other 2 are Sept 2026 AI and Software Development students after 3 semesters. AI, Data Science and Software Development tie on the major-core score (0.38), and their match % differs by less than one point. Before the change one of the two was detected and the other was not; after it, the reverse. Both were close calls before and still are.

  The check used simulated students who follow their planner exactly, on the seed planners. Real students who mix units from different semesters tie less often.

### 8. Smaller fixes

| What was wrong | Fix | Test |
|---|---|---|
| A failed planner read stayed in `plannerCache.ts` for the whole run, so one database hiccup failed every later student on that planner. | A failed read is removed from the cache, so the next student retries it. | `planner-cache.test.ts`, "a failed read is not cached" |
| Planners were read from the database twice per estimation run, and twice per dashboard match. | `buildUnitMasterTable` accepts planners that the caller has already loaded. | `unit-master-table-builder.test.ts`, "uses planners passed in" |
| `/api/match` checked only that a student was sent. A malformed one failed inside the matcher with a 500 error. | It checks `completedUnitCodes`, `intakeYear` and `intakeSemester` and answers 400. The dashboard always sends valid data, so it is unaffected. | `tests/api/match.test.ts` (new) |
| Comments said `courseType` decides which planners a student is matched against. It does not. Another comment called a scoring bug "not fixed", but it had been fixed. | Comments corrected. | None needed |

## Decisions: left as they are on purpose

### Elective seats are spread over every elective group

A student who still owes a prescribed elective has that seat spread over the units of every elective group of their planner, including groups they have already completed. Example: groups A (A1, A2) and B (B1, B2), the student passed A1 and owes a unit from B. Part of their seat goes to A2.

A fix that used only the unfilled groups was tried and removed. There is no record of which elective a student will actually pick, and it is better to prepare a seat too many than one too few. A test now fixes this behaviour in place: `planner-candidate-resolver.test.ts`, "the prescribed pool spans every elective group, including ones the student has filled".

### Pending: the copilot prerequisite check

The copilot workflow `get_student_prerequisite_violations` always answers "no violations", because it gives every unit an empty requisite list. It is owned by another team member, and the rules it should apply need to be agreed first, so it is unchanged on this branch. A proposed fix (shared unit table, passed units only, with tests) is in commit `5d15c7e` on this branch.

## Test results

Run on 19 November 2026 on this branch.

| Check | Command | Result |
|---|---|---|
| Type check, lint, documentation check, all fast tests | `npm run verify` | Pass: 139 suites, 2,760 tests (342 skipped are the opt-in suites that need a real model or a scenario database) |
| Integration tests against a real throw-away PostgreSQL | `npm run test:integration` | 6 suites, 106 tests pass |

The integration tests were run as a non-root user. Run as root, the embedded PostgreSQL cannot open its own temporary folder. That is a limit of the test container, not of the code.

## Future improvements

These are inside the team's control but were left out: they need a decision or data, or they would change behaviour that has passed UAT.

1. **One intake rule for the dashboard and class estimation.** The dashboard reads the intake from the enrolment date. Class estimation reads it from the first term code on the transcript, which is more reliable (an enrolment date can be a re-enrolment). For a student whose two signals disagree, the two features can pick different planners. The fix is to move the term-code rule into `core/shared` and use it in both, after checking it against real students.
2. **Dashboard score for starred prescribed electives.** The matcher does not read `prescribed_elective` rows, so a planner with starred units and no elective group gets full marks for prescribed electives (20% of the score). Reading them would change every match % on those planners, so it needs checking against UAT results first.
3. **Keep "or" prerequisites in the copilot check.** Give `Requisite` a group number so `checkRequisites` can test "any one alternative met". The check would then catch every violation.
4. **Share the enrolment-date parsing.** The same three lines that read an intake from the enrolment date are in `dashboard/page.tsx`, `handoff.ts`, `checkGraduationStatus.ts` and `getStudentMajor.ts`. Moving them into `core/shared` would make one place to fix.
5. **Filter planners by course type.** `courseType` is carried but never used to filter. A diploma student is scored against degree planners too. This matters once diploma or foundation planners are loaded.
6. **Thresholds on the right score.** Planners are ranked by the major-core score, but the no-major and second-major thresholds compare the overall match percentage. Confirm with the HoD which score each threshold is meant for.
7. **Elective group sizes.** Every elective group is scored as one slot, because the database has no slot count per group (`ElectiveGroup` in `base.prisma`). The older planners keep all their free electives (4, or 6 without WIL) in one group, so those students are under-counted on electives, and the WIL waiver cannot be applied to them. Adding a `slots` column needs a migration and the planner import to read it.
8. **Same-semester corequisites.** Class estimation treats a corequisite as met only if the student already passed it or is taking it now, not if both units would be taken in the target semester.
9. **Minor detection.** `detectedMinors` is always empty and units have no subject tags. It was planned (Phase 7) but not built.

## Known limitations outside the team's control

These depend on data or systems that the team does not own. None can be fixed in code alone.

### Data that does not exist or that the team cannot get

| Limitation | Effect | What would fix it |
|---|---|---|
| **No official past enrolment counts per unit.** The university did not provide class lists or headcounts from past semesters. | The forecast cannot be checked against what really happened. The back-test (`npm run backtest`) uses the students' own transcripts as the "actual" figure, so students who left never appear on either side, and the retention rate is never tested. | Official enrolment numbers per unit per semester for at least two past years. |
| **No visa, deferral, withdrawal or graduation status in the portal.** | Retention is one flat rate for every student (default 85%), set by the HoD. A final-year local student and a first-year international student get the same discount. | A portal or student-records field for these statuses. |
| **No major on the student record.** | The major has to be inferred from units passed. About a fifth of a cohort (first-year students) has taken nothing that separates the majors. They get only the shared core units, and their major-specific units enter the forecast once a major can be detected. | A declared-major field in the portal. |
| **No WIL approval or completion field.** | WIL is compulsory, so class estimation assumes it for every student, and the dashboard always shows it as still to do, even for a student who has done it. Neither can tell from the portal whether a student has done WIL. | A WIL status field in the portal. |
| **No student preference data for electives.** | Elective seats are spread over the pool by how many students in the batch already passed each unit. This is a weak signal, and the requirement explicitly did not ask for accuracy here. | Elective pre-selection or past choice data. |
| **New-intake numbers are typed by hand.** | The forecast for first-semester units is only as good as the HoD's estimate. | Admissions offer and acceptance data. |
| **No class capacity, timetable or staffing data.** | The forecast is demand (students who need a unit), not seats or sections. Timetable clashes and caps are not considered. | Timetable and room-capacity data. |

### Data that exists but is incomplete or ambiguous

| Limitation | Effect |
|---|---|
| **Offering semesters are missing for many units.** At the time of the class estimation work, 37 of 67 units had none, mostly because the planner PDF said "both semesters" in a form the PDF reader does not catch. | A unit with no offering data is treated as running in both semesters, so it can be forecast in a semester it does not run. |
| **Planner PDFs do not state how many units an elective group needs.** | Each group is scored as one slot (see future improvement 7). |
| **The portal's enrolment date is ambiguous** (DD/MM/YYYY, and may be a re-enrolment date). | The intake can be read wrong when no term code is available. |
| **Unit codes change over time** (for example a planner asking for ICT20016 when the transcript shows ICT20026). | The record builder can rewrite old codes to new ones (`unitCodeAliases`), but the university has no published list of code changes, so the app passes none today. A passed unit under an old code looks missing on the dashboard and in the forecast. |
| **Credit points are missing on some transcripts.** | A flat 12.5 credit points per unit is assumed, which can be wrong for credit-point prerequisites such as "150 cp before the capstone". |
| **Only some courses and intakes have planners loaded.** | A student whose intake year has no planner is matched against the most recent year with the same intake semester. A student in a course with no planners cannot be matched. |

### Systems the app depends on

| Limitation | Effect |
|---|---|
| **The university portal can change without notice.** | Login or data reading can break and needs a code update (`core/services/portal`). |
| **Portal access needs a staff login.** | Class estimation and the dashboard need a logged-in session. The degree progress audit file import is the fallback. |
| **The copilot runs on a small local language model** (`qwen2.5:3b` through Ollama). | It can route a question to the wrong workflow. The matching answers themselves come from the rule-based code, not the model. |
