import { prisma } from './prisma'
import type { UnitListing, UnitDetail } from './types'

// ⚠️  MISMATCH: CMS UnitForm only offers Jan/Mar/Aug/Oct/Nov as availability options,
// but the DB supports all 12 months. Any month stored via direct DB access will
// display correctly here, but the CMS cannot configure months outside these five.
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export async function getUnits(): Promise<UnitListing[]> {
  const units = await prisma.unit.findMany({
    orderBy: { code: 'asc' },
    include: {
      availability: { orderBy: { month: 'asc' } },
      requisites: {
        include: { requisite_unit: { select: { code: true } } },
        orderBy: { requisite_type: 'asc' },
      },
    },
  })

  return units.map(u => ({
    code: u.code,
    name: u.name,
    creditPoints: Number(u.credit_points),
    yearLevel: u.year_level,
    prerequisites: u.requisites
      .filter(r => r.requisite_type === 'prerequisite')
      .map(r => r.requisite_unit.code),
    corequisites: u.requisites
      .filter(r => r.requisite_type === 'corequisite')
      .map(r => r.requisite_unit.code),
    antirequisites: u.requisites
      .filter(r => r.requisite_type === 'antirequisite')
      .map(r => r.requisite_unit.code),
    availability: u.availability.map(a => MONTH_ABBR[a.month - 1]),
  }))
}

export async function getUnit(code: string): Promise<UnitDetail | null> {
  const u = await prisma.unit.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      availability: { orderBy: { month: 'asc' } },
      requisites: {
        include: { requisite_unit: { select: { code: true } } },
        orderBy: { requisite_type: 'asc' },
      },
      learning_outcomes: { orderBy: { ulo_number: 'asc' } },
      content_topics: { orderBy: { position: 'asc' } },
      assessments: { orderBy: { position: 'asc' } },
    },
  })

  if (!u) return null

  return {
    code: u.code,
    name: u.name,
    creditPoints: Number(u.credit_points),
    yearLevel: u.year_level,
    overview: u.overview ?? '',
    prerequisites: u.requisites
      .filter(r => r.requisite_type === 'prerequisite')
      .map(r => r.requisite_unit.code),
    corequisites: u.requisites
      .filter(r => r.requisite_type === 'corequisite')
      .map(r => r.requisite_unit.code),
    antirequisites: u.requisites
      .filter(r => r.requisite_type === 'antirequisite')
      .map(r => r.requisite_unit.code),
    availability: u.availability.map(a => MONTH_ABBR[a.month - 1]),
    learningOutcomes: u.learning_outcomes.map(lo => lo.description),
    content: u.content_topics.map(t => t.topic),
    assessment: u.assessments.map(a => ({
      title: a.title,
      type: a.type,
      weight: a.weight,
      ulos: a.ulos,
    })),
  }
}
