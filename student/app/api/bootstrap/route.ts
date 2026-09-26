import { NextResponse } from 'next/server'
import { getCatalog } from '@student/lib/catalog'

export async function GET() {
  const catalog = await getCatalog()
  return NextResponse.json(catalog, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
