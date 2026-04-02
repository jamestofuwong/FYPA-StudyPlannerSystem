import { NextResponse } from "next/server";
import * as courseRepository from "../../../../core/db/repositories/courseRepository";

export async function GET() {
    try {
        const courses = await courseRepository.getAllCourses();
        return NextResponse.json(courses, { status: 200 });
    } catch {
        return NextResponse.json({ error: "Failed to fetch courses" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const newCourse = await courseRepository.createCourse(body);
        return NextResponse.json(newCourse, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error creating course" }, { status: 500 });
    }
}