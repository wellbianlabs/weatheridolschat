import { NextResponse } from 'next/server';

import { CHARACTER_LIST } from '@wi/core/characters';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { characters: CHARACTER_LIST },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
