/**
 * Edge Functions scale by spinning up extra isolates under concurrent load, each opening its
 * own Postgres connections (see db.ts) — Supabase's connection/pooler ceiling can be hit in
 * bursts (e.g. auto-trade-tick's 5s cron overlapping with dashboard/execute polling from
 * multiple open tabs), which surfaces as a transient connection error. Retrying a read a couple
 * of times with a short backoff self-heals those bursts instead of surfacing a 500 to the user.
 *
 * Only ever wrap idempotent reads with this — retrying a write risks double-applying it if the
 * first attempt actually succeeded server-side before the error reached the client.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 150): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < attempts - 1) {
        const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
