import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getAllPlanners() {
  return await prisma.plannerTemplate.findMany({
    include: {
      course: true,
      major: true
    }
  });
}

export async function createPlanner(data: any) {
  return await prisma.plannerTemplate.create({
    data: data
  });
}

export async function updatePlanner(id: string, data: any) {
  return await prisma.plannerTemplate.update({
    where: { id: id },
    data: data
  });
}

export async function deletePlanner(id: string) {
  return await prisma.plannerTemplate.delete({
    where: { id: id }
  });
}