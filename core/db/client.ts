import { PrismaClient } from "@prisma/client";

type PrismaGlobal = typeof globalThis & {
  __prisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export const prisma = prismaGlobal.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.__prisma = prisma;
}
