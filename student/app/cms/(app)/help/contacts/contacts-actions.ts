'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

export async function saveGeneralEnquiries(formData: FormData) {
  const data = {
    venue_name: formData.get('venue_name') as string,
    location: formData.get('location') as string,
    hours: formData.get('hours') as string,
    closed_note: (formData.get('closed_note') as string) || null,
  }
  const existing = await prisma.generalEnquiries.findFirst()
  if (existing) {
    await prisma.generalEnquiries.update({ where: { id: existing.id }, data })
  } else {
    await prisma.generalEnquiries.create({ data })
  }
  revalidatePath('/help')
  revalidatePath('/cms/help/contacts')
}

export async function saveItHelpDesk(formData: FormData) {
  const data = {
    telephone: formData.get('telephone') as string,
    email: formData.get('email') as string,
    location: formData.get('location') as string,
    hours_mon_thu: formData.get('hours_mon_thu') as string,
    hours_fri: formData.get('hours_fri') as string,
    closed_note: (formData.get('closed_note') as string) || null,
  }
  const existing = await prisma.itHelpDesk.findFirst()
  if (existing) {
    await prisma.itHelpDesk.update({ where: { id: existing.id }, data })
  } else {
    await prisma.itHelpDesk.create({ data })
  }
  revalidatePath('/help')
  revalidatePath('/cms/help/contacts')
}
