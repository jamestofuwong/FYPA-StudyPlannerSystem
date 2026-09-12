// ---------------------------------------------------------------------------
// Data access layer — the DB integration seam
//
// To connect a live database (e.g. Supabase):
//   1. Install the client:  npm install @supabase/supabase-js
//   2. Create lib/supabase.ts with the client singleton
//   3. Replace the mock imports below with Supabase queries
//   4. Transform the DB rows into PlannerSummary / PlannerDetail shapes
//      (the function signatures and return types stay identical)
// ---------------------------------------------------------------------------

import type { PlannerSummary, PlannerDetail } from './types'
import { MOCK_PLANNERS, MOCK_PLANNER_DETAILS } from './data/mock'

export async function getPlanners(): Promise<PlannerSummary[]> {
  // TODO: replace with Supabase query, e.g.:
  // const { data } = await supabase
  //   .from('planner_templates')
  //   .select('id, courses(name), majors(name), intake_year, intake_month, course_type, duration_semesters, units(count)')
  // return data.map(toSummary)
  return MOCK_PLANNERS
}

export async function getPlannerById(id: string): Promise<PlannerDetail | null> {
  // TODO: replace with Supabase query, e.g.:
  // const { data } = await supabase
  //   .from('planner_templates')
  //   .select('*, courses(*), majors(*), template_units(*, units(*))')
  //   .eq('id', id)
  //   .single()
  // if (!data) return null
  // return toDetail(data)
  return MOCK_PLANNER_DETAILS[id] ?? null
}
