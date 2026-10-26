import { prisma } from '@/lib/prisma'
import { requirePageAccess } from '@/lib/cms/access'
import ReadOnly from '../../ReadOnly'
import HodManager from './HodManager'

export default async function HodPage() {
  const { canEdit } = await requirePageAccess('hod')
  const hods = await prisma.headOfDepartment.findMany({ orderBy: { position: 'asc' } })
  return <ReadOnly readOnly={!canEdit}><HodManager initialHods={hods} /></ReadOnly>
}
