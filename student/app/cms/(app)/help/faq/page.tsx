import { prisma } from '@/lib/prisma'
import FaqManager from './FaqManager'

export default async function FaqPage() {
  const items = await prisma.faqItem.findMany({ orderBy: { position: 'asc' } })
  return <FaqManager initialItems={items} />
}
