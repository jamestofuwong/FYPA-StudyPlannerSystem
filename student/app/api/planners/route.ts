import { NextResponse } from 'next/server'
import { getPlanners } from '@student/lib/planners'

export async function GET() {
  try {
    const planners = await getPlanners()
    return NextResponse.json(planners)
  } catch (err) {
    console.error('[API] GET /api/planners failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
