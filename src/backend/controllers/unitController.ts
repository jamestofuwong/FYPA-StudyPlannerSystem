import { NextResponse } from "next/server";
import * as unitService from "../services/unitService";

export async function getUnitsController() {
  try {
    const units = await unitService.getAllUnits();
    return NextResponse.json(units, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch units" }, { status: 500 });
  }
}

export async function createUnitController(req: Request) {
  try {
    const body = await req.json();

    const newUnit = await unitService.createUnit(body);
    return NextResponse.json(newUnit, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Server error creating unit" }, { status: 500 });
  }
}

export async function updateUnitController(req: Request, id: string) {
  try {
    const body = await req.json();

    const updatedUnit = await unitService.updateUnit(id, body);
    return NextResponse.json(updatedUnit, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update unit" }, { status: 500 });
  }
}

export async function deleteUnitController(id: string) {
  try {
    await unitService.deleteUnit(id);
    return NextResponse.json({ message: "Unit deleted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete unit" }, { status: 500 });
  }
}