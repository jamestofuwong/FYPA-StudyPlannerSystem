import { prisma } from '@/lib/prisma'
import HodManager from './HodManager'

export default async function HodPage() {
  const hods = await prisma.headOfDepartment.findMany({ orderBy: { position: 'asc' } })
  return <HodManager initialHods={hods} />
}
