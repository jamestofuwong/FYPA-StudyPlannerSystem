import RequisiteUnitLink from './RequisiteUnitLink'
import type { RequisiteCondition, RequisiteGroup, RequisiteType } from '@student/lib/requisites'

interface Props {
  groups?: RequisiteGroup[]
  type: RequisiteType
  fallbackCodes?: string[]
}

function conditionText(condition: RequisiteCondition) {
  if (condition.type === 'unit' && condition.unitCode) {
    return <RequisiteUnitLink code={condition.unitCode} />
  }
  if (condition.type === 'credit_points' && condition.creditPoints != null) {
    return `${condition.creditPoints}cp`
  }
  if (condition.type === 'external' && condition.externalRequisite) {
    return condition.externalRequisite
  }
  return null
}

export default function RequisiteExpression({ groups, type, fallbackCodes }: Props) {
  const matchingGroups = (groups ?? [])
    .map(group => group.filter(condition => (condition.requisiteType ?? 'prerequisite') === type))
    .map(group => group.filter(condition => conditionText(condition) !== null))
    .filter(group => group.length > 0)

  if (matchingGroups.length === 0) {
    if (!fallbackCodes?.length) return 'None'
    return fallbackCodes.map((code, index) => (
      <span key={code}>
        {index > 0 && ', '}
        <RequisiteUnitLink code={code} />
      </span>
    ))
  }

  return matchingGroups.map((group, groupIndex) => {
    const needsParentheses = matchingGroups.length > 1 && group.length > 1
    return (
      <span key={groupIndex}>
        {groupIndex > 0 && ' / '}
        {needsParentheses && '('}
        {group.map((condition, conditionIndex) => (
          <span key={conditionIndex}>
            {conditionIndex > 0 && ' & '}
            {conditionText(condition)}
          </span>
        ))}
        {needsParentheses && ')'}
      </span>
    )
  })
}
