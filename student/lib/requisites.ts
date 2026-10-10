export type RequisiteType = 'prerequisite' | 'corequisite' | 'antirequisite'

export type RequisiteCondition = {
  type: string
  requisiteType: RequisiteType | null
  unitCode?: string
  creditPoints?: number
  externalRequisite?: string
}

export type RequisiteGroup = RequisiteCondition[]

type RequisiteConditionRecord = {
  type: string
  requisite_type: string | null
  credit_points: number | string | { toString(): string } | null
  external_requisite: string | null
  unit: { unit_code: string } | null
}

type RequisiteGroupRecord = {
  conditions: RequisiteConditionRecord[]
}

function normaliseRequisiteType(value: string | null): RequisiteType {
  if (value === 'corequisite' || value === 'antirequisite') return value
  return 'prerequisite'
}

export function toRequisiteGroups(groups: RequisiteGroupRecord[]): RequisiteGroup[] {
  return groups.map(group => group.conditions.map(condition => ({
    type: condition.type,
    requisiteType: condition.requisite_type as RequisiteType | null,
    ...(condition.unit ? { unitCode: condition.unit.unit_code } : {}),
    ...(condition.credit_points != null ? { creditPoints: Number(condition.credit_points) } : {}),
    ...(condition.external_requisite ? { externalRequisite: condition.external_requisite } : {}),
  })))
}

export function requisiteUnitCodes(groups: RequisiteGroup[] | undefined, type: RequisiteType): string[] {
  return (groups ?? []).flatMap(group =>
    group
      .filter(condition => normaliseRequisiteType(condition.requisiteType) === type && condition.unitCode)
      .map(condition => condition.unitCode!),
  )
}

function conditionText(condition: RequisiteCondition): string | null {
  if (condition.type === 'unit' && condition.unitCode) return condition.unitCode
  if (condition.type === 'credit_points' && condition.creditPoints != null) return `${condition.creditPoints}cp`
  if (condition.type === 'external' && condition.externalRequisite) return condition.externalRequisite
  return null
}

export function formatRequisiteGroups(
  groups: RequisiteGroup[] | undefined,
  type: RequisiteType = 'prerequisite',
): string | null {
  const formattedGroups = (groups ?? [])
    .map(group => group
      .filter(condition => normaliseRequisiteType(condition.requisiteType) === type)
      .map(conditionText)
      .filter((text): text is string => Boolean(text)))
    .filter(group => group.length > 0)

  if (formattedGroups.length === 0) return null

  return formattedGroups
    .map(group => {
      const text = group.join(' & ')
      return formattedGroups.length > 1 && group.length > 1 ? `(${text})` : text
    })
    .join(' / ')
}
