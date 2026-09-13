'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

export async function saveHods(
  hods: { id?: string; faculty: string; department: string; name: string; email: string; position: number }[]
) {
  await prisma.headOfDepartment.deleteMany()
  await prisma.headOfDepartment.createMany({
    data: hods.map(h => ({
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
