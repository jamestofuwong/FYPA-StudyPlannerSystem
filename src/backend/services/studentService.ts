import { ScrapedStudent } from "../models/student";

export function getMockStudent(): ScrapedStudent {
  return {
    course: "Bachelor of Computer Science",
    status: "Active",
    cgpa: 3.5,
    creditsRequired: 300,
    creditsCompleted: 37.5,
    gradeLevel: "Undergraduate",
    enrollmentDate: "2024-02-26T00:00:00.000Z",
    graduationDate: null,
    scheduledCredits: 37.5,
    courseList: [
      {
        courseId: "COS10009",
        courseTitle: "Introduction to Programming",
        credits: 12.5,
        creditsEarned: 12.5,
        status: "Complete",
        grade: "HD",
        term: "2024_FEB"
      },
      {
        courseId: "COS10025",
        courseTitle: "Technology in an Indigenous Context",
        credits: 12.5,
        creditsEarned: 12.5,
        status: "Complete",
        grade: "HD",
        term: "2024_FEB"
      },
      {
        courseId: "COS10022",
        courseTitle: "Data Science Principles",
        credits: 12.5,
        creditsEarned: 0,
        status: "Future",
        grade: "",
        term: "2024_SEP"
      }
    ]
  };
}