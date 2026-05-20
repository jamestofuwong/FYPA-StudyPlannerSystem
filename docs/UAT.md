# User Acceptance Testing (UAT) — Study Planner System

---

## 1. UAT Scope

### 1.1 In Scope

| Module | Features Covered |
|---|---|
| Privacy & Consent | Notice presentation, acknowledgement, withdrawal |
| Data Scraping | Portal login, automated data fetch |
| Data Import | PDF import, manual import |
| Major Matching | Automatic major detection from academic record |
| Study Plan | Plan viewing, semester layout |
| Export | PDF/Excel report generation |
| Cloud Sync | Sync status, planner upload to cloud |
| Settings | Privacy withdrawal, app preferences |
| Cloud Portal (Admin) | Planner list, approval workflow, export |

### 1.2 Out of Scope

- Internal database schema and Prisma migrations
- CI/CD pipeline behaviour
- Docker infrastructure
- Performance benchmarking (covered by automated tests)

### 1.3 Pass Criteria

- ≥ 90% of test cases pass
- Zero critical failures (data loss, crash on core workflow, privacy gate bypass)
- All REQ-PRI-* requirements verified as passing

### 1.4 Test Environment

| Item | Detail |
|---|---|
| Application | Installed production build (v1.0.0) |
| OS | macOS or Windows (tester's own machine) |
| Cloud Portal | https://fyp.jameswong.work |
| Database | Fresh install — no prior data |
| Tester | End user (student), not the developer |

---

## 2. Test Cases

### Module 1: Privacy & Consent

---

**TC-PRI-001: Privacy notice appears on first launch**

| Field | Detail |
|---|---|
| Requirement | REQ-PRI-102 |
| Precondition | App installed and launched for the first time |
| Steps | 1. Launch the app |
| Expected Result | Privacy notice modal appears before any content is accessible |
| Pass / Fail | |
| Tester Notes | |

---

**TC-PRI-002: Privacy notice is bilingual**

| Field | Detail |
|---|---|
| Requirement | REQ-PRI-103 |
| Precondition | Privacy notice modal is displayed |
| Steps | 1. Read the default language (English) <br> 2. Click the language toggle button <br> 3. Observe the notice content |
| Expected Result | Notice switches to Bahasa Malaysia and all content is translated |
| Pass / Fail | |
| Tester Notes | |

---

**TC-PRI-003: Notice content covers required information**

| Field | Detail |
|---|---|
| Requirement | REQ-PRI-103(a)(b)(c)(d) |
| Precondition | Privacy notice modal is displayed |
| Steps | 1. Read the notice in full <br> 2. Verify the following are present: purpose of data collection, types of data collected, user rights (access, correction, withdrawal), and DPO contact details |
| Expected Result | All four items are clearly stated in the notice |
| Pass / Fail | |
| Tester Notes | |

---

**TC-PRI-004: Scroll-to-bottom gate enforced before acknowledgement**

| Field | Detail |
|---|---|
| Requirement | REQ-PRI-102 |
| Precondition | Privacy notice modal is displayed |
| Steps | 1. Without scrolling, attempt to click the Acknowledge button |
| Expected Result | Acknowledge button is disabled until the user has scrolled to the bottom of the notice |
| Pass / Fail | |
| Tester Notes | |

---

**TC-PRI-005: Acknowledgement is recorded**

| Field | Detail |
|---|---|
| Requirement | REQ-PRI-104, REQ-PRI-105 |
| Precondition | Privacy notice modal is displayed |
| Steps | 1. Scroll to the bottom of the notice <br> 2. Click Acknowledge <br> 3. Close and relaunch the app |
| Expected Result | Privacy notice does not appear again on relaunch |
| Pass / Fail | |
| Tester Notes | |

---

**TC-PRI-006: Import is blocked without consent**

| Field | Detail |
|---|---|
| Requirement | REQ-PRI-101 |
| Precondition | Privacy acknowledgement has been withdrawn (via Settings) |
| Steps | 1. Navigate to Data Import <br> 2. Attempt to import a planner file |
| Expected Result | Import is blocked with a message indicating consent is required |
| Pass / Fail | |
| Tester Notes | |

---

**TC-PRI-007: Consent can be withdrawn from Settings**

| Field | Detail |
|---|---|
| Requirement | REQ-PRI-106 |
| Precondition | User has previously acknowledged the privacy notice |
| Steps | 1. Navigate to Settings <br> 2. Locate the Privacy section <br> 3. Click Withdraw Consent <br> 4. Confirm the action |
| Expected Result | Consent is withdrawn; user is informed of what this means |
| Pass / Fail | |
| Tester Notes | |

---

### Module 2: Data Scraping

---

**TC-SCR-001: Portal login and data scraping**

| Field | Detail |
|---|---|
| Precondition | Privacy notice acknowledged; valid Swinburne portal credentials available |
| Steps | 1. Navigate to Data Scraping <br> 2. Enter portal credentials <br> 3. Click Start Scraping <br> 4. Wait for completion |
| Expected Result | Student academic record is fetched and displayed without errors |
| Pass / Fail | |
| Tester Notes | |

---

**TC-SCR-002: Scraping progress is communicated**

| Field | Detail |
|---|---|
| Precondition | Scraping is in progress |
| Steps | 1. Observe the scraping screen during the process |
| Expected Result | Step-by-step progress is shown; user knows the app is working |
| Pass / Fail | |
| Tester Notes | |

---

**TC-SCR-003: Invalid credentials are handled gracefully**

| Field | Detail |
|---|---|
| Precondition | None |
| Steps | 1. Navigate to Data Scraping <br> 2. Enter incorrect credentials <br> 3. Click Start Scraping |
| Expected Result | An error message is displayed; the app does not crash |
| Pass / Fail | |
| Tester Notes | |

---

### Module 3: Data Import

---

**TC-IMP-001: PDF import**

| Field | Detail |
|---|---|
| Precondition | Privacy notice acknowledged; a valid planner PDF is available |
| Steps | 1. Navigate to Data Import <br> 2. Select PDF import option <br> 3. Upload the planner PDF <br> 4. Wait for processing |
| Expected Result | Planner data is extracted from the PDF and shown for review |
| Pass / Fail | |
| Tester Notes | |

---

**TC-IMP-002: Imported data can be reviewed before saving**

| Field | Detail |
|---|---|
| Precondition | PDF import has completed |
| Steps | 1. Review the extracted planner data on screen |
| Expected Result | Units, semesters, and credits are displayed correctly before the user confirms |
| Pass / Fail | |
| Tester Notes | |

---

### Module 4: Major Matching

---

**TC-MAT-001: Major is automatically detected**

| Field | Detail |
|---|---|
| Precondition | Student academic data has been scraped or imported |
| Steps | 1. Navigate to the Dashboard |
| Expected Result | The system suggests the most likely major based on the student's completed units |
| Pass / Fail | |
| Tester Notes | |

---

**TC-MAT-002: Match confidence is displayed**

| Field | Detail |
|---|---|
| Precondition | Major matching has run |
| Steps | 1. Observe the matching results on the Dashboard |
| Expected Result | Each matched major shows a confidence percentage or score |
| Pass / Fail | |
| Tester Notes | |

---

**TC-MAT-003: Alternative majors are shown**

| Field | Detail |
|---|---|
| Precondition | Major matching has run |
| Steps | 1. Observe the matching results on the Dashboard |
| Expected Result | Multiple possible majors are listed, not just the top match |
| Pass / Fail | |
| Tester Notes | |

---

### Module 5: Study Plan

---

**TC-PLN-001: Study plan is generated and viewable**

| Field | Detail |
|---|---|
| Precondition | Academic data is available and major has been matched |
| Steps | 1. Navigate to Study Planners <br> 2. Select a planner |
| Expected Result | A semester-by-semester study plan is displayed with units assigned to each semester |
| Pass / Fail | |
| Tester Notes | |

---

**TC-PLN-002: Completed units are visually distinguished**

| Field | Detail |
|---|---|
| Precondition | Study plan is displayed |
| Steps | 1. Review the plan layout |
| Expected Result | Completed, in-progress, and future units are visually distinguishable |
| Pass / Fail | |
| Tester Notes | |

---

### Module 6: Export

---

**TC-EXP-001: Report can be exported**

| Field | Detail |
|---|---|
| Precondition | Study plan is available |
| Steps | 1. Open the export option <br> 2. Select sections to include <br> 3. Click Export |
| Expected Result | A file is downloaded to the user's machine |
| Pass / Fail | |
| Tester Notes | |

---

**TC-EXP-002: Export section selection works**

| Field | Detail |
|---|---|
| Precondition | Export modal is open |
| Steps | 1. Deselect one or more sections <br> 2. Click Export |
| Expected Result | The exported file only contains the selected sections |
| Pass / Fail | |
| Tester Notes | |

---

### Module 7: Cloud Sync

---

**TC-SYN-001: Cloud sync status is visible**

| Field | Detail |
|---|---|
| Precondition | App is running |
| Steps | 1. Navigate to Cloud Sync |
| Expected Result | The sync status (last synced time, connection status) is displayed |
| Pass / Fail | |
| Tester Notes | |

---

**TC-SYN-002: Planner is accessible on the cloud portal after sync**

| Field | Detail |
|---|---|
| Precondition | A planner has been synced to the cloud |
| Steps | 1. Open the cloud portal at https://fyp.jameswong.work <br> 2. Log in <br> 3. Navigate to Planners |
| Expected Result | The synced planner appears in the portal |
| Pass / Fail | |
| Tester Notes | |

---

### Module 8: Settings

---

**TC-SET-001: Settings page is accessible**

| Field | Detail |
|---|---|
| Precondition | App is running |
| Steps | 1. Click Settings in the navigation |
| Expected Result | Settings page loads without errors |
| Pass / Fail | |
| Tester Notes | |

---

### Module 9: Cloud Portal (Admin)

---

**TC-CLD-001: Planner list loads on the portal**

| Field | Detail |
|---|---|
| Precondition | Logged into the cloud portal |
| Steps | 1. Navigate to Planners |
| Expected Result | A list of planners is shown with status indicators |
| Pass / Fail | |
| Tester Notes | |

---

**TC-CLD-002: Planner can be approved**

| Field | Detail |
|---|---|
| Precondition | A planner with draft status is visible |
| Steps | 1. Click on a draft planner <br> 2. Click Approve |
| Expected Result | Planner status changes to Active |
| Pass / Fail | |
| Tester Notes | |

---

**TC-CLD-003: Planner can be archived**

| Field | Detail |
|---|---|
| Precondition | An active planner is visible |
| Steps | 1. Click on an active planner <br> 2. Click Archive |
| Expected Result | Planner status changes to Archived and is no longer visible to the local app |
| Pass / Fail | |
| Tester Notes | |

---

**TC-CLD-004: Planner can be exported from the portal**

| Field | Detail |
|---|---|
| Precondition | An active planner is visible |
| Steps | 1. Click on an active planner <br> 2. Click Export |
| Expected Result | A file is downloaded |
| Pass / Fail | |
| Tester Notes | |

---

**TC-CLD-005: Draft or archived planners cannot be exported**

| Field | Detail |
|---|---|
| Precondition | A draft or archived planner is visible |
| Steps | 1. Click on the planner <br> 2. Attempt to export |
| Expected Result | Export is blocked with an appropriate message |
| Pass / Fail | |
| Tester Notes | |

---

## 3. Defect Log

| ID | Test Case | Description | Severity | Status |
|---|---|---|---|---|
| | | | | |

**Severity levels:** Critical / High / Medium / Low

---

## 4. UAT Summary

| Metric | Value |
|---|---|
| Total Test Cases | 27 |
| Passed | |
| Failed | |
| Blocked | |
| Pass Rate | |

---

## 5. Sign-off

By signing below, the tester confirms that the above test cases were executed and the results recorded accurately.

| Field | Detail |
|---|---|
| Tester Name | |
| Date | |
| Signature | |
| Outcome | ☐ Accepted &nbsp;&nbsp; ☐ Accepted with conditions &nbsp;&nbsp; ☐ Not accepted |
| Conditions / Comments | |
