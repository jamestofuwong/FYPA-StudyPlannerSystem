import { prisma } from "../client";

export async function getAllMajors() {
  return await prisma.major.findMany();
}

export async function createMajor(data: any) {
  return await prisma.major.create({
    data
  });
}

export async function updateMajor(id: string, data: any) {
  return await prisma.major.update({
    where: { id },
    data
  });
}

export async function deleteMajor(id: string) {
  return await prisma.major.delete({
    where: { id }
  });
}
