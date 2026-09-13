import { NextResponse } from 'next/server'
import { getPlannerById } from '@student/lib/planners'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params
  const planner = await getPlannerById(id)
  if (!planner) {
    return NextResponse.json({ error: 'Planner not found' }, { status: 404 })
  }
  return NextResponse.json(planner)
}
