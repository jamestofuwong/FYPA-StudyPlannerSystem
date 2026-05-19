import type { ScrapedStudent } from "../shared/types/student";

export function getMockStudent(): ScrapedStudent {
  return {
    studentId: "103456789",
    studentName: "James Teck Hock WONG",
    course: "Bachelor of Computer Science",
    status: "Active",
    cgpa: 3.5,
    creditsRequired: 300,
    creditsCompleted: 37.5,
    gradeLevel: "Year 3 / Sem 5",
    enrollmentDate: "26/01/2024",
    graduationDate: "22/01/2027",
    scheduledCredits: 37.5,
    courseList: [
      {
        courseId: "COS10009",
        courseTitle: "Introduction to Programming",
        credits: 12.5,
        creditsEarned: 12.5,
        status: "Complete",
        grade: "HD",
        level: "1",
        term: "2024_FEB_S1"
      },
      {
        courseId: "COS10025",
        courseTitle: "Technology in an Indigenous Context",
        credits: 12.5,
        creditsEarned: 12.5,
        status: "Complete",
        grade: "HD",
        level: "1",
        term: "2024_FEB_S1"
      },
      {
        courseId: "COS10022",
        courseTitle: "Data Science Principles",
        credits: 12.5,
        creditsEarned: 0,
        status: "Future",
        grade: "",
        level: "1",
        term: "2024_SEP_S2"
      }
    ]
  };
}
