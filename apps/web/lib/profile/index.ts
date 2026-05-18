import { getServiceSupabase } from '../supabase/service';

/**
 * Server-side `profiles` table helpers.
 *
 * Kept tiny on purpose — most callers only need the user's saved
 * location to feed the weather provider. If we ever need more fields
 * (birth year, gender) downstream of the chat route, add a typed
 * getter here so the SQL column names don't leak into route handlers.
 */

export interface ProfileLocation {
  lat: number;
  lng: number;
  label?: string;
}

/**
 * Return the user's saved primary location, or null if they never
 * filled it in during onboarding. Uses the service-role client so
 * it works even from cron / scheduled contexts that have no user
 * cookie attached.
 *
 * Numeric column values come back from Supabase as JS numbers
 * already (the postgres `numeric` driver casts to number for small
 * precision), but we coerce defensively to handle any future driver
 * shift that returns strings.
 */
export async function getProfileLocation(
  userId: string,
): Promise<ProfileLocation | null> {
  const svc = getServiceSupabase();
  if (!svc) return null;

  const { data, error } = await svc
    .from('profiles')
    .select('primary_lat, primary_lng, primary_label')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;

  const lat = data.primary_lat as number | string | null;
  const lng = data.primary_lng as number | string | null;
  if (lat == null || lng == null) return null;

  const latN = typeof lat === 'string' ? Number.parseFloat(lat) : lat;
  const lngN = typeof lng === 'string' ? Number.parseFloat(lng) : lng;
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;

  return {
    lat: latN,
    lng: lngN,
    label: (data.primary_label as string | null) ?? undefined,
  };
}

export interface SaveOnboardingInput {
  userId: string;
  nickname: string;
  birthYear?: number | null;
  gender?: 'female' | 'male' | 'nonbinary' | 'prefer_not' | null;
  location?: ProfileLocation | null;
  /**
   * The legal-doc bundle version the user agreed to. Stored in
   * profiles.terms_version so a future doc revision can detect users
   * who accepted an older bundle and prompt re-consent. Omitted
   * input means "no new consent on this save" — we don't clobber an
   * existing timestamp.
   */
  termsVersion?: string;
}

/**
 * Persist a completed onboarding form into `profiles`.
 *
 * Birth year is stored as a `date` (Jan 1 of that year) since the
 * existing schema only has `birth_date` — the year-only resolution
 * is fine for our age-cohort analytics, and it avoids asking the
 * user for an exact day they probably don't want to share anyway.
 *
 * Sets `onboarded_at` to NOW() so other parts of the app can tell
 * whether the form was ever submitted.
 */
export async function saveOnboarding(
  input: SaveOnboardingInput,
): Promise<{ ok: boolean; error?: string }> {
  const svc = getServiceSupabase();
  if (!svc) return { ok: false, error: 'no_supabase' };

  const update: Record<string, unknown> = {
    nickname: input.nickname,
    onboarded_at: new Date().toISOString(),
  };
  if (input.birthYear != null) {
    update.birth_date = `${input.birthYear}-01-01`;
  }
  if (input.gender != null) {
    update.gender = input.gender;
  }
  if (input.location) {
    update.primary_lat = input.location.lat;
    update.primary_lng = input.location.lng;
    update.primary_label = input.location.label ?? null;
  }
  if (input.termsVersion) {
    // Stamp the consent moment + the doc bundle version. Both
    // columns added in supabase/migrations/20260518000001_profiles_consent_columns.
    update.terms_accepted_at = new Date().toISOString();
    update.terms_version = input.termsVersion;
  }

  const { error } = await svc.from('profiles').update(update).eq('id', input.userId);
  if (error) {
    console.error(`[profile] saveOnboarding fail: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
