import { prisma } from "../client";

export async function getAllPlanners() {
  return await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true,
      _count: {
        select: { units: true }
      }
    }
  });
}

export async function getAllPlannersWithUnits() {
  return await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true,
      units: {
        include: { unit: true }
      },
      elective_groups: {
        include: {
          units: {
            include: { unit: true }
          }
        }
      }
    }
  });
}

export async function getPlannerById(id: string) {
  return await prisma.plannerTemplate.findUnique({
    where: { id },
    include: {
      course: true,
      major: true,
      units: {
        include: {
          unit: true
        }
      }
    }
  });
}

export async function createPlanner(data: any) {
  return await prisma.plannerTemplate.create({
    data
  });
}

export async function updatePlanner(id: string, data: any) {
  return await prisma.plannerTemplate.update({
    where: { id },
    data
  });
}

export async function deletePlanner(id: string) {
  return await prisma.plannerTemplate.delete({
    where: { id }
  });
}

export async function getPlannersByCourse(courseId: string) {
  return await prisma.plannerTemplate.findMany({
    where: { course_id: courseId },
    include: {
      course: true,
      major: true
    }
  });
}

export type PlannerImportInput = {
  course_information: {
    course: string;
    course_name?: string;
    major: string;
    intake_year: string | number;
  };
  categories: {
    core_units?: any[];
    major_units?: any[];
    mpu_group?: any[];
    wil_group?: any[];
    elective_groups?: {
      prescribed_elective?: any[];
      elective?: any[];
    };
  };
};

export async function savePlannerFromImport(planner: PlannerImportInput) {
  const { course_information, categories } = planner;

  return await prisma.$transaction(async (tx) => {
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
        intake_year: parseInt(String(course_information.intake_year)) || 2025,
      },
    });

    const allUnits = [
      ...(categories.core_units?.map((u: any) => ({ ...u, cat: 'core' })) ?? []),
      ...(categories.major_units?.map((u: any) => ({ ...u, cat: 'major_core' })) ?? []),
      ...(categories.mpu_group?.map((u: any) => ({ ...u, cat: 'mpu' })) ?? []),
      ...(categories.wil_group?.map((u: any) => ({ ...u, cat: 'wil' })) ?? []),
      ...(categories.elective_groups?.prescribed_elective?.map((u: any) => ({ ...u, cat: 'prescribed_elective' })) ?? []),
      ...(categories.elective_groups?.elective?.map((u: any) => ({ ...u, cat: 'elective' })) ?? []),
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
}
