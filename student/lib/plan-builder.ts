// ---------------------------------------------------------------------------
// Plan Builder — Algorithm Integration Layer
// ---------------------------------------------------------------------------

import type { SemesterBlock, Unit } from './types'

export interface PlanBuilderConfig {
  plannerId: string
  intakeYear: number
  intakeMonth: number
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

export async function generatePlan(input: GenerationInput): Promise<GenerationResult | null> {
  const res = await fetch('/api/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!data) return null
  return {
    semesters: data.semesters,
    completedCodes: new Set<string>(data.completedCodes),
    electivePool: data.electivePool,
  }
}
