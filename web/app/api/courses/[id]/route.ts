import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as courseRepository from "../../../../../core/db/repositories/courseRepository";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const course = await courseRepository.getCourseById(id);
        if (!course) {
            return NextResponse.json({ error: "Course not found" }, { status: 404 });
        }
        return NextResponse.json(course, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch course" }, { status: 500 });
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const body = await req.json();
        const updated = await courseRepository.updateCourse(id, body);
        return NextResponse.json(updated, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        await courseRepository.deleteCourse(id);
        return NextResponse.json({ message: "Course deleted successfully" }, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to delete course" }, { status: 500 });
    }
}