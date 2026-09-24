import { NextRequest, NextResponse } from 'next/server'
import { getPlannerById } from '@student/lib/planners'
import type { GenerationInput } from '@student/lib/plan-builder'
import { GeneratePlanSchema } from '@student/lib/cms/schemas'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = GeneratePlanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const input = parsed.data as GenerationInput

  const planner = await getPlannerById(input.config.plannerId)
  if (!planner) return NextResponse.json(null)

  const completedCodes = input.completedUnitCodes.map(c => c.toUpperCase())

  return NextResponse.json({
    semesters: planner.semesters,
    completedCodes,
    electivePool: planner.electivePool,
  })
}
