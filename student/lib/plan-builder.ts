// ---------------------------------------------------------------------------
// Plan Builder — client-safe seam
//
// Types are shared with the UI. `generatePlan` calls the server so Prisma/`pg`
// is never bundled into the browser (those packages need Node's `dns`/`net`).
// ---------------------------------------------------------------------------

import type { SemesterBlock, Unit } from './types'

export interface PlanBuilderConfig {
  plannerId: string
  intakeYear: number
  intakeMonth: number
}

export interface CompletedSemesterInput {
  unitCodes: string[]
}

export interface GenerationInput {
  config: PlanBuilderConfig
  /**
   * Semesters the student has already finished, in order.
   * Unit codes are read from these groups. Two filled entries means year 1 is
   * done and the plan starts at year 2, semester 1.
   */
  completedSemesters: CompletedSemesterInput[]
}

export interface GenerationResult {
  semesters: SemesterBlock[]
  completedCodes: Set<string>
  electivePool: Unit[]
}

type GenerationResultJson = Omit<GenerationResult, 'completedCodes'> & {
  completedCodes: string[]
}

export async function generatePlan(input: GenerationInput): Promise<GenerationResult | null> {
  const res = await fetch('/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to generate plan')

  const data = (await res.json()) as GenerationResultJson
  return {
    semesters: data.semesters,
    electivePool: data.electivePool,
    completedCodes: new Set(data.completedCodes),
  }
}
