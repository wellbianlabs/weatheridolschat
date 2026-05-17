import { NextResponse } from 'next/server';

import { saveOnboarding } from '@/lib/profile';
import { resolveUser } from '@/lib/supabase/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/me/onboarding
 *
 * Persists the onboarding form into the caller's `profiles` row.
 * The form is auth-gated — anon users are handled client-side via
 * localStorage (see apps/web/app/onboarding/page.tsx) since we
 * don't want to orphan profile rows for visitors who never sign up.
 *
 * Body:
 *   {
 *     nickname:  string                                     // required
 *     birthYear: number | null                              // optional, 4 digits
 *     gender:    'female'|'male'|'nonbinary'|'prefer_not'|null
 *     location:  { lat: number, lng: number, label?: string } | null
 *   }
 */
interface Body {
  nickname?: string;
  birthYear?: number | null;
  gender?: string | null;
  location?: { lat?: number; lng?: number; label?: string } | null;
}

const VALID_GENDERS = ['female', 'male', 'nonbinary', 'prefer_not'] as const;

export async function POST(req: Request): Promise<Response> {
  const caller = await resolveUser();
  if (!caller) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Login required' } },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  if (!nickname) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'nickname required' } },
      { status: 400 },
    );
  }
  if (nickname.length > 20) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'nickname too long (max 20)' } },
      { status: 400 },
    );
  }

  // Birth year: only accept reasonable bounds. Anything else → null.
  // The form already filters but we re-validate server-side because
  // form values are user-controllable.
  const thisYear = new Date().getFullYear();
  const birthYear =
    typeof body.birthYear === 'number' &&
    Number.isFinite(body.birthYear) &&
    body.birthYear >= thisYear - 100 &&
    body.birthYear <= thisYear - 7
      ? body.birthYear
      : null;

  // Gender: strict enum match.
  const gender =
    typeof body.gender === 'string' &&
    (VALID_GENDERS as readonly string[]).includes(body.gender)
      ? (body.gender as (typeof VALID_GENDERS)[number])
      : null;

  // Location: validate coordinate bounds. Reject anything off-planet
  // before it lands in the DB.
  let location: { lat: number; lng: number; label?: string } | null = null;
  if (
    body.location &&
    typeof body.location.lat === 'number' &&
    typeof body.location.lng === 'number' &&
    Number.isFinite(body.location.lat) &&
    Number.isFinite(body.location.lng) &&
    body.location.lat >= -90 &&
    body.location.lat <= 90 &&
    body.location.lng >= -180 &&
    body.location.lng <= 180
  ) {
    location = {
      lat: body.location.lat,
      lng: body.location.lng,
      label:
        typeof body.location.label === 'string'
          ? body.location.label.slice(0, 60)
          : undefined,
    };
  }

  const result = await saveOnboarding({
    userId: caller.id,
    nickname,
    birthYear,
    gender,
    location,
  });

  if (!result.ok) {
    // The single failure case that's user-actionable is a nickname
    // collision — `profiles.nickname` has a citext unique index. The
    // Postgres error code for that is 23505 but Supabase's lib only
    // surfaces it through error.message text. Match on the column
    // name to keep the user-facing message specific.
    const msg = result.error ?? 'save_failed';
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
      return NextResponse.json(
        {
          error: {
            code: 'nickname_taken',
            message: '이미 사용 중인 닉네임이에요. 다른 닉네임으로 시도해주세요.',
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'save_failed', message: msg } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
