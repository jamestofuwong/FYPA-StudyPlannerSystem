import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'
import { prisma } from './prisma'
import { getPlannerById, getPlannerOptions, getPlanners } from './planners'
import { getUnit, getUnits } from './units'
import type { StudentHelp } from './catalog-types'

export const STUDENT_CACHE = {
  planners: 'student-planners',
  units: 'student-units',
  help: 'student-help',
} as const

type StudentCacheTag = (typeof STUDENT_CACHE)[keyof typeof STUDENT_CACHE]

/** Drop the cached student pages that read this tag. CMS saves call this. */
export function revalidateStudentCache(tag: StudentCacheTag) {
  revalidateTag(tag, 'max')
}

async function readHelp(): Promise<StudentHelp> {
  const [faqs, generalEnquiries, itHelpDesk, hods] = await Promise.all([
    prisma.faqItem.findMany({ orderBy: { position: 'asc' }, select: { question: true, answer: true } }),
    prisma.generalEnquiries.findFirst({
      select: { venue_name: true, location: true, hours: true, closed_note: true },
    }),
    prisma.itHelpDesk.findFirst({
      select: { telephone: true, email: true, location: true, hours_mon_thu: true, hours_fri: true, closed_note: true },
    }),
    prisma.headOfDepartment.findMany({
      orderBy: { position: 'asc' },
      select: { id: true, faculty: true, department: true, name: true, email: true, position: true },
    }),
  ])
  return { faqs, generalEnquiries, itHelpDesk, hods }
}

export const getCachedPlanners = unstable_cache(getPlanners, ['student-planners'], {
  tags: [STUDENT_CACHE.planners],
})

export const getCachedPlanner = unstable_cache(getPlannerById, ['student-planner'], {
  tags: [STUDENT_CACHE.planners],
})

export const getCachedPlannerOptions = unstable_cache(getPlannerOptions, ['student-planner-options'], {
  tags: [STUDENT_CACHE.planners],
})

export const getCachedUnits = unstable_cache(getUnits, ['student-units'], {
  tags: [STUDENT_CACHE.units],
})

export const getCachedUnit = unstable_cache(getUnit, ['student-unit'], {
  tags: [STUDENT_CACHE.units],
})

export const getCachedHelp = unstable_cache(readHelp, ['student-help'], {
  tags: [STUDENT_CACHE.help],
})
