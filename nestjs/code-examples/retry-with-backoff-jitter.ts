/**
 * Exponential backoff with full jitter (Q48).
 *
 * Why jitter: Without randomness, many clients that failed at the same instant
 * retry at the same instant, re-overwhelming a recovering service (thundering
 * herd). "Full jitter" spreads retries uniformly across the backoff window.
 *
 * Only retry TRANSIENT/idempotent failures (timeouts, 429, 5xx) — never 4xx
 * validation errors. Always cap attempts so retries don't amplify an outage.
 *
 * No external packages required.
 */

export interface RetryOptions {
  maxAttempts?: number; // total attempts including the first
  baseDelayMs?: number; // initial backoff unit
  maxDelayMs?: number; // cap on any single delay
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const defaultIsRetryable = (err: unknown): boolean => {
  const e = err as { name?: string; status?: number; code?: string };
  if (e?.name === 'AbortError') return true; // timeout
  if (e?.status === 429 || (e?.status && e.status >= 500)) return true;
  if (e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET') return true;
  return false;
};

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    baseDelayMs = 100,
    maxDelayMs = 10_000,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = opts;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      return await fn(attempt);
    } catch (err) {
      const exhausted = attempt >= maxAttempts;
      if (exhausted || !isRetryable(err)) throw err;

      // Exponential backoff: base * 2^(attempt-1), capped.
      const expBackoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      // Full jitter: random delay in [0, expBackoff].
      const delayMs = Math.floor(Math.random() * expBackoff);

      onRetry?.(attempt, delayMs, err);
      await sleep(delayMs);
    }
  }
}

// --- Example usage -----------------------------------------------------------
// const data = await retry(
//   () => fetch('https://api.internal/thing', { signal: AbortSignal.timeout(2000) })
//          .then((r) => { if (!r.ok) throw Object.assign(new Error('http'), { status: r.status }); return r.json(); }),
//   { maxAttempts: 5, baseDelayMs: 200, onRetry: (a, d) => console.warn(`retry #${a} in ${d}ms`) },
// );
