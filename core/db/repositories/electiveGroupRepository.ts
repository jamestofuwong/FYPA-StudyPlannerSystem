import { prisma } from "../client";

export async function getAllElectiveGroups() {
    return await prisma.electiveGroup.findMany({
        include: {
            units: true
        }
    });
}

export async function getElectiveGroupById(id: string) {
    return await prisma.electiveGroup.findUnique({
        where: { id },
        include: {
            units: true
        }
    });
}

export async function getElectiveGroupsByPlanner(plannerTemplateId: string) {
    return await prisma.electiveGroup.findMany({
        where: { planner_template_id: plannerTemplateId },
        include: {
            units: true
        }
    });
}

export async function createElectiveGroup(data: any) {
    return await prisma.electiveGroup.create({
        data
    });
}

export async function updateElectiveGroup(id: string, data: any) {
    return await prisma.electiveGroup.update({
        where: { id },
        data
    });
}

export async function deleteElectiveGroup(id: string) {
    return await prisma.electiveGroup.delete({
        where: { id }
    });
}