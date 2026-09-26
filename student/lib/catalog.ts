import 'server-only'
import { prisma } from './prisma'
import { getPlannerById, getPlannerOptions, getPlanners } from './planners'
import { getUnit, getUnits } from './units'
import type { StudentCatalog } from './catalog-types'

// One read of every public student page: planners, units, plan-builder options, and help.
export async function getCatalog(): Promise<StudentCatalog> {
  const [planners, units, plannerOptions, faqs, generalEnquiries, itHelpDesk, hods] = await Promise.all([
    getPlanners(),
    getUnits(),
    getPlannerOptions(),
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

  const [plannerDetails, unitDetails] = await Promise.all([
    Promise.all(planners.map(planner => getPlannerById(planner.id))),
    Promise.all(units.map(unit => getUnit(unit.code))),
  ])

  const plannersById: StudentCatalog['plannersById'] = {}
  plannerDetails.forEach(detail => {
    if (detail) plannersById[detail.id] = detail
  })

  const unitsByCode: StudentCatalog['unitsByCode'] = {}
  unitDetails.forEach(detail => {
    if (detail) unitsByCode[detail.code.toUpperCase()] = detail
  })

  return {
    planners,
    plannersById,
    units,
    unitsByCode,
    plannerOptions,
    help: {
      faqs,
      generalEnquiries,
      itHelpDesk,
      hods,
    },
  }
}
