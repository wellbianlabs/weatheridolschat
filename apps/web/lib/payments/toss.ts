/**
 * Toss Payments REST client.
 *
 * Phase 4 ships an abstraction layer (initCheckout / confirmPayment)
 * so we can run the entire UI + DB flow against a "mock" provider
 * while waiting for Toss merchant approval. The moment the operator
 * sets `TOSS_SECRET_KEY` (+ public client key) in Vercel, every
 * checkout switches from mock-redirect to a real Toss Payments
 * session.
 *
 * Toss API reference: https://docs.tosspayments.com/reference
 *
 * Auth: HTTP Basic with the secret key as the username and an empty
 * password. The key starts with `test_sk_...` for the sandbox and
 * `live_sk_...` for production.
 */

interface TossConfirmResponse {
  paymentKey: string;
  orderId: string;
  status: 'READY' | 'IN_PROGRESS' | 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'FAILED' | 'ABORTED';
  totalAmount: number;
  method?: string;
  approvedAt?: string;
  receipt?: { url?: string };
  card?: { number?: string; issuerCode?: string };
  failure?: { code?: string; message?: string };
}

export function isTossConfigured(): boolean {
  return Boolean(process.env.TOSS_SECRET_KEY);
}

function authHeader(): string {
  const key = process.env.TOSS_SECRET_KEY ?? '';
  // Toss expects `Basic base64(secretKey + ':')` — note the trailing
  // colon (empty password). Easy to forget.
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

/**
 * Confirm a one-time payment.
 *
 * Toss returns a paymentKey + orderId when the user finishes their
 * payment widget; we POST them back to /v1/payments/confirm to
 * actually capture the charge. Without this call the charge is
 * abandoned after ~15 minutes.
 */
export async function tossConfirmPayment(opts: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossConfirmResponse> {
  if (!isTossConfigured()) {
    throw new Error('Toss is not configured (TOSS_SECRET_KEY missing).');
  }
  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opts),
  });
  const json = (await res.json()) as TossConfirmResponse & {
    code?: string;
    message?: string;
  };
  if (!res.ok) {
    const msg = (json.message ?? json.failure?.message) ?? `HTTP ${res.status}`;
    throw new Error(`Toss confirm failed: ${msg}`);
  }
  return json;
}

/**
 * Build the URL a checkout button should navigate to when in mock
 * mode (TOSS_SECRET_KEY not set yet). Renders an in-app
 * "mock-checkout" page that lets the operator simulate
 * success/failure without leaving the app.
 */
export function buildMockCheckoutUrl(orderId: string, returnTo: string): string {
  const u = new URL('/mock-checkout', 'http://placeholder');
  u.searchParams.set('orderId', orderId);
  u.searchParams.set('returnTo', returnTo);
  // The host gets replaced by the client when it navigates — this
  // helper just produces the path + query.
  return `${u.pathname}?${u.searchParams.toString()}`;
}
