'use server'
import { revalidatePath } from 'next/cache'
import { revalidateStudentCache, STUDENT_CACHE } from '@/lib/catalog'
import { prisma } from '@/lib/prisma'
import { FaqListSchema } from '@/lib/cms/schemas'
import { getSession } from '@/lib/cms/session'

export async function saveFaqItems(
  items: { id?: string; question: string; answer: string; position: number }[]
) {
  const parsed = FaqListSchema.safeParse(items)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid FAQ data')
  }
  const data = parsed.data

  const session = await getSession()
  await prisma.faqItem.deleteMany()
  await prisma.faqItem.createMany({
    data: data.map(item => ({
      question: item.question,
      answer: item.answer,
      position: item.position,
    })),
  })
  console.info(`[CMS] faq:saved count=${data.length} by=${session?.email ?? 'unknown'}`)
  revalidatePath('/cms/help/faq')
  revalidatePath('/help')
  revalidateStudentCache(STUDENT_CACHE.help)
}
