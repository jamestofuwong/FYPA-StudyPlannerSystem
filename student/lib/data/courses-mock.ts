export interface CourseMajor {
  id: string
  name: string
}

export interface CourseOption {
  id: string
  name: string
  majors: CourseMajor[]
}

/**
 * Derives the planner template ID from a course + major selection.
 * When the real database is connected, replace this with a lookup against
 * the planner_templates table filtered by course and major.
 */
export function resolvePlannerId(courseId: string, majorId: string): string {
  // Mock templates follow the pattern: {courseId}-{majorId}-2024-1
  return `${courseId}-${majorId}-2024-1`
}

export const COURSE_OPTIONS: CourseOption[] = [
  {
    id: 'bcs',
    name: 'Bachelor of Computer Science',
    majors: [
      { id: 'ai', name: 'Artificial Intelligence' },
      { id: 'cy', name: 'Cybersecurity' },
      { id: 'sd', name: 'Software Development' },
    ],
  },
  {
    id: 'bbus',
    name: 'Bachelor of Business',
    majors: [
      { id: 'ba', name: 'Business Analytics' },
      { id: 'fi', name: 'Finance' },
    ],
  },
  {
    id: 'beng',
    name: 'Bachelor of Engineering (Honours)',
    majors: [
      { id: 'ce', name: 'Civil Engineering' },
    ],
  },
]
