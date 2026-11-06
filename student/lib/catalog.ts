import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'
import { prisma } from './prisma'
import { getPlannerById, getPlannerOptions, getPlanners } from './planners'
import { getPlannerYearLevels, getUnit, getUnits } from './units'
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

// The cached reads also expire by themselves. A CMS save refreshes them at once, but a change made outside the CMS (a seed,
// a restore, a manual edit) would otherwise stay hidden for good, and an empty result cached before a seed does too.
const CACHE_SECONDS = 600

export const getCachedPlanners = unstable_cache(getPlanners, ['student-planners-v5'], {
  tags: [STUDENT_CACHE.planners],
  revalidate: CACHE_SECONDS,
})

export const getCachedPlanner = unstable_cache(getPlannerById, ['student-planner-v5'], {
  tags: [STUDENT_CACHE.planners],
  revalidate: CACHE_SECONDS,
})

export const getCachedPlannerOptions = unstable_cache(getPlannerOptions, ['student-planner-options-v5'], {
  tags: [STUDENT_CACHE.planners],
  revalidate: CACHE_SECONDS,
})

export const getCachedUnits = unstable_cache(getUnits, ['student-units-v5'], {
  tags: [STUDENT_CACHE.units],
  revalidate: CACHE_SECONDS,
})

export const getCachedPlannerYearLevels = unstable_cache(getPlannerYearLevels, ['student-planner-year-levels-v5'], {
  tags: [STUDENT_CACHE.planners],
  revalidate: CACHE_SECONDS,
})

export const getCachedUnit = unstable_cache(getUnit, ['student-unit-v5'], {
  tags: [STUDENT_CACHE.units],
  revalidate: CACHE_SECONDS,
})

export const getCachedHelp = unstable_cache(readHelp, ['student-help-v5'], {
  tags: [STUDENT_CACHE.help],
  revalidate: CACHE_SECONDS,
})
