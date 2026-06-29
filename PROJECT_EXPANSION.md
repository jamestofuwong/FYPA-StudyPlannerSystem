# Study Planner System — Expansion Ideas

> These are concept-level ideas for substantially expanding what the product can do. The goal in each case is to meaningfully close the gap between what advisors and HoDs currently have to do manually and what the system could do for them.

---

## The Core Gap to Keep in Mind

The system currently solves one thing well: **given one student's transcript, tell an advisor which major that student is on and what they are missing.** Every idea here is motivated by the ways that is still not enough for an advisor doing real work:

- They manage dozens or hundreds of students, not just one at a time.
- They need to be proactive, not just reactive (finding at-risk students before it's too late).
- They need to communicate findings — to students, to the registrar, to the HoD.
- They need institutional memory — notes, history, context about individual students.
- Planner templates change every year, and those changes need to be understood and managed.

---

## Idea 1: AI Agent Interface (Conversational Workflow Automation)

**The problem it solves:** The current app has a defined, multi-step workflow: navigate to scraping, scrape a student, go to dashboard, review results, optionally export. An advisor who knows what they want ("check if Ahmad is on track for graduation") still has to manually drive through every step of that workflow.

**The idea:** An AI agent that the advisor talks to in natural language. The agent understands the advisor's intent and autonomously drives the application — scraping the student data, running the match, interpreting the results, and surfacing the answer — without the advisor having to navigate the UI themselves.

Examples of what an advisor could say:
- "Check if Ahmad Bin Abdullah is on track for graduation."
- "Show me which students from the 2021 intake are most at risk."
- "Import the March 2024 planner for BCS AI and tell me what changed from last year."
- "Export a graduation report for all my students who finish this semester."

The agent would use the existing services (scraper, matcher, exporter) as its tools. The conversation would be the interface, and the UI would reflect what the agent has done in real time.

This is a natural fit with the already-embedded Ollama runtime — the LLM is already there. The agent layer sits on top.

---

## Idea 2: Cohort-Level Processing and Departmental View

**The problem it solves:** The app is fundamentally one-student-at-a-time. An academic advisor typically manages an entire cohort — potentially 50 to 200 students. The current workflow requires them to repeat the same process individually for every student, which is not practical at scale.

**The idea:** A mode where an advisor can process an entire cohort in a single operation. They provide a list of student IDs (or a class list export from the university system), and the system runs scraping and matching on all of them in sequence. The output is a departmental dashboard — a grid view where every student is a row, with their detected major, match percentage, missing unit count, graduation eligibility status, and at-risk flags — all visible at once.

This transforms the product from a per-student lookup tool into a departmental management tool. A Head of Department could use this to get a complete picture of their cohort before an advising period, or before a faculty meeting.

This is also where the cloud app could expand beyond planner management: a cloud-side cohort dashboard that aggregates data across multiple advisors' local instances (without ever sending raw student data — only anonymised aggregate metrics), giving HoDs a faculty-wide view.

---

## Idea 3: Persistent Student Database and Longitudinal Tracking

**The problem it solves:** Right now, the app has no memory. Every time an advisor looks up a student, they start from scratch. There is no stored history of what a student's record looked like last semester, no way to track progression over time, and no record of advising decisions made.

**The idea:** Allow the local app to optionally save student records to the local database after a match run. Once saved, the student becomes a tracked entity — the advisor can open their profile at any time without re-scraping, see their match percentage and completion status as it was at each advising session, and compare current status against previous semesters.

This unlocks several things that currently cannot exist:
- An advisor can see that a student's completion rate went from 45% to 62% between last semester and this one — or that it stagnated.
- Notes and advising decisions (see Idea 5) can be attached to a persistent student record.
- The cohort view (Idea 2) can show status as of the last check-in, not requiring a live scrape every time.
- When a student graduates or changes major, that transition is recorded.

Privacy remains intact because all of this stays on the advisor's machine.

---

## Idea 4: Proactive At-Risk Detection and Early Warning System

**The problem it solves:** The current system is reactive — it answers "where is this student right now?" An advisor only catches a problem when they think to look. Students who are quietly drifting off track — accumulating the wrong electives, missing prerequisites, falling behind on their major core — go unnoticed until it is too late to easily correct course.

**The idea:** A proactive monitoring layer that, given the student's current progress and the structure of their planner, projects forward and identifies risk. Concretely:

- **Graduation timeline risk:** Based on the units still required and the student's current semester, can they realistically complete all requirements within their expected graduation window? If a prerequisite chain means they cannot take a required unit until Year 4 Semester 2 but they are graduating in Year 4 Semester 1, that is a guaranteed problem.
- **Major drift:** A student who keeps taking free electives and prescribed electives from a different major's group than expected — flagged before they are locked out of completing their intended major.
- **Credit shortfall:** Students who are registered but not earning credits (incomplete, withdrawn, failed units) projected against the total credit requirement.

The advisor would see an at-risk flag on any student where the system detects that, at current pace with the remaining required units, they cannot graduate on time or complete their major without intervention. This turns the product from a lookup tool into a monitoring tool.

---

## Idea 5: Advisor Notes and Case Management

**The problem it solves:** Advising is not just algorithmic. There are always special cases — a student who received a waiver for a unit, a student on a medical leave arrangement, a student who transferred credits from another institution, a student who is intentionally changing majors. The current system has no way to record any of this. An advisor's institutional knowledge lives in their email inbox and memory.

**The idea:** A lightweight case management layer attached to persistent student records. For each student, an advisor can:
- Write freeform advising notes (timestamped, visible on the student's profile).
- Record overrides with a reason — "waiver granted for CSC3024, approved by HoD on [date]".
- Mark a student as "case closed", "needs follow-up", "pending decision", etc.
- Flag a student for HoD review.

None of this changes the matching algorithm. It sits alongside it as institutional context that the algorithm cannot know. The combination — algorithmic match result + advisor notes + manual overrides — gives a complete picture of a student's situation.

If the cloud app is expanded, these notes (and only notes, not raw academic data) could optionally sync to a shared cloud layer, so that if a student changes advisor, the new advisor inherits the case history.

---

## Idea 6: Prerequisite Path Planner

**The problem it solves:** When the matching algorithm identifies missing units, it tells the advisor *what* is missing but not *when* the student can realistically take it. A student might be missing a Year 3 unit, but that unit has a prerequisite they haven't taken either, which itself has a prerequisite — meaning completing it actually requires two additional semesters, not one. This chain is invisible in the current output.

**The idea:** For each student with missing requirements, generate a dependency-aware completion path. Given the student's current completed units, the prerequisite graph, and the semester availability of each unit (offered_in: 1, 2, or both), the system computes: "To complete your remaining requirements, the earliest possible graduation semester is X, and here is the semester-by-semester plan to get there."

This is genuinely actionable advice that an advisor can hand directly to a student in a meeting. It also surfaces cases where graduation within the expected window is impossible given the prerequisite structure — which is critical information for both the advisor and the student.

---

## Idea 7: Planner Template Diff and Change Tracking (Cloud App)

**The problem it solves:** Study planners are updated every year when there is a new intake. When a new planner is imported, nobody currently knows what changed from the previous year — which units were added, removed, recategorised, or moved to a different semester. This matters because students from an older intake might be affected by changes, and advisors need to know if a student's planner is now outdated.

**The idea:** When a new planner template is imported into the cloud app (or synced to the local app), automatically diff it against the previous version for the same course and major. The output is a human-readable change summary:

- "Unit CSC3024 moved from Year 3 Sem 1 to Year 3 Sem 2."
- "Unit CSC4019 added as major core (was not in 2023 intake planner)."
- "Prescribed elective group B reduced from 3 slots to 2."
- "Unit MPU3193 removed from core."

For the cloud admin, this means every planner import produces a changelog that can be reviewed before the planner is published for local apps to sync. For advisors, it means they can understand immediately why a student's match percentage changed after a planner update.

---

## Idea 8: Formal Graduation Audit Report for Registrar

**The problem it solves:** When a student is eligible to graduate, the advisor or HoD typically needs to produce or sign off on a formal graduation audit — a document confirming that the student has met all academic requirements. Currently, the Excel export is a general-purpose tool; it is not structured for submission to a registrar or administrative office.

**The idea:** A dedicated "Graduation Audit" output mode that generates a structured, formal document (PDF) that matches what the registrar actually expects. This would include:

- Student details, programme, major, intake year.
- Complete credit summary (earned vs. required per category).
- Confirmation that all core and major core requirements are met.
- List of waived or overridden units with advisor notes and dates.
- A signature/approval section for the advisor.
- A unique audit reference number for traceability.

This closes the loop between what the system detects and what the institution actually needs as a formal artefact. It also means the advisor does not need to transfer data from the Excel export into a separate form — the system produces the submission-ready document directly.

