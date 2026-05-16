import { NextResponse } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST or GET /auth/logout — clears the Supabase session cookies
 * and redirects to /. GET is supported so a plain `<a>` tag can
 * trigger logout without needing a form / fetch dance.
 */
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const supabase = getServerSupabase();
  if (supabase) {
    await supabase.auth.signOut().catch(() => {
      /* signOut may fail if there's no active session — harmless */
    });
  }
  return NextResponse.redirect(new URL('/', url));
}

export const GET = handle;
export const POST = handle;
