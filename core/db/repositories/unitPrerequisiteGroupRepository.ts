import { prisma } from "../client";

export async function getPrerequisiteGroupsByUnit(unitId: string) {
    return await prisma.unitPrerequisiteGroup.findMany({
        where: { unit_id: unitId },
        include: {
        conditions: true
        }
    });
}

export async function createPrerequisiteGroup(data: { unit_id: string }) {
    return await prisma.unitPrerequisiteGroup.create({
        data
    });
}

export async function deletePrerequisiteGroup(id: string) {
    return await prisma.unitPrerequisiteGroup.delete({
        where: { id }
    });
}