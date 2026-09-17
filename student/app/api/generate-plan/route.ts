import { NextRequest, NextResponse } from 'next/server'
import { getPlannerById } from '@student/lib/planners'
import type { GenerationInput } from '@student/lib/plan-builder'

export async function POST(req: NextRequest) {
  const input: GenerationInput = await req.json()

  const planner = await getPlannerById(input.config.plannerId)
  if (!planner) return NextResponse.json(null)

  const completedCodes = input.completedUnitCodes.map(c => c.toUpperCase())

  return NextResponse.json({
    semesters: planner.semesters,
    completedCodes,
    electivePool: planner.electivePool,
  })
}
