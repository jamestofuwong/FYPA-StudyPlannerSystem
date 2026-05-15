import { PrismaClient } from '@local/prisma-client';

type PrismaGlobal = typeof globalThis & { __cloudPrisma?: PrismaClient };
const g = globalThis as PrismaGlobal;

export const db = g.__cloudPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  g.__cloudPrisma = db;
}
