import { Prisma } from '@prisma/client'
import { z } from 'zod'

// Unit Detail section shapes and normalization.
export const UNIT_DETAIL_SECTIONS = [
  'overview',
  'learning_outcomes',
  'content_topics',
  'assessments',
] as const

export type UnitDetailSectionKey = (typeof UNIT_DETAIL_SECTIONS)[number]

export type UnitDetailSectionContent = {
  overview: string | null
  learning_outcomes: { number: number; description: string }[]
  content_topics: { position: number; topic: string }[]
  assessments: {
    position: number
    type: string
    task: string | null
    weighting_raw: string | null
    weight: number | null
    ulos: number[]
  }[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid Unit Detail ${field}`)
  return value
}

function optionalText(value: unknown, field: string): string | null {
  if (value == null) return null
  const text = requiredText(value, field)
  return text.trim() ? text : null
}

// Validate and standardize one section before it is compared or saved.
export function normalizeUnitDetailSection(
  section: UnitDetailSectionKey,
  value: unknown,
): UnitDetailSectionContent[UnitDetailSectionKey] {
  if (section === 'overview') {
    if (value !== null && typeof value !== 'string') throw new Error('Invalid Unit Detail overview')
    return (typeof value === 'string' ? value.trim() || null : null) as UnitDetailSectionContent[UnitDetailSectionKey]
  }

  if (!Array.isArray(value)) throw new Error(`Invalid Unit Detail ${section}`)

  if (section === 'learning_outcomes') {
    const content = value.map((item, index) => {
      if (!isRecord(item) || !Number.isInteger(item.number)) {
        throw new Error(`Invalid Unit Detail learning_outcomes[${index}]`)
      }
      return {
        number: item.number as number,
        description: requiredText(item.description, `learning_outcomes[${index}].description`),
      }
    })
    return content as UnitDetailSectionContent[UnitDetailSectionKey]
  }

  if (section === 'content_topics') {
    const content = value.map((item, index) => {
      if (!isRecord(item) || !Number.isInteger(item.position)) {
        throw new Error(`Invalid Unit Detail content_topics[${index}]`)
      }
      return {
        position: item.position as number,
        topic: requiredText(item.topic, `content_topics[${index}].topic`),
      }
    })
    return content as UnitDetailSectionContent[UnitDetailSectionKey]
  }

  const content = value.map((item, index) => {
    const field = `assessments[${index}]`
    if (!isRecord(item) || !Number.isInteger(item.position)) {
      throw new Error(`Invalid Unit Detail ${field}`)
    }
    const weight = item.weight
    if (weight !== null && !Number.isInteger(weight)) {
      throw new Error(`Invalid Unit Detail ${field}.weight`)
    }
    if (!Array.isArray(item.ulos) || !item.ulos.every(Number.isInteger)) {
      throw new Error(`Invalid Unit Detail ${field}.ulos`)
    }
    return {
      position: item.position as number,
      type: requiredText(item.type, `${field}.type`),
      task: optionalText(item.task, `${field}.task`),
      weighting_raw: optionalText(item.weighting_raw, `${field}.weighting_raw`),
      weight: weight as number | null,
      ulos: [...item.ulos] as number[],
    }
  })
  return content as UnitDetailSectionContent[UnitDetailSectionKey]
}

// Normalize both sides first so comparisons use the same section shape.
export function unitDetailSectionsEqual(
  section: UnitDetailSectionKey,
  left: unknown,
  right: unknown,
): boolean {
  return JSON.stringify(normalizeUnitDetailSection(section, left)) ===
    JSON.stringify(normalizeUnitDetailSection(section, right))
}

// Persist accepted sections and stage official content for review.
// Load this marker only for database operations so shared helpers stay usable.
async function requireServerOnly(): Promise<void> {
  await import('server-only')
}

// Replace only the accepted section's rows inside the caller's transaction.
export async function applyUnitDetailSection(
  tx: Prisma.TransactionClient,
  unitId: string,
  section: UnitDetailSectionKey,
  content: unknown,
) {
  await requireServerOnly()
  if (section === 'overview') {
    await tx.unit.update({ where: { id: unitId }, data: { overview: content as string | null } })
  } else if (section === 'learning_outcomes') {
    const outcomes = content as { number: number; description: string }[]
    await tx.unitLearningOutcome.deleteMany({ where: { unit_id: unitId } })
    if (outcomes.length) {
      await tx.unitLearningOutcome.createMany({
        data: outcomes.map(outcome => ({ unit_id: unitId, ulo_number: outcome.number, description: outcome.description })),
      })
    }
  } else if (section === 'content_topics') {
    const topics = content as { position: number; topic: string }[]
    await tx.unitContentTopic.deleteMany({ where: { unit_id: unitId } })
    if (topics.length) {
      await tx.unitContentTopic.createMany({
        data: topics.map(topic => ({ unit_id: unitId, position: topic.position, topic: topic.topic })),
      })
    }
  } else {
    const assessments = content as {
      position: number
      type: string
      task: string | null
      weighting_raw: string | null
      weight: number | null
      ulos: number[]
    }[]
    await tx.unitAssessment.deleteMany({ where: { unit_id: unitId } })
    if (assessments.length) {
      await tx.unitAssessment.createMany({ data: assessments.map(assessment => ({ unit_id: unitId, ...assessment })) })
    }
  }
}

// Validate snapshots and stage trusted official content for review.
const UnitDetailRecordSchema = z.object({
  unitCode: z.string().trim().min(1),
  normalizedCode: z.string().trim().min(1),
  sourceUrl: z.string().min(1),
  sourceKind: z.string().trim().min(1),
  status: z.enum([
    'ok',
    'partial',
    'catalog_only',
    'historical_reference_only',
    'fetch_failed',
    'page_not_found',
    'parse_failed',
    'identity_mismatch',
  ]),
  missingSections: z.array(z.string()),
  warnings: z.array(z.string()).optional().default([]),
  overview: z.string().nullable(),
  learningOutcomes: z.array(z.object({ number: z.number().int(), description: z.string() })),
  contentTopics: z.array(z.object({ position: z.number().int(), topic: z.string() })),
  assessments: z.array(z.object({
    position: z.number().int(),
    type: z.string().min(1),
    task: z.string().nullable().optional(),
    weightingRaw: z.string().nullable().optional(),
    weight: z.number().int().nullable().optional(),
    ulos: z.array(z.number().int()),
  })),
}).passthrough()

const SnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  units: z.array(UnitDetailRecordSchema),
})

type OfficialUnitDetailRecord = z.infer<typeof UnitDetailRecordSchema>

function normalizedCode(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

// Map scraper field names to the section shape used by the Student app.
function contentFor(record: OfficialUnitDetailRecord, section: UnitDetailSectionKey): unknown {
  if (section === 'overview') return record.overview
  if (section === 'learning_outcomes') return record.learningOutcomes
  if (section === 'content_topics') return record.contentTopics
  return record.assessments.map(assessment => ({
    position: assessment.position,
    type: assessment.type,
    task: assessment.task ?? null,
    weighting_raw: assessment.weightingRaw ?? null,
    weight: assessment.weight ?? null,
    ulos: assessment.ulos,
  }))
}

function scraperSectionName(section: UnitDetailSectionKey): string {
  if (section === 'overview') return 'Overview'
  if (section === 'learning_outcomes') return 'Unit Learning Outcomes'
  if (section === 'content_topics') return 'Content'
  return 'Assessment'
}

// Require populated content so unavailable sections cannot clear saved data.
function hasCandidateContent(record: OfficialUnitDetailRecord, section: UnitDetailSectionKey): boolean {
  if (section === 'overview') return Boolean(record.overview?.trim())
  if (section === 'learning_outcomes') return record.learningOutcomes.length > 0
  if (section === 'content_topics') return record.contentTopics.length > 0
  return record.assessments.length > 0
}

// Uncertain ULO mappings make the full assessment section unsafe to replace.
function sectionWarnings(record: OfficialUnitDetailRecord, section: UnitDetailSectionKey): boolean {
  return section === 'assessments' && record.warnings.some(warning =>
    warning.includes('ULO mapping could not be parsed confidently'),
  )
}

// Keep the official source details alongside a candidate for later review.
function sourceProvenance(record: OfficialUnitDetailRecord): Prisma.InputJsonObject {
  return {
    kind: 'automatic_official',
    sourceUrl: record.sourceUrl,
    sourceKind: record.sourceKind,
    verifiedEquivalentCode: typeof record.verifiedEquivalentCode === 'string' ? record.verifiedEquivalentCode : null,
    equivalenceEvidenceUrl: typeof record.equivalenceEvidenceUrl === 'string' ? record.equivalenceEvidenceUrl : null,
  }
}

type UnitDetailCheckReport = {
  pendingSections: number
  unchangedSections: number
  clearedPendingSnapshots: number
  skippedMissingStateSections: number
  unknownUnits: string[]
}

// Shape stored Prisma rows like scraper output so section comparisons are consistent.
function currentSectionContent(
  unit: {
    overview: string | null
    learning_outcomes: { ulo_number: number; description: string }[]
    content_topics: { position: number; topic: string }[]
    assessments: {
      position: number
      type: string
      task: string | null
      weighting_raw: string | null
      weight: number | null
      ulos: number[]
    }[]
  },
  section: UnitDetailSectionKey,
): unknown {
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

// Stage reliable official differences for review without changing student-facing content.
export async function checkUnitDetailSnapshot(input: unknown): Promise<UnitDetailCheckReport> {
  await requireServerOnly()
  const snapshot = SnapshotSchema.parse(input)
  const codes = snapshot.units.map(record => normalizedCode(record.normalizedCode))
  if (codes.some(code => !code) || new Set(codes).size !== codes.length) {
    throw new Error('Unit Detail snapshot contains a blank or duplicate normalized unit code')
  }
  for (const record of snapshot.units) {
    if (normalizedCode(record.unitCode) !== normalizedCode(record.normalizedCode)) {
      throw new Error(`Unit Detail snapshot identity mismatch for ${record.unitCode}`)
    }
    if (record.status === 'ok' || record.status === 'partial') {
      const host = new URL(record.sourceUrl).hostname.toLowerCase()
      if (!['swinburne.edu.au', 'swinburne.edu.my'].some(domain => host === domain || host.endsWith(`.${domain}`))) {
        throw new Error(`Unit Detail source is not an official Swinburne URL for ${record.unitCode}`)
      }
    }
  }

  const { prisma } = await import('./prisma')
  const units = await prisma.unit.findMany({ select: { id: true, unit_code: true } })
  const unitIds = new Map(units.map(unit => [normalizedCode(unit.unit_code), unit.id]))
  const report: UnitDetailCheckReport = {
    pendingSections: 0,
    unchangedSections: 0,
    clearedPendingSnapshots: 0,
    skippedMissingStateSections: 0,
    unknownUnits: [],
  }

  for (const record of snapshot.units) {
    const code = normalizedCode(record.normalizedCode)
    if (record.status !== 'ok' && record.status !== 'partial') {
      continue
    }
    if (record.status === 'ok' && record.missingSections.length > 0) {
      continue
    }
    // Missing or uncertain sections are skipped rather than treated as deletions.
    const trustedSections = UNIT_DETAIL_SECTIONS.filter(section =>
      record.status === 'ok'
        ? record.missingSections.length === 0 && !sectionWarnings(record, section)
        : !record.missingSections.includes(scraperSectionName(section)) &&
          hasCandidateContent(record, section) &&
          !sectionWarnings(record, section),
    )
    if (trustedSections.length === 0) continue
    const unitId = unitIds.get(code)
    if (!unitId) {
      report.unknownUnits.push(code)
      continue
    }

    const result = await prisma.$transaction(async tx => {
      const counts = { pending: 0, unchanged: 0, cleared: 0, missingState: 0 }
      const current = await tx.unit.findUnique({
        where: { id: unitId },
        select: {
          overview: true,
          learning_outcomes: {
            select: { ulo_number: true, description: true },
            orderBy: { ulo_number: 'asc' },
          },
          content_topics: {
            select: { position: true, topic: true },
            orderBy: { position: 'asc' },
          },
          assessments: {
            select: { position: true, type: true, task: true, weighting_raw: true, weight: true, ulos: true },
            orderBy: { position: 'asc' },
          },
        },
      })
      if (!current) return { ...counts, missingState: trustedSections.length }

      for (const section of trustedSections) {
        const state = await tx.unitDetailSectionState.findUnique({
          where: { unit_id_section: { unit_id: unitId, section } },
        })
        if (!state) {
          counts.missingState += 1
          continue
        }

        // Compare candidates without changing the current CMS-visible content.
        const content = normalizeUnitDetailSection(section, contentFor(record, section))
        const existing = normalizeUnitDetailSection(section, currentSectionContent(current, section))
        if (unitDetailSectionsEqual(section, existing, content)) {
          if (state.pending_snapshot !== null) {
            // Remove a stale review candidate when it now matches the current content.
            await tx.unitDetailSectionState.update({
              where: { id: state.id },
              data: { pending_snapshot: Prisma.DbNull },
            })
            counts.cleared += 1
          }
          counts.unchanged += 1
          continue
        }

        // Stage changed official content for an admin instead of overwriting the current section.
        await tx.unitDetailSectionState.update({
          where: { id: state.id },
          data: {
            pending_snapshot: {
              content: content as Prisma.InputJsonValue,
              provenance: sourceProvenance(record),
            },
          },
        })
        counts.pending += 1
      }
      return counts
    })

    report.pendingSections += result.pending
    report.unchangedSections += result.unchanged
    report.clearedPendingSnapshots += result.cleared
    report.skippedMissingStateSections += result.missingState
  }

  return report
}
