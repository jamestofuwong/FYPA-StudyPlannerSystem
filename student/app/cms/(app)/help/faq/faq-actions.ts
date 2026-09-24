'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { FaqListSchema } from '@/lib/cms/schemas'

export async function saveFaqItems(
  items: { id?: string; question: string; answer: string; position: number }[]
) {
  const parsed = FaqListSchema.safeParse(items)
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid FAQ data')
  }
  const data = parsed.data

  await prisma.faqItem.deleteMany()
  await prisma.faqItem.createMany({
    data: data.map(item => ({
      question: item.question,
      answer: item.answer,
      position: item.position,
    })),
  })
  revalidatePath('/cms/help/faq')
  revalidatePath('/help')
}
