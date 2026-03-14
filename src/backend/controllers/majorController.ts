import { NextResponse } from "next/server";
import * as majorService from "../services/majorService";

export async function getMajorsController() {
  try {
    const majors = await majorService.getAllMajors();
    return NextResponse.json(majors, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch majors" }, { status: 500 });
  }
}

export async function createMajorController(req: Request) {
  try {
    const body = await req.json();

    const newMajor = await majorService.createMajor(body);
    return NextResponse.json(newMajor, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Server error creating major" }, { status: 500 });
  }
}

export async function updateMajorController(req: Request, id: string) {
  try {
    const body = await req.json();
    const updatedMajor = await majorService.updateMajor(id, body);
    return NextResponse.json(updatedMajor, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update major" }, { status: 500 });
  }
}

export async function deleteMajorController(id: string) {
  try {
    await majorService.deleteMajor(id);
    return NextResponse.json({ message: "Major deleted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete major" }, { status: 500 });
  }
}