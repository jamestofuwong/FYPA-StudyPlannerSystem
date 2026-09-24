'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { HodListSchema } from '@/lib/cms/schemas'

export async function saveHods(
  hods: { id?: string; faculty: string; department: string; name: string; email: string; position: number }[]
) {
  const parsed = HodListSchema.safeParse(hods)
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid head of department data')
  }
  const data = parsed.data

  await prisma.headOfDepartment.deleteMany()
  await prisma.headOfDepartment.createMany({
    data: data.map(h => ({
      faculty: h.faculty,
      department: h.department,
      name: h.name,
      email: h.email,
      position: h.position,
    })),
  })
  revalidatePath('/help/heads-of-department')
  revalidatePath('/cms/help/hod')
}
