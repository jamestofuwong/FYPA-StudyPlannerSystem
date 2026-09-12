import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import UnitForm from '../UnitForm'

export default async function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [unit, allUnits] = await Promise.all([
    prisma.unit.findUnique({
      where: { id },
      include: {
        availability: { orderBy: { month: 'asc' } },
        learning_outcomes: { orderBy: { ulo_number: 'asc' } },
        content_topics: { orderBy: { position: 'asc' } },
        assessments: { orderBy: { position: 'asc' } },
        requisites: {
          include: { requisite_unit: { select: { id: true, code: true, name: true } } },
        },
      },
    }),
    prisma.unit.findMany({
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true },
    }),
  ])

  if (!unit) notFound()

  const unitForForm = { ...unit, credit_points: Number(unit.credit_points) }

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>Edit Unit</h1>
      <UnitForm unit={unitForForm} allUnits={allUnits} />
    </div>
  )
}
