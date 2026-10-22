'use server'
import { revalidatePath } from 'next/cache'
import { revalidateStudentCache, STUDENT_CACHE } from '@/lib/catalog'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { UnitSchema } from '@/lib/cms/schemas'
import { getSession, requireSession } from '@/lib/cms/session'
import { fetchOfficialUnitDetail } from '@/lib/unit-detail-official-fetch'
import {
  applyUnitDetailSection,
  normalizeUnitDetailSection,
  unitDetailSectionsEqual,
  checkUnitDetailSnapshot,
  UNIT_DETAIL_SECTIONS,
  type UnitDetailSectionKey,
} from '@/lib/unit-detail-service'

interface UnitFormData {
  id?: string
  code: string
  name: string
  credit_points: number
  year_level: number
  overview: string
  availability: number[]
  learning_outcomes: { ulo_number: number; description: string }[]
  content_topics: { position: number; topic: string }[]
  assessments: { type: string; task: string | null; weight: number | null; weighting_raw: string | null; ulos: number[]; position: number }[]
  requisites: { requisite_type: 'prerequisite' | 'corequisite' | 'antirequisite'; requisite_unit_id: string }[]
}

function submittedSection(data: UnitFormData, section: UnitDetailSectionKey): unknown {
  if (section === 'overview') return data.overview
  if (section === 'learning_outcomes') {
    return data.learning_outcomes.map(outcome => ({ number: outcome.ulo_number, description: outcome.description }))
  }
  if (section === 'content_topics') return data.content_topics
  return data.assessments.map(assessment => ({
    position: assessment.position,
    type: assessment.type,
    task: assessment.task,
    weighting_raw: assessment.weighting_raw,
    weight: assessment.weight,
    ulos: assessment.ulos,
  }))
}

function storedSection(unit: {
  overview: string | null
  learning_outcomes: { ulo_number: number; description: string }[]
  content_topics: { position: number; topic: string }[]
  assessments: { type: string; task: string | null; weight: number | null; weighting_raw: string | null; ulos: number[]; position: number }[]
}, section: UnitDetailSectionKey): unknown {
  if (section === 'overview') return unit.overview
  if (section === 'learning_outcomes') {
    return unit.learning_outcomes.map(outcome => ({ number: outcome.ulo_number, description: outcome.description }))
  }
  if (section === 'content_topics') return unit.content_topics
  return unit.assessments.map(assessment => ({
    position: assessment.position,
    type: assessment.type,
    task: assessment.task,
    weighting_raw: assessment.weighting_raw,
    weight: assessment.weight,
    ulos: assessment.ulos,
  }))
}

function normalizedAssessments(data: UnitFormData) {
  return data.assessments.map(assessment => ({
    ...assessment,
    task: assessment.task?.trim() ? assessment.task : null,
    weighting_raw: assessment.weighting_raw?.trim() ? assessment.weighting_raw : null,
  }))
}

export async function deleteUnit(id: string) {
  const session = await requireSession()

  try {
    await prisma.unit.delete({ where: { id } })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2003' || error.code === 'P2014')
    ) {
      return { success: false as const, reason: 'in_use' as const }
    }
    console.error(`[CMS] unit:delete failed id=${id}`, error)
    return { success: false as const, reason: 'failed' as const }
  }

  console.info(`[CMS] unit:deleted id=${id} by=${session.email}`)
  revalidatePath('/cms/units')
  revalidateStudentCache(STUDENT_CACHE.units)
  revalidateStudentCache(STUDENT_CACHE.planners)
  return { success: true as const }
}

export async function saveUnit(data: UnitFormData) {
  const parsed = UnitSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid unit data')
  }
  const d = parsed.data
  const session = await getSession()

  if (d.id) {
    const unitId = d.id
    const changedSections = await prisma.$transaction(async tx => {
      const current = await tx.unit.findUnique({
        where: { id: unitId },
        include: {
          learning_outcomes: { orderBy: { ulo_number: 'asc' } },
          content_topics: { orderBy: { position: 'asc' } },
          assessments: { orderBy: { position: 'asc' } },
        },
      })
      if (!current) throw new Error('Unit not found')

      const changed = UNIT_DETAIL_SECTIONS.filter(section =>
        !unitDetailSectionsEqual(section, storedSection(current, section), submittedSection(d, section)),
      )

      await tx.unit.update({
        where: { id: unitId },
        data: {
          unit_code: d.code,
          unit_name: d.name,
          credit_points: d.credit_points,
          year_level: d.year_level,
          overview: d.overview || null,
          offerings: { deleteMany: {}, create: d.availability.map(month => ({ offered_in: month })) },
          learning_outcomes: { deleteMany: {}, create: d.learning_outcomes },
          content_topics: { deleteMany: {}, create: d.content_topics },
          assessments: { deleteMany: {}, create: normalizedAssessments(d) },
          requisite_groups: {
            deleteMany: {},
            create: d.requisites.length > 0
              ? [{
                  conditions: {
                    create: d.requisites.map(requisite => ({
                      type: 'unit',
                      requisite_type: requisite.requisite_type,
                      unit_id: requisite.requisite_unit_id,
                    })),
                  },
                }]
              : [],
          },
        },
      })

      for (const section of changed) {
        await tx.unitDetailSectionState.upsert({
          where: { unit_id_section: { unit_id: unitId, section } },
          create: {
            unit_id: unitId,
            section,
            pending_snapshot: Prisma.DbNull,
          },
          update: { pending_snapshot: Prisma.DbNull },
        })
      }
      return changed
    })

    console.info(`[CMS] unit:updated code=${d.code} id=${d.id} by=${session?.email ?? 'unknown'} detail_sections=${changedSections.join(',') || 'none'}`)
    revalidatePath('/cms/units')
    revalidateStudentCache(STUDENT_CACHE.units)
    revalidateStudentCache(STUDENT_CACHE.planners)
    redirect(`/cms/units/${data.id}`)
  }

  const unit = await prisma.$transaction(async tx => tx.unit.create({
    data: {
      unit_code: d.code,
      unit_name: d.name,
      credit_points: d.credit_points,
      year_level: d.year_level,
      overview: d.overview || null,
      offerings: { create: d.availability.map(month => ({ offered_in: month })) },
      learning_outcomes: { create: d.learning_outcomes },
      content_topics: { create: d.content_topics },
      assessments: { create: normalizedAssessments(d) },
      requisite_groups: {
        create: d.requisites.length > 0
          ? [{
              conditions: {
                create: d.requisites.map(requisite => ({
                  type: 'unit',
                  requisite_type: requisite.requisite_type,
                  unit_id: requisite.requisite_unit_id,
                })),
              },
            }]
          : [],
      },
      detail_section_states: {
        create: UNIT_DETAIL_SECTIONS.map(section => ({ section })),
      },
    },
  }))

  console.info(`[CMS] unit:created code=${d.code} id=${unit.id} by=${session?.email ?? 'unknown'}`)
  revalidatePath('/cms/units')
  revalidateStudentCache(STUDENT_CACHE.units)
  revalidateStudentCache(STUDENT_CACHE.planners)
  redirect(`/cms/units/${unit.id}`)
}

