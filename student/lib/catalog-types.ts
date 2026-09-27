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

export interface StudentHelp {
  faqs: HelpFaq[]
  generalEnquiries: GeneralEnquiriesInfo | null
  itHelpDesk: ItHelpDeskInfo | null
  hods: HeadOfDepartmentInfo[]
}
