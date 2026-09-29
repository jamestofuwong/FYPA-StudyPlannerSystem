import { NextResponse } from 'next/server'
import { getPlannerById } from '@student/lib/planners'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const planner = await getPlannerById(id)
    if (!planner) {
      return NextResponse.json({ error: 'Planner not found' }, { status: 404 })
    }
    return NextResponse.json(planner)
  } catch (err) {
    console.error('[API] GET /api/planners/[id] failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
