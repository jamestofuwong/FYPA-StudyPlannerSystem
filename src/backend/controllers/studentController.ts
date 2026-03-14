import { NextResponse } from "next/server";
import { getMockStudent } from "../services/studentService";

export async function getMockStudentController() {
  try {
    const studentData = getMockStudent();
    return NextResponse.json(studentData, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate mock student data" },
      { status: 500 }
    );
  }
}