import { prisma } from './prisma'
import { requisiteUnitCodes, toRequisiteGroups } from './requisites'
import { termLabel } from './term-labels'
import type { UnitDetail, UnitListing } from './types'

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

  return units.map(u => {
    const requisiteGroups = toRequisiteGroups(u.requisite_groups)
    return {
      code: u.unit_code,
      name: u.unit_name,
      creditPoints: Number(u.credit_points),
      yearLevel: u.year_level,
      requisiteGroups,
      prerequisites: requisiteUnitCodes(requisiteGroups, 'prerequisite'),
      corequisites: requisiteUnitCodes(requisiteGroups, 'corequisite'),
      antirequisites: requisiteUnitCodes(requisiteGroups, 'antirequisite'),
      availability: u.offerings.map(o => termLabel(o.offered_in)),
    }
  })
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

  const requisiteGroups = toRequisiteGroups(u.requisite_groups)
  return {
    code: u.unit_code,
    name: u.unit_name,
    creditPoints: Number(u.credit_points),
    yearLevel: u.year_level,
    overview: u.overview ?? '',
    requisiteGroups,
    prerequisites: requisiteUnitCodes(requisiteGroups, 'prerequisite'),
    corequisites: requisiteUnitCodes(requisiteGroups, 'corequisite'),
    antirequisites: requisiteUnitCodes(requisiteGroups, 'antirequisite'),
    availability: u.offerings.map(o => termLabel(o.offered_in)),
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
