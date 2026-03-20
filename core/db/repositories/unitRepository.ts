import { prisma } from "../client";

export async function getAllUnits() {
  return await prisma.unit.findMany();
}

export async function createUnit(data: any) {
  return await prisma.unit.create({
    data
  });
}

export async function updateUnit(id: string, data: any) {
  return await prisma.unit.update({
    where: { id },
    data
  });
}

export async function deleteUnit(id: string) {
  return await prisma.unit.delete({
    where: { id }
  });
}
