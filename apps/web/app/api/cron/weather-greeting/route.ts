import { NextResponse } from 'next/server';

import { CHARACTERS, type CharacterId } from '@wi/core/characters';
import { formatKstLocalTime } from '@wi/core/time';
import {
  buildScheduledGreetingUserPrompt,
  pickChatAdapter,
  SCHEDULED_SLOTS,
  SLOT_LABEL,
  SYSTEM_PROMPTS,
  type ScheduledSlot,
} from '@wi/ai';
import { getCurrentWeather } from '@wi/weather';

import {
  getLastChattedCharacter,
  insertScheduledMessage,
  kstDateString,
  listActivePremiumUsers,
  type ActivePremiumUser,
} from '@/lib/scheduled';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel: this is the slowest endpoint in the app — generating a
// greeting per Premium user is N×LLM-call serial work. Reserve the
// full 300s Pro-plan budget.
export const maxDuration = 300;

/**
 * POST/GET /api/cron/weather-greeting?slot=<slot>
 *
 * Vercel Cron entrypoint. Four times a day Vercel calls this with one
 * of the four slot values; we enumerate Premium users, find each
 * user's most-recent-character, generate a short Korean greeting via
 * Claude, and persist it to `scheduled_messages`. The chat client
 * picks the row up on its next poll and renders it in the bubble
 * stream.
 *
 * Why both GET and POST: Vercel Cron historically uses GET but their
 * docs show POST too. Supporting both means we don't have to
 * rediscover this on a future Vercel platform tweak.
 *
 * Auth: the `Authorization: Bearer ${CRON_SECRET}` header is set by
 * Vercel automatically when the `crons` array in vercel.json fires
 * this URL. We refuse anything without that exact header so the
 * endpoint isn't a public LLM-spend faucet.
 */
export async function POST(req: Request): Promise<Response> {
  return handle(req);
}
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}

