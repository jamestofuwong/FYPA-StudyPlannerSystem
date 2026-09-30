'use server'
import { revalidatePath } from 'next/cache'
import { revalidateStudentCache, STUDENT_CACHE } from '@/lib/catalog'
import { prisma } from '@/lib/prisma'
import { GeneralEnquiriesSchema, ItHelpDeskSchema } from '@/lib/cms/schemas'
import { getSession } from '@/lib/cms/session'

export async function saveGeneralEnquiries(formData: FormData) {
  const raw = {
    venue_name: formData.get('venue_name') as string,
    location: formData.get('location') as string,
    hours: formData.get('hours') as string,
    closed_note: (formData.get('closed_note') as string) || null,
  }

  const parsed = GeneralEnquiriesSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid contact data')
  }
  const data = parsed.data

  const session = await getSession()
  const existing = await prisma.generalEnquiries.findFirst()
  if (existing) {
    await prisma.generalEnquiries.update({ where: { id: existing.id }, data })
  } else {
    await prisma.generalEnquiries.create({ data })
  }
  console.info(`[CMS] contacts:general_enquiries saved by=${session?.email ?? 'unknown'}`)
  revalidatePath('/help')
  revalidatePath('/cms/help/contacts')
  revalidateStudentCache(STUDENT_CACHE.help)
}

export async function saveItHelpDesk(formData: FormData) {
  const raw = {
    telephone: formData.get('telephone') as string,
    email: formData.get('email') as string,
    location: formData.get('location') as string,
    hours_mon_thu: formData.get('hours_mon_thu') as string,
    hours_fri: formData.get('hours_fri') as string,
    closed_note: (formData.get('closed_note') as string) || null,
  }

  const parsed = ItHelpDeskSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid IT Help Desk data')
  }
  const data = parsed.data

  const session = await getSession()
  const existing = await prisma.itHelpDesk.findFirst()
  if (existing) {
    await prisma.itHelpDesk.update({ where: { id: existing.id }, data })
  } else {
    await prisma.itHelpDesk.create({ data })
  }
  console.info(`[CMS] contacts:it_help_desk saved by=${session?.email ?? 'unknown'}`)
  revalidatePath('/help')
  revalidatePath('/cms/help/contacts')
  revalidateStudentCache(STUDENT_CACHE.help)
}
