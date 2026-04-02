import { prisma } from "../client";

export async function getAllPlanners() {
  return await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true
    }
  });
}

export async function getPlannerById(id: string) {
  return await prisma.plannerTemplate.findUnique({
    where: { id },
    include: {
      course: true,
      major: true,
      units: true
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
