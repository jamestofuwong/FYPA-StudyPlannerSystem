import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requirePageAccess } from '@/lib/cms/access'
import ReadOnly from '../../ReadOnly'
import UnitForm from '../UnitForm'

function pendingContent(snapshot: unknown): unknown {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) return null
  const content = (snapshot as Record<string, unknown>).content
  return content === undefined ? null : content
}

function pendingSourceUrl(snapshot: unknown): string | null {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) return null
  const provenance = (snapshot as Record<string, unknown>).provenance
  if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) return null
  const sourceUrl = (provenance as Record<string, unknown>).sourceUrl
  if (typeof sourceUrl !== 'string') return null
  try {
    const url = new URL(sourceUrl)
    const host = url.hostname.toLowerCase()
    return ['swinburne.edu.au', 'swinburne.edu.my'].some(domain => host === domain || host.endsWith(`.${domain}`))
      ? url.href
      : null
  } catch {
    return null
  }
}

export default async function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { canEdit } = await requirePageAccess('units')
  const { id } = await params

  const [unit, allUnits] = await Promise.all([
    prisma.unit.findUnique({
      where: { id },
      include: {
        offerings: { orderBy: { offered_in: 'asc' } },
        learning_outcomes: { orderBy: { ulo_number: 'asc' } },
        content_topics: { orderBy: { position: 'asc' } },
        assessments: { orderBy: { position: 'asc' } },
        detail_section_states: {
          orderBy: { section: 'asc' },
          select: { section: true, pending_snapshot: true },
        },
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
  const pendingUpdates = unit.detail_section_states.flatMap(state =>
    state.pending_snapshot
      ? [{
          section: state.section,
          content: pendingContent(state.pending_snapshot),
          sourceUrl: pendingSourceUrl(state.pending_snapshot),
        }]
      : [],
  )
  return (
    <ReadOnly readOnly={!canEdit}>
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 32 }}>Edit Unit</h1>
      <UnitForm unit={unitForForm} allUnits={unitOptions} pendingUpdates={pendingUpdates} />
    </div>
  </ReadOnly>
  )
}
