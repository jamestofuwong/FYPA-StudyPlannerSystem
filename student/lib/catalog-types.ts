import type { PlannerCourseOption } from './planners'
import type { PlannerDetail, PlannerSummary, UnitDetail, UnitListing } from './types'

export interface HelpFaq {
  question: string
  answer: string
}

export interface GeneralEnquiriesInfo {
  venue_name: string
  location: string
  hours: string
  closed_note: string | null
}

export interface ItHelpDeskInfo {
  telephone: string
  email: string
  location: string
  hours_mon_thu: string
  hours_fri: string
  closed_note: string | null
}

export interface HeadOfDepartmentInfo {
  id: string
  faculty: string
  department: string
  name: string
  email: string
  position: number
}

export interface StudentCatalog {
  planners: PlannerSummary[]
  plannersById: Record<string, PlannerDetail>
  units: UnitListing[]
  unitsByCode: Record<string, UnitDetail>
  plannerOptions: PlannerCourseOption[]
  help: {
    faqs: HelpFaq[]
    generalEnquiries: GeneralEnquiriesInfo | null
    itHelpDesk: ItHelpDeskInfo | null
    hods: HeadOfDepartmentInfo[]
  }
}
