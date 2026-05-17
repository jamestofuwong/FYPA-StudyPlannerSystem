import { prisma } from "../client";

// Check if unit codes exist in the databse
export async function checkUnitsExist(codes: string[]): Promise<string[]> {
  const existingUnits = await prisma.unit.findMany({
    where: { unit_code: { in: codes } },
    select: { unit_code: true },
  });
  return existingUnits.map(u => u.unit_code);
}

// Upsert units into the global catalogue
export async function upsertUnits(units: { unit_code: string; unit_name: string }[]) {
  return await Promise.all(
    units.map(u =>
      prisma.unit.upsert({
        where: { unit_code: u.unit_code },
        update: { unit_name: u.unit_name },
        create: { unit_code: u.unit_code, unit_name: u.unit_name },
      })
    )
  );
}