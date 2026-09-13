import { prisma } from '@/lib/prisma'
import UnitForm from '../UnitForm'

export default async function NewUnitPage() {
  const allUnits = await prisma.unit.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  })

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>New Unit</h1>
      <UnitForm allUnits={allUnits} />
    </div>
  )
}
