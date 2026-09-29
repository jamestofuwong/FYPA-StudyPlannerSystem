import { z } from 'zod'

const UUID = z.string().uuid('Invalid ID format')

// ─── Planner ──────────────────────────────────────────────────────────────────

export const PlannerSchema = z.object({
  id: UUID.optional(),
  course_name: z.string().trim().min(1, 'Course name is required').max(255),
  course_code: z.string().trim().max(50).nullable().optional(),
  major_name: z.string().trim().max(255).nullable().optional(),
  intake_month: z.number().int().min(1, 'Intake month must be 1–12').max(12, 'Intake month must be 1–12'),
  intake_year: z.number().int().min(2000, 'Intake year must be 2000 or later').max(2100, 'Intake year must be 2100 or earlier'),
  duration_years: z.number().int().min(1, 'Duration must be at least 1 year').max(6, 'Duration must be at most 6 years'),
  semesters: z.array(
    z.object({
      year_number: z.number().int().min(1).max(6),
      sem_number: z.number().int().min(1).max(4),
      label: z.string().trim().max(100),
      units: z.array(
        z.object({
          unit_id: UUID.nullable(),
          category: z.enum(['core', 'major_core', 'prescribed_elective', 'elective', 'wil', 'mpu']),
          is_elective_slot: z.boolean(),
          position: z.number().int().min(0),
        })
      ),
    })
  ),
  elective_pool: z.array(UUID),
})

// ─── Unit ─────────────────────────────────────────────────────────────────────

export const UnitSchema = z.object({
  id: UUID.optional(),
  code: z
    .string()
    .trim()
    .min(1, 'Unit code is required')
    .max(20)
    .regex(/^[A-Z]{2,4}\d{4,5}$/, 'Unit code must be uppercase letters followed by digits (e.g. ICT30120)'),
  name: z.string().trim().min(1, 'Unit name is required').max(255),
  credit_points: z.number().min(0.5, 'Credit points must be at least 0.5').max(200),
  year_level: z.number().int().min(1, 'Year level must be 1–4').max(4, 'Year level must be 1–4'),
  overview: z.string().trim().max(20000).optional().default(''),
  availability: z.array(z.number().int().min(1).max(12)),
  learning_outcomes: z.array(
    z.object({
      ulo_number: z.number().int().min(1),
      description: z.string().trim().min(1, 'ULO description is required').max(2000),
    })
  ),
  content_topics: z.array(
    z.object({
      position: z.number().int().min(1),
      topic: z.string().trim().min(1, 'Topic is required').max(500),
    })
  ),
  assessments: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Assessment title is required').max(255),
        type: z.string().trim().min(1, 'Assessment type is required').max(100),
        weight: z.number().int().min(0, 'Weight must be 0–100').max(100, 'Weight must be 0–100'),
        ulos: z.array(z.number().int().min(1)),
        position: z.number().int().min(1),
      })
    )
    .refine(
      (items) => {
        if (items.length === 0) return true
        return items.reduce((sum, a) => sum + a.weight, 0) === 100
      },
      { message: 'Assessment weights must sum to 100%' }
    ),
  requisites: z.array(
    z.object({
      requisite_type: z.enum(['prerequisite', 'corequisite', 'antirequisite']),
      requisite_unit_id: UUID,
    })
  ),
})

// ─── FAQ ──────────────────────────────────────────────────────────────────────

export const FaqItemSchema = z.object({
  id: UUID.optional(),
  question: z.string().trim().min(1, 'Question is required').max(2000),
  answer: z.string().trim().min(1, 'Answer is required').max(10000),
  position: z.number().int().min(1),
})

export const FaqListSchema = z.array(FaqItemSchema).min(1, 'At least one FAQ item is required')

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const GeneralEnquiriesSchema = z.object({
  venue_name: z.string().trim().min(1, 'Venue name is required').max(255),
  location: z.string().trim().min(1, 'Location is required').max(255),
  hours: z.string().trim().min(1, 'Hours are required').max(255),
  closed_note: z.string().trim().max(255).optional().nullable(),
})

export const ItHelpDeskSchema = z.object({
  telephone: z.string().trim().min(1, 'Telephone is required').max(50),
  email: z.string().trim().email('Invalid email address').max(255),
  location: z.string().trim().min(1, 'Location is required').max(100),
  hours_mon_thu: z.string().trim().min(1, 'Hours (Mon–Thu) are required').max(255),
  hours_fri: z.string().trim().min(1, 'Hours (Fri) are required').max(255),
  closed_note: z.string().trim().max(255).optional().nullable(),
})

// ─── Heads of Department ──────────────────────────────────────────────────────

export const HodSchema = z.object({
  id: UUID.optional(),
  faculty: z.string().trim().min(1, 'Faculty is required').max(255),
  department: z.string().trim().min(1, 'Department is required').max(255),
  name: z.string().trim().min(1, 'Name is required').max(255),
  email: z.string().trim().email('Invalid email address').max(255),
  position: z.number().int().min(1),
})

export const HodListSchema = z.array(HodSchema)

// ─── Login ────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128, 'Password too long'),
})

// ─── Generate Plan ────────────────────────────────────────────────────────────

export const GeneratePlanSchema = z.object({
  config: z.object({
    plannerId: UUID,
  }),
  completedUnitCodes: z.array(z.string().trim().min(1)),
})
