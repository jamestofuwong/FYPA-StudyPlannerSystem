// ---------------------------------------------------------------------------
// Plan Builder — client-safe seam
//
// Types are shared with the UI. `generatePlan` calls the server so Prisma/`pg`
// is never bundled into the browser (those packages need Node's `dns`/`net`).
// ---------------------------------------------------------------------------

import type { SemesterBlock, Unit } from './types'

export interface PlanBuilderConfig {
  /** e.g. "march-2024" or "august-2025" */
  intake: string
  courseId: string
  majorId: string
  secondMajorId: string | null
}

export interface GenerationInput {
  config: PlanBuilderConfig
  completedUnitCodes: string[]
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
