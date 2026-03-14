import { NextResponse } from "next/server";
import * as plannerService from "../services/plannerService";

export async function getPlannersController() {
  try {
    const planners = await plannerService.getAllPlanners();
    return NextResponse.json(planners, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch planner templates" }, { status: 500 });
  }
}

export async function createPlannerController(req: Request) {
  try {
    const body = await req.json();

    const newPlanner = await plannerService.createPlanner(body);
    return NextResponse.json(newPlanner, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Server error creating planner template" }, { status: 500 });
  }
}

export async function updatePlannerController(req: Request, id: string) {
  try {
    const body = await req.json();

    const updatedPlanner = await plannerService.updatePlanner(id, body);
    return NextResponse.json(updatedPlanner, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update planner template" }, { status: 500 });
  }
}

export async function deletePlannerController(id: string) {
  try {
    await plannerService.deletePlanner(id);
    return NextResponse.json({ message: "Planner template deleted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete planner template" }, { status: 500 });
  }
}