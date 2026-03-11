export type ISODateString = string;

export type ScrapedCourseTerm = string;

export type ScrapedCourseStatus = string;

export type ScrapedCourseGrade = string;

export type ScrapedCourseId = string;

export type ScrapedStudentCourse = string;

export type ScrapedStudentStatus = string;

export type ScrapedStudentGradeLevel = string;

export type CreditCount = number;

export type Cgpa = number;

export type ScrapedCourseListItem = {
  courseId: ScrapedCourseId;
  courseTitle: string;
  credits: CreditCount;
  creditsEarned: CreditCount;
  status: ScrapedCourseStatus;
  grade: ScrapedCourseGrade;
  term: ScrapedCourseTerm;
};

export type ScrapedStudent = {
  course: ScrapedStudentCourse;
  status: ScrapedStudentStatus;
  cgpa: Cgpa;
  creditsRequired: CreditCount;
  creditsCompleted: CreditCount;
  gradeLevel: ScrapedStudentGradeLevel;
  enrollmentDate: ISODateString;
  graduationDate: ISODateString | null;
  scheduledCredits: CreditCount;
  courseList: ScrapedCourseListItem[];
};
