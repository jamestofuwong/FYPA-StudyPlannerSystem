import { prisma } from './prisma'
import type { UnitDetail, UnitListing } from './types'

const TERM_LABELS: Record<number, string> = {
  1: 'Semester 1',
  2: 'Semester 2',
  3: 'Summer Term',
  4: 'Winter Term',
}

type RequisiteGroupForDisplay = {
  conditions: {
    requisite_type: string | null
    unit: { unit_code: string } | null
  }[]
}

function requisiteCodes(groups: RequisiteGroupForDisplay[], type: string): string[] {
  return groups.flatMap(group =>
    group.conditions
      .filter(condition => condition.requisite_type === type && condition.unit)
      .map(condition => condition.unit!.unit_code),
  )
}

export async function getUnits(): Promise<UnitListing[]> {
  const units = await prisma.unit.findMany({
    orderBy: { unit_code: 'asc' },
    include: {
      offerings: { orderBy: { offered_in: 'asc' } },
      requisite_groups: {
        include: {
          conditions: {
            include: { unit: { select: { unit_code: true } } },
            orderBy: { requisite_type: 'asc' },
          },
        },
      },
    },
  })

  return units.map(u => ({
    code: u.unit_code,
    name: u.unit_name,
    creditPoints: Number(u.credit_points),
    yearLevel: u.year_level,
    prerequisites: requisiteCodes(u.requisite_groups, 'prerequisite'),
    corequisites: requisiteCodes(u.requisite_groups, 'corequisite'),
    antirequisites: requisiteCodes(u.requisite_groups, 'antirequisite'),
    availability: u.offerings.map(o => TERM_LABELS[o.offered_in] ?? `Term ${o.offered_in}`),
  }))
}

export async function getUnit(code: string): Promise<UnitDetail | null> {
  const u = await prisma.unit.findUnique({
    where: { unit_code: code.toUpperCase() },
    include: {
      offerings: { orderBy: { offered_in: 'asc' } },
      requisite_groups: {
        include: {
          conditions: {
            include: { unit: { select: { unit_code: true } } },
            orderBy: { requisite_type: 'asc' },
          },
        },
      },
      learning_outcomes: { orderBy: { ulo_number: 'asc' } },
      content_topics: { orderBy: { position: 'asc' } },
      assessments: { orderBy: { position: 'asc' } },
    },
  })

  if (!u) return null

  return {
    code: u.unit_code,
    name: u.unit_name,
    creditPoints: Number(u.credit_points),
    yearLevel: u.year_level,
    overview: u.overview ?? '',
    prerequisites: requisiteCodes(u.requisite_groups, 'prerequisite'),
    corequisites: requisiteCodes(u.requisite_groups, 'corequisite'),
    antirequisites: requisiteCodes(u.requisite_groups, 'antirequisite'),
    availability: u.offerings.map(o => TERM_LABELS[o.offered_in] ?? `Term ${o.offered_in}`),
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
