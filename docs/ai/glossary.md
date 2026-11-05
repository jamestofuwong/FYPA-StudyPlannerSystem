# Glossary

| Word | Meaning |
|---|---|
| Planner | The official study planner of one major and one intake: which units go in which semester. Code name: `PlannerTemplate`. |
| Pathway | A plan for the semesters that a student has left. The scheduler builds it from a planner. |
| Unit | One subject. It has a code such as COS10009 (2 to 4 letters, then 4 or 5 digits). |
| Prefix | The letters of a unit code (COS, SWE, MPU). |
| Conceded Pass (CP grade) | A pass that earns credit but cannot satisfy a prerequisite. A student can graduate with at most one. |
| MPU | General-studies units. Two units of a pair apply by nationality, which the portal data does not carry, so graduation ignores them. |
| WIL | Work-integrated learning: the work placement unit. |
| Intake | The year and month that a student starts. Semester 1 is the February or March intake. Semester 2 is the August or September intake. |
| Calendar term | 1 (Feb or Mar), 2 (Aug or Sep), 3 and 4 (the breaks). A semester number inside a planner is 1 or 2. Convert with `calendarTermFor`. |
| Panel | One page of the desktop UI. It has an id, a route, a tab and a sidebar item. |
| Easy, Classic | The two UI designs. In the code, Easy is named "meadow" (`data-design="meadow"`, `meadow.css`). The name stays for saved settings. |
| Workflow | One capability of the AI Copilot: a function with an id, a description and parameters. |
| Routing | Choosing the workflow for a message. Keyword filter first, then one model call. |
| DPA | Degree progress audit: a transcript that the portal exports. |
| Portal | The university student system (CampusNexus). The desktop app reads it with Puppeteer and REST calls. |
| HoD | Head of Department. Uses class estimation. |
| CMS | The editing pages of the student app (`/cms/*`), with their own JWT login. |
| Superadmin, admin | The two CMS roles. A superadmin can edit every section and manages accounts. An admin has one level for each section: none, view or edit (`student/lib/cms/permissions.ts`). |
| Singleton on `globalThis` | One shared object that survives Next.js hot reload (the Prisma client, the portal session, the estimation store). |
