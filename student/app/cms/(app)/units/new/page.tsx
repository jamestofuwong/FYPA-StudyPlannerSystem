import { prisma } from '@/lib/prisma'
import { requirePageAccess } from '@/lib/cms/access'
import UnitForm from '../UnitForm'

export default async function NewUnitPage() {
  await requirePageAccess('units', 'edit')
  const allUnits = await prisma.unit.findMany({
    orderBy: { unit_code: 'asc' },
    select: { id: true, unit_code: true, unit_name: true },
  })
  const unitOptions = allUnits.map(unit => ({ id: unit.id, code: unit.unit_code, name: unit.unit_name }))

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>New Unit</h1>
      <UnitForm allUnits={unitOptions} />
    </div>
  )
}
