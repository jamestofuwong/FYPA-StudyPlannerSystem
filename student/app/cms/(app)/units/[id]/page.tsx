import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import UnitForm from '../UnitForm'

export default async function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [unit, allUnits] = await Promise.all([
    prisma.unit.findUnique({
      where: { id },
      include: {
        offerings: { orderBy: { offered_in: 'asc' } },
        learning_outcomes: { orderBy: { ulo_number: 'asc' } },
        content_topics: { orderBy: { position: 'asc' } },
        assessments: { orderBy: { position: 'asc' } },
        requisite_groups: {
          include: {
            conditions: {
              include: { unit: { select: { id: true, unit_code: true, unit_name: true } } },
            },
          },
        },
      },
    }),
    prisma.unit.findMany({
      orderBy: { unit_code: 'asc' },
      select: { id: true, unit_code: true, unit_name: true },
    }),
  ])

  if (!unit) notFound()

  const unitForForm = {
    ...unit,
    code: unit.unit_code,
    name: unit.unit_name,
    credit_points: Number(unit.credit_points),
    availability: unit.offerings.map(o => ({ month: o.offered_in })),
    requisites: unit.requisite_groups.flatMap(group =>
      group.conditions
        .filter(condition => condition.unit && condition.requisite_type)
        .map(condition => ({
          id: condition.id,
          requisite_type: condition.requisite_type!,
          requisite_unit: {
            id: condition.unit!.id,
            code: condition.unit!.unit_code,
            name: condition.unit!.unit_name,
          },
        })),
    ),
  }
  const unitOptions = allUnits.map(unit => ({ id: unit.id, code: unit.unit_code, name: unit.unit_name }))

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>Edit Unit</h1>
      <UnitForm unit={unitForForm} allUnits={unitOptions} />
    </div>
  )
}
