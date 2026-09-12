import type { UnitListing, UnitDetail } from './types'
import { MOCK_UNITS } from './data/units-mock'
import { MOCK_UNIT_DETAILS } from './data/units-mock-detail'

export async function getUnits(): Promise<UnitListing[]> {
  return MOCK_UNITS
}

export async function getUnit(code: string): Promise<UnitDetail | null> {
  const listing = MOCK_UNITS.find(u => u.code === code.toUpperCase())
  if (!listing) return null

  const extra = MOCK_UNIT_DETAILS[listing.code]
  if (extra) return { ...listing, ...extra }

  // Minimal fallback for units without authored detail content
  return {
    ...listing,
    overview: `${listing.name} is a unit offered by Swinburne University Sarawak as part of the School of Science, Technology, Engineering and Mathematics.`,
    learningOutcomes: [],
    content: [],
    assessment: [],
  }
}
