'use server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

export async function saveFaqItems(
  items: { id?: string; question: string; answer: string; position: number }[]
) {
  await prisma.faqItem.deleteMany()
  await prisma.faqItem.createMany({
    data: items.map(item => ({
      question: item.question,
      answer: item.answer,
      position: item.position,
    })),
  })
  revalidatePath('/cms/help/faq')
  revalidatePath('/help')
}