async function handle(req: Request): Promise<Response> {
  // ── Auth ────────────────────────────────────────────────────────────
  // Vercel Cron sets `Authorization: Bearer ${CRON_SECRET}`. Local
  // dev callers can pass the same header manually. We compare with a
  // constant-time-ish guard (string equality is fine for the secret
  // length we're using).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    const expected = `Bearer ${cronSecret}`;
    if (auth !== expected) {
      console.warn('[cron-greeting] auth failed: header mismatch');
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Invalid cron token' } },
        { status: 401 },
      );
    }
  } else {
    // CRON_SECRET not set — log a loud warning so the operator notices,
    // but still execute. Vercel sets this for production crons; running
    // without it locally is fine for testing.
    console.warn(
      '[cron-greeting] CRON_SECRET not configured — endpoint is unauthenticated. OK for local dev, NOT for prod.',
    );
  }

  // ── Slot resolution ────────────────────────────────────────────────
  const slotParam = new URL(req.url).searchParams.get('slot');
  if (!isSlot(slotParam)) {
    return NextResponse.json(
      {
        error: {
          code: 'bad_slot',
          message: `slot must be one of: ${SCHEDULED_SLOTS.join(', ')}`,
        },
      },
      { status: 400 },
    );
  }
  const slot: ScheduledSlot = slotParam;
  const slotDate = kstDateString();
  console.info(
    `[cron-greeting] start slot=${slot} (${SLOT_LABEL[slot]}) kst_date=${slotDate}`,
  );

  // ── Eligible audience ──────────────────────────────────────────────
  const audience = await listActivePremiumUsers();
  if (audience.length === 0) {
    console.info('[cron-greeting] no Premium users — nothing to do');
    return NextResponse.json({ slot, slotDate, processed: 0, sent: 0, skipped: 0 });
  }
  console.info(`[cron-greeting] audience size=${audience.length}`);

  // ── Required env for the actual content generation ─────────────────
  // If we don't have a chat key the cron is a no-op rather than a
  // failure — Vercel will retry, but we don't want it to keep failing
  // loudly while the operator is setting up keys.
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || undefined;
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const openWeatherMapApiKey = process.env.OPENWEATHERMAP_API_KEY || undefined;
  const kweatherApiKey =
    process.env.KW_API_KEY || process.env.KWEATHER_API_KEY || undefined;
  const mockMode = process.env.MOCK_MODE !== 'false';
  if (!mockMode && !anthropicApiKey && !geminiApiKey) {
    console.error(
      '[cron-greeting] no chat provider key configured — cannot generate greetings. set ANTHROPIC_API_KEY or GEMINI_API_KEY.',
    );
    return NextResponse.json(
      { slot, slotDate, error: 'no_chat_provider', processed: 0, sent: 0, skipped: audience.length },
      { status: 503 },
    );
  }

  // Use the same premium-tier adapter the live chat uses. Subscribed
  // users got the Claude experience while typing — let the scheduled
  // ping match that quality.
  const adapter = pickChatAdapter({
    tier: 'premium',
    mockMode,
    anthropicApiKey,
    geminiApiKey,
  });
  console.info(`[cron-greeting] adapter=${adapter.id} mockMode=${mockMode}`);

  // ── Process every eligible user ────────────────────────────────────
  // Sequential on purpose. Concurrent LLM calls would burn quotas and
  // are pointless for a 4×/day job. If the audience ever grows large
  // enough that this takes > maxDuration, we'll batch in chunks of N
  // and chain cron pages.
  let sent = 0;
  let skippedNoSession = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  for (const user of audience) {
    try {
      const result = await processOneUser({
        user,
        slot,
        slotDate,
        mockMode,
        kweatherApiKey,
        openWeatherMapApiKey,
        adapter,
      });
      if (result === 'inserted') sent++;
      else if (result === 'no_session') skippedNoSession++;
      else if (result === 'duplicate') skippedDuplicate++;
      else failed++;
    } catch (err) {
      console.error(
        `[cron-greeting] user=${user.userId.slice(0, 8)}… error: ${(err as Error).message}`,
      );
      failed++;
    }
  }

  const summary = {
    slot,
    slotDate,
    processed: audience.length,
    sent,
    skippedNoSession,
    skippedDuplicate,
    failed,
  };
  console.info(`[cron-greeting] done ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}

type AdapterArg = ReturnType<typeof pickChatAdapter>;

async function processOneUser(args: {
  user: ActivePremiumUser;
  slot: ScheduledSlot;
  slotDate: string;
  mockMode: boolean;
  kweatherApiKey?: string;
  openWeatherMapApiKey?: string;
  adapter: AdapterArg;
}): Promise<'inserted' | 'duplicate' | 'no_session' | 'error'> {
  const { user, slot, slotDate, mockMode, kweatherApiKey, openWeatherMapApiKey, adapter } = args;
  const tag = `[cron-greeting] u=${user.userId.slice(0, 8)}…`;

  // 1. Last-chatted character — skip silently if the user never started
  //    a conversation. The chat-route wires findOrCreateSession on
  //    every chat turn so this only happens for never-spoken-to-anyone.
  const characterId = await getLastChattedCharacter(user.userId);
  if (!characterId) {
    console.info(`${tag} skip: no session`);
    return 'no_session';
  }
  const character = CHARACTERS[characterId as CharacterId];
  if (!character) {
    console.warn(`${tag} skip: unknown character "${characterId}"`);
    return 'no_session';
  }

  // 2. Weather — use the user's saved primary location, or Seoul as a
  //    sensible default. Mock mode short-circuits to a fixture inside
  //    `getCurrentWeather` so cron runs work offline.
  const point =
    user.primaryLat != null && user.primaryLng != null
      ? { lat: user.primaryLat, lng: user.primaryLng, label: user.primaryLabel ?? '한국' }
      : { lat: 37.498, lng: 127.028, label: '서울 강남구' };
  const weather = await getCurrentWeather(point, {
    mockMode,
    kweatherApiKey,
    openWeatherMapApiKey,
  });

  // 3. Generate the greeting via the same adapter the live chat uses,
  //    so the character voice stays consistent. We feed the slot brief
  //    as the "user message" rather than amending the system prompt —
  //    the model treats it as a one-off directive instead of a
  //    permanent personality shift.
  const userPrompt = buildScheduledGreetingUserPrompt({
    slot,
    weather,
    nickname: user.nickname,
  });

  const tStart = Date.now();
  let content = '';
  try {
    for await (const evt of adapter.stream({
      character,
      characterSystemPrompt: SYSTEM_PROMPTS[character.id],
      weather,
      history: [],
      user: {
        nickname: user.nickname,
        locale: 'ko',
        localTime: formatKstLocalTime(),
        tier: 'premium',
      },
      userMessage: userPrompt,
      ids: { userMessageId: 'scheduled-prompt', assistantMessageId: 'scheduled-reply' },
    })) {
      // We accept any event that carries a string `delta` to be
      // forward-compatible with adapter event-shape tweaks. The
      // Mock + Claude + Gemini adapters all emit `{ type: 'token',
      // delta: '…' }` chunks.
      const maybeDelta = (evt as { delta?: unknown }).delta;
      if (typeof maybeDelta === 'string') content += maybeDelta;
    }
  } catch (err) {
    console.error(`${tag} adapter fail: ${(err as Error).message}`);
    return 'error';
  }
  content = content.trim();
  if (!content) {
    console.warn(`${tag} adapter returned empty content — skipping`);
    return 'error';
  }
  console.info(
    `${tag} char=${characterId} ms=${Date.now() - tStart} chars=${content.length}`,
  );

  // 4. Persist. `insertScheduledMessage` swallows duplicate-key
  //    violations so cron retries on the same KST day deduplicate
  //    naturally.
  const result = await insertScheduledMessage({
    userId: user.userId,
    characterId,
    slot,
    slotDate,
    content,
    weatherSnapshot: weather,
  });
  return result;
}

function isSlot(v: string | null): v is ScheduledSlot {
  return v !== null && (SCHEDULED_SLOTS as readonly string[]).includes(v);
}
