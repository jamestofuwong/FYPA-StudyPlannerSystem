import { prisma } from "../client";

export async function getAllCourses() {
    return await prisma.course.findMany();
}

export async function getCourseById(id: string) {
    return await prisma.course.findUnique({
        where: { id }
    });
}

export async function createCourse(data: any) {
    return await prisma.course.create({
        data
    });
}

export async function updateCourse(id: string, data: any) {
    return await prisma.course.update({
        where: { id },
        data
    });
}

export async function deleteCourse(id: string) {
    return await prisma.course.delete({
        where: { id }
    });
}