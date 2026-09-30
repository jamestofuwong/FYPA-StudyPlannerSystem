'use server'
import { revalidatePath } from 'next/cache'
import { revalidateStudentCache, STUDENT_CACHE } from '@/lib/catalog'
import { prisma } from '@/lib/prisma'
import { HodListSchema } from '@/lib/cms/schemas'
import { getSession } from '@/lib/cms/session'

export async function saveHods(
  hods: { id?: string; faculty: string; department: string; name: string; email: string; position: number }[]
) {
  const parsed = HodListSchema.safeParse(hods)
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid head of department data')
  }
  const data = parsed.data

  const session = await getSession()
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
  console.info(`[CMS] hod:saved count=${data.length} by=${session?.email ?? 'unknown'}`)
  revalidatePath('/help/heads-of-department')
  revalidatePath('/cms/help/hod')
  revalidateStudentCache(STUDENT_CACHE.help)
}
