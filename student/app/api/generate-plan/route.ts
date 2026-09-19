import { NextResponse } from 'next/server'
import type { GenerationInput } from '@student/lib/plan-builder'
import { generatePlanOnServer } from '@student/lib/generate-plan'

export async function POST(req: Request) {
  const input = (await req.json()) as GenerationInput

  const config = input?.config
  if (!config?.plannerId || typeof config.plannerId !== 'string') {
    return NextResponse.json({ error: 'config.plannerId is required' }, { status: 400 })
  }
  if (!Array.isArray(input?.completedUnitCodes)) {
    return NextResponse.json({ error: 'completedUnitCodes must be an array of unit codes' }, { status: 400 })
  }
  if (
    !Number.isInteger(config.intakeMonth) ||
    config.intakeMonth < 1 ||
    config.intakeMonth > 12
  ) {
    return NextResponse.json({ error: 'config.intakeMonth must be a month from 1 to 12' }, { status: 400 })
  }

  const result = await generatePlanOnServer(input)
  // generatePlan treats 404 as "no plan for this course", so keep that status
  if (!result) {
    return NextResponse.json({ error: 'No plan template found' }, { status: 404 })
  }

  return NextResponse.json({
    semesters: result.semesters,
    electivePool: result.electivePool,
    completedCodes: [...result.completedCodes],
  })
}
