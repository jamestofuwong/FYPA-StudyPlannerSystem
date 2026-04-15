import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const planner = body.planner || body;

    if (!planner || !planner.course_information) {
      return NextResponse.json({ error: "Invalid planner data structure" }, { status: 400 });
    }

    const { course_information, categories } = planner;

    const result = await prisma.$transaction(async (tx) => {
      const course = await tx.course.upsert({
        where: { code: course_information.course },
        update: {},
        create: {
          code: course_information.course,
          name: course_information.course_name || course_information.course,
        },
      });

      const major = await tx.major.upsert({
        where: {
          course_id_name: {
            course_id: course.id,
            name: course_information.major,
          },
        },
        update: {},
        create: {
          name: course_information.major,
          course_id: course.id,
        },
      });

      const newPlanner = await tx.plannerTemplate.create({
        data: {
          course_id: course.id,
          major_id: major.id,
          intake_year: parseInt(course_information.intake_year) || 2025,
        },
      });

      const allUnits = [
        ...(categories.core_units?.map((u: any) => ({ ...u, cat: 'core' })) || []),
        ...(categories.major_units?.map((u: any) => ({ ...u, cat: 'major_core' })) || []),
        ...(categories.mpu_group?.map((u: any) => ({ ...u, cat: 'mpu' })) || []),
        ...(categories.wil_group?.map((u: any) => ({ ...u, cat: 'wil' })) || []),
        ...(categories.elective_groups?.prescribed_elective?.map((u: any) => ({ ...u, cat: 'prescribed_elective' })) || []),
        ...(categories.elective_groups?.elective?.map((u: any) => ({ ...u, cat: 'elective' })) || []),
      ];

      for (const u of allUnits) {
        if (!u.unit_code) continue;

        const unitDef = await tx.unit.upsert({
          where: { unit_code: u.unit_code },
          update: { unit_name: u.unit_name || 'Unknown Unit' },
          create: {
            unit_code: u.unit_code,
            unit_name: u.unit_name || 'Unknown Unit',
          },
        });

        await tx.templateUnit.create({
          data: {
            planner_template_id: newPlanner.id,
            unit_id: unitDef.id,
            category: u.cat,
            year_level: parseInt(u.year_level) || 1,
            semester: parseInt(u.semester) || 1,
          },
        });
      }

      return newPlanner;
    });

    return NextResponse.json({ success: true, plannerId: result.id });
  } catch (error: any) {
    console.error("SAVE ERROR:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}