import { NextResponse } from 'next/server'
import type { GenerationInput } from '@student/lib/plan-builder'
import { generatePlanOnServer } from '@student/lib/generate-plan'

export async function POST(req: Request) {
  const input = (await req.json()) as GenerationInput
  const result = await generatePlanOnServer(input)
  if (!result) {
    return NextResponse.json({ error: 'No plan template found' }, { status: 404 })
  }

  return NextResponse.json({
    semesters: result.semesters,
    electivePool: result.electivePool,
    completedCodes: [...result.completedCodes],
  })
}
