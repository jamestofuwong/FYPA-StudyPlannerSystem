'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

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
  if (data.id) {
    await prisma.$transaction([
      prisma.unitAvailability.deleteMany({ where: { unit_id: data.id } }),
      prisma.unitLearningOutcome.deleteMany({ where: { unit_id: data.id } }),
      prisma.unitContentTopic.deleteMany({ where: { unit_id: data.id } }),
      prisma.unitAssessment.deleteMany({ where: { unit_id: data.id } }),
      prisma.unitRequisite.deleteMany({ where: { unit_id: data.id } }),
    ])
    await prisma.unit.update({
      where: { id: data.id },
      data: {
        code: data.code,
        name: data.name,
        credit_points: data.credit_points,
        year_level: data.year_level,
        overview: data.overview || null,
        availability: { create: data.availability.map(month => ({ month })) },
        learning_outcomes: { create: data.learning_outcomes },
        content_topics: { create: data.content_topics },
        assessments: { create: data.assessments },
        requisites: { create: data.requisites.map(r => ({ requisite_type: r.requisite_type, requisite_unit_id: r.requisite_unit_id })) },
      },
    })
    revalidatePath('/cms/units')
    redirect(`/cms/units/${data.id}`)
  } else {
    const unit = await prisma.unit.create({
      data: {
        code: data.code,
        name: data.name,
        credit_points: data.credit_points,
        year_level: data.year_level,
        overview: data.overview || null,
        availability: { create: data.availability.map(month => ({ month })) },
        learning_outcomes: { create: data.learning_outcomes },
        content_topics: { create: data.content_topics },
        assessments: { create: data.assessments },
        requisites: { create: data.requisites.map(r => ({ requisite_type: r.requisite_type, requisite_unit_id: r.requisite_unit_id })) },
      },
    })
    revalidatePath('/cms/units')
    redirect(`/cms/units/${unit.id}`)
  }
}
