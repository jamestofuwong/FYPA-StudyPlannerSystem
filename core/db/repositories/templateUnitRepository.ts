import { prisma } from "../client";

export async function getAllTemplateUnits() {
    return await prisma.templateUnit.findMany({
        include: {
        unit: true,
        template: true
        }
    });
}

export async function getTemplateUnitById(id: string) {
    return await prisma.templateUnit.findUnique({
        where: { id },
        include: {
            unit: true,
            template: true
        }
    });
}

export async function getTemplateUnitsByPlanner(plannerTemplateId: string) {
    return await prisma.templateUnit.findMany({
        where: { planner_template_id: plannerTemplateId },
        include: {
            unit: true
        }
    });
}

export async function createTemplateUnit(data: any) {
    return await prisma.templateUnit.create({
        data
    });
}

export async function updateTemplateUnit(id: string, data: any) {
    return await prisma.templateUnit.update({
        where: { id },
        data
    });
}

export async function deleteTemplateUnit(id: string) {
    return await prisma.templateUnit.delete({
        where: { id }
    });
}