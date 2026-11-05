import { prisma } from '@/lib/prisma'
import { requirePageAccess } from '@/lib/cms/access'
import ReadOnly from '../../ReadOnly'
import FaqManager from './FaqManager'

export default async function FaqPage() {
  const { canEdit } = await requirePageAccess('faq')
  const items = await prisma.faqItem.findMany({ orderBy: { position: 'asc' } })
  return <ReadOnly readOnly={!canEdit}><FaqManager initialItems={items} /></ReadOnly>
}
