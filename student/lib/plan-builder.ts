// ---------------------------------------------------------------------------
// Plan Builder — Algorithm Integration Layer
//
// To connect the real algorithm/API:
//   1. Keep the `PlanBuilderConfig`, `GenerationInput`, and `GenerationResult`
//      types stable — the frontend depends on them.
//   2. Replace the body of `generatePlan` with an API call, e.g.:
//        const res = await fetch('/api/generate-plan', {
//          method: 'POST',
//          body: JSON.stringify(input),
//        })
//        return res.json()
//   3. The mock implementation below can be deleted once the real one is ready.
// ---------------------------------------------------------------------------

import type { SemesterBlock, Unit } from './types'
import { getPlannerById } from './planners'
import { resolvePlannerId } from './data/courses-mock'

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

// ---------------------------------------------------------------------------
// PUBLIC SEAM — swap this body when the real algorithm is ready
// ---------------------------------------------------------------------------
export async function generatePlan(input: GenerationInput): Promise<GenerationResult | null> {
  return mockGeneratePlan(input)
}

// ---------------------------------------------------------------------------
// MOCK IMPLEMENTATION
// Loads the matching planner template and marks the completed units.
// The semester structure itself is unchanged — the algorithm would normally
// reorder or reassign units based on prerequisites and preferences.
// ---------------------------------------------------------------------------
async function mockGeneratePlan({
  config,
  completedUnitCodes,
}: GenerationInput): Promise<GenerationResult | null> {
  const plannerId = resolvePlannerId(config.courseId, config.majorId)
  const planner = await getPlannerById(plannerId)
  if (!planner) return null

  const completedCodes = new Set(completedUnitCodes.map(c => c.toUpperCase()))

  return {
    semesters: planner.semesters,
    completedCodes,
    electivePool: planner.electivePool,
  }
}
