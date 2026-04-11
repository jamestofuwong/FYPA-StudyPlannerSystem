import type { ScrapedStudent } from "../shared/types/student";

export function calculateProgress(student: ScrapedStudent): number {
  if (!student.creditsRequired || student.creditsRequired === 0) {
    return 0;
  }
  return (student.creditsCompleted / student.creditsRequired) * 100;
}