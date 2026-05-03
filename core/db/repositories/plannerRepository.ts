import { prisma } from "../client";
import type { PlannerImportPlanner } from "../../shared/types/plannerImport";

function normaliseImportedUnitCode(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const code = value.trim().toUpperCase().replace(/[@#]+$/g, "");
  if (!code || code === "-" || code === "NONE") return null;
  if (/^ELECTIVE\s+\d+$/i.test(code)) return null;

  return code;
}

function toPlannerNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function getAllPlanners() {
  return await prisma.plannerTemplate.findMany({
    orderBy: {
      created_at: "desc",
    },
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

export async function savePlannerFromImport(planner: PlannerImportPlanner) {
  const { course_information, categories } = planner;
  const courseCode = course_information.course?.trim();
  const majorName = course_information.major?.trim() || "General Program";

  if (!courseCode) {
    throw new Error("Cannot save planner: missing course information.");
  }

  return await prisma.$transaction(async (tx) => {
    const course = await tx.course.upsert({
      where: { code: courseCode },
      update: {},
      create: {
        code: courseCode,
        name: courseCode,
      },
    });

    const major = await tx.major.upsert({
      where: {
        course_id_name: {
          course_id: course.id,
          name: majorName,
        },
      },
      update: {},
      create: {
        name: majorName,
        course_id: course.id,
      },
    });

    const newPlanner = await tx.plannerTemplate.create({
      data: {
        course_id: course.id,
        major_id: major.id,
        intake_year: course_information.intake_year ?? 2025,
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

    const attachedUnitIds = new Set<string>();

    for (const u of allUnits) {
      const unitCode = normaliseImportedUnitCode(u.unit_code);
      if (!unitCode) continue;

      const unitDef = await tx.unit.upsert({
        where: { unit_code: unitCode },
        update: { unit_name: u.unit_name || 'Unknown Unit' },
        create: {
          unit_code: unitCode,
          unit_name: u.unit_name || 'Unknown Unit',
        },
      });

      if (attachedUnitIds.has(unitDef.id)) continue;
      attachedUnitIds.add(unitDef.id);

      await tx.templateUnit.create({
        data: {
          planner_template_id: newPlanner.id,
          unit_id: unitDef.id,
          category: u.cat,
          year_level: toPlannerNumber(u.year_level, 1),
          semester: toPlannerNumber(u.semester, 1),
        },
      });
    }

    return newPlanner;
  });
}
