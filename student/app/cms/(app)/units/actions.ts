'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { UnitSchema } from '@/lib/cms/schemas'

interface UnitFormData {
  id?: string
  code: string
  name: string
  credit_points: number
  year_level: number
  overview: string
  availability: number[]
  learning_outcomes: { ulo_number: number; description: string }[]
  content_topics: { position: number; topic: string }[]
  assessments: { title: string; type: string; weight: number; ulos: number[]; position: number }[]
  requisites: { requisite_type: 'prerequisite' | 'corequisite' | 'antirequisite'; requisite_unit_id: string }[]
}

export async function saveUnit(data: UnitFormData) {
  const parsed = UnitSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Invalid unit data')
  }
  const d = parsed.data

  if (d.id) {
    await prisma.$transaction([
      prisma.unitAvailability.deleteMany({ where: { unit_id: d.id } }),
      prisma.unitLearningOutcome.deleteMany({ where: { unit_id: d.id } }),
      prisma.unitContentTopic.deleteMany({ where: { unit_id: d.id } }),
      prisma.unitAssessment.deleteMany({ where: { unit_id: d.id } }),
      prisma.unitRequisite.deleteMany({ where: { unit_id: d.id } }),
    ])
    await prisma.unit.update({
      where: { id: d.id },
      data: {
        code: d.code,
        name: d.name,
        credit_points: d.credit_points,
        year_level: d.year_level,
        overview: d.overview || null,
        availability: { create: d.availability.map(month => ({ month })) },
        learning_outcomes: { create: d.learning_outcomes },
        content_topics: { create: d.content_topics },
        assessments: { create: d.assessments },
        requisites: { create: d.requisites.map(r => ({ requisite_type: r.requisite_type, requisite_unit_id: r.requisite_unit_id })) },
      },
    })
    revalidatePath('/cms/units')
    redirect(`/cms/units/${d.id}`)
  } else {
    const unit = await prisma.unit.create({
      data: {
        code: d.code,
        name: d.name,
        credit_points: d.credit_points,
        year_level: d.year_level,
        overview: d.overview || null,
        availability: { create: d.availability.map(month => ({ month })) },
        learning_outcomes: { create: d.learning_outcomes },
        content_topics: { create: d.content_topics },
        assessments: { create: d.assessments },
        requisites: { create: d.requisites.map(r => ({ requisite_type: r.requisite_type, requisite_unit_id: r.requisite_unit_id })) },
      },
    })
    revalidatePath('/cms/units')
    redirect(`/cms/units/${unit.id}`)
  }
}
