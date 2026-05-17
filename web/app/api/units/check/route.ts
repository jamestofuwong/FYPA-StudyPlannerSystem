import { NextResponse } from 'next/server';
import { checkUnitsExist } from '../../../../../core/db/repositories/unitRepository';

export async function POST(req: Request) {
    const { codes } = await req.json();
    const existingCodes = await checkUnitsExist(codes);
    return NextResponse.json({ existingCodes });
}