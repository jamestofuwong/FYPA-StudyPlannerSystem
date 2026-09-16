import 'server-only'
import type { GenerationInput, GenerationResult } from './plan-builder'
import { getPlannerById } from './planners'
import { resolvePlannerId } from './data/courses-mock'

export async function generatePlanOnServer({
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
