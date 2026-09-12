import { NextResponse } from 'next/server'
import { getPlanners } from '@student/lib/planners'

export async function GET() {
  const planners = await getPlanners()
  return NextResponse.json(planners)
}
