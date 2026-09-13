import { NextRequest, NextResponse } from 'next/server'
import { getPlannerById } from '@student/lib/planners'
import { resolvePlannerId } from '@student/lib/data/courses-mock'
import type { GenerationInput } from '@student/lib/plan-builder'

export async function POST(req: NextRequest) {
  const input: GenerationInput = await req.json()

  const plannerId = resolvePlannerId(input.config.courseId, input.config.majorId)
  const planner = await getPlannerById(plannerId)

  if (!planner) return NextResponse.json(null)

  const completedCodes = input.completedUnitCodes.map(c => c.toUpperCase())

  return NextResponse.json({
    semesters: planner.semesters,
    completedCodes,
    electivePool: planner.electivePool,
  })
}
