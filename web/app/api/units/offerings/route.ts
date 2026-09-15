import { NextResponse } from 'next/server';
import { addUnitOffering, removeUnitOffering } from '../../../../../core/db/repositories/unitRepository';

// POST Add an offering
export async function POST(req: Request) {
  try {
    const { unit_id, term } = await req.json();
    if (!unit_id || !term) {
      return NextResponse.json({ error: 'Missing unit_id or term' }, { status: 400 });
    }
    await addUnitOffering(unit_id, Number(term));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Add offering failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to add offering' }, { status: 500 });
  }
}

// DELETE Remove an offering
export async function DELETE(req: Request) {
  try {
    const { unit_id, term } = await req.json();
    if (!unit_id || !term) {
      return NextResponse.json({ error: 'Missing unit_id or term' }, { status: 400 });
    }
    await removeUnitOffering(unit_id, Number(term));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Remove offering failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to remove offering' }, { status: 500 });
  }
}