export async function checkOfficialUnitUpdates(unitId: string) {
  await requireSession()

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { unit_code: true, unit_name: true },
  })
  if (!unit) return { type: 'error' as const, message: 'Unit not found.' }

  try {
    const candidate = await fetchOfficialUnitDetail(unit.unit_code, unit.unit_name)
    if (
      (candidate.status !== 'ok' && candidate.status !== 'partial') ||
      (candidate.sourceKind !== 'official_unit_page' && candidate.sourceKind !== 'sarawak_unit_page')
    ) {
      return { type: 'error' as const, message: 'No reliable official update was found.' }
    }

    const report = await checkUnitDetailSnapshot({
      schemaVersion: 1,
      units: [candidate],
    })

    if (report.unknownUnits.length) {
      return { type: 'error' as const, message: 'No reliable official update was found.' }
    }

    if (report.pendingSections || report.clearedPendingSnapshots) {
      revalidatePath(`/cms/units/${unitId}`)
    }

    if (report.pendingSections) {
      return { type: 'success' as const, message: 'Official version available for review.' }
    }
    const hasUncertainAssessmentMapping = candidate.warnings.some(warning =>
      warning.includes('ULO mapping could not be parsed confidently'),
    )
    if (
      (candidate.status === 'ok' || candidate.status === 'partial') &&
      !hasUncertainAssessmentMapping &&
      report.unchangedSections &&
      !report.skippedMissingStateSections
    ) {
      return { type: 'success' as const, message: 'No official changes found.' }
    }
    return { type: 'error' as const, message: 'No reliable official update was found.' }
  } catch (error) {
    console.error(`[CMS] official Unit Detail check failed for ${unit.unit_code}:`, error)
    return { type: 'error' as const, message: 'The official update check could not be completed. Please try again later.' }
  }
}

type ReviewDecision = 'keep_current' | 'use_official'

export async function reviewUnitDetailUpdate(
  unitId: string,
  sectionValue: string,
  decision: ReviewDecision,
) {
  await requireSession()
  if (!UNIT_DETAIL_SECTIONS.includes(sectionValue as UnitDetailSectionKey)) {
    throw new Error('Invalid Unit Detail section')
  }
  if (decision !== 'keep_current' && decision !== 'use_official') {
    throw new Error('Invalid Unit Detail review decision')
  }
  const section = sectionValue as UnitDetailSectionKey

  await prisma.$transaction(async tx => {
    const state = await tx.unitDetailSectionState.findUnique({
      where: { unit_id_section: { unit_id: unitId, section } },
    })
    if (!state?.pending_snapshot) {
      throw new Error('No pending official update exists for this section')
    }

    if (decision === 'keep_current') {
      await tx.unitDetailSectionState.update({
        where: { id: state.id },
        data: { pending_snapshot: Prisma.DbNull },
      })
      return
    }

    const snapshot = state.pending_snapshot
    if (typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot === null) {
      throw new Error('Pending official snapshot is invalid')
    }
    const snapshotRecord = snapshot as Record<string, Prisma.JsonValue>
    const content = normalizeUnitDetailSection(section, snapshotRecord.content)
    const provenance = snapshotRecord.provenance
    if (typeof provenance !== 'object' || provenance === null || Array.isArray(provenance)) {
      throw new Error('Pending official provenance is invalid')
    }
    await applyUnitDetailSection(tx, unitId, section, content)
    await tx.unitDetailSectionState.update({
      where: { id: state.id },
      data: { pending_snapshot: Prisma.DbNull },
    })
  })

  revalidatePath(`/cms/units/${unitId}`)
  revalidateStudentCache(STUDENT_CACHE.units)
}
