export type ScraperPhase =
  | "idle"
  | "browser"
  | "login"
  | "ready"
  | "scraping"
  | "done"
  | "error";

export type ScraperStepId =
  | "go-degree"
  | "open-degree-iframe"
  | "click-student-dropdown"
  | "wait-for-kendo-list"
  | "open-student-dropdown"
  | "enter-student-id"
  | "click-dropdown"
  | "select-dropdown"
  | "scrape-program-data";

export type ScraperStep = {
  id: ScraperStepId;
  label: string;
};

export const SCRAPER_STEPS: ScraperStep[] = [
  { id: "go-degree",              label: "Go to Degree1.aspx" },
  { id: "open-degree-iframe",     label: "Open iframe src" },
  { id: "click-student-dropdown", label: "Click student dropdown" },
  { id: "wait-for-kendo-list",    label: "Wait for student list" },
  { id: "open-student-dropdown",  label: "Open student dropdown" },
  { id: "enter-student-id",       label: "Enter student ID" },
  { id: "click-dropdown",         label: "Click enrollment dropdown" },
  { id: "select-dropdown",        label: "Select enrollment option" },
  { id: "scrape-program-data",    label: "Scrape program data" },
];

export type ScrapedProgramData = {
  program: string | null;
  campus: string | null;
  status: string | null;
  areasOfStudies: string | null;
  enrollmentCumGPA: string | null;
  enrollDate: string | null;
  creditsRequiredFromEnrolment: string | null;
  expGradDate: string | null;
  creditsCompletedFromEnrolment: string | null;
  creditsCurrentScheduled: string | null;
  gradeLevel: string | null;
};

export type ScrapedCourseRow = {
  courseId: string;
  courseTitle: string;
  level: string;
  credits: string;
  earned: string;
  status: string;
  grade: string;
  term: string;
};

export type ScrapeResult =
  | { scraped: false; error?: string }
  | {
      scraped: true;
      studentName?: string;
      data: ScrapedProgramData;
      rawGrid?: string[][];
      rowCount?: number;
      gridRows?: ScrapedCourseRow[];
      gridRowCount?: number;
      enrollmentOptions?: { text: string }[];
      selectedEnrollment?: string;
    };
