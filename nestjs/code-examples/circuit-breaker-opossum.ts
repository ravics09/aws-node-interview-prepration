/**
 * Circuit breaker with fallback (Q50) using `opossum`.
 *
 * Why it matters: A slow/failing downstream causes requests to pile up and can
 * exhaust the event loop / connection pools, cascading into a full outage. A
 * circuit breaker fails fast once the downstream is unhealthy and serves a
 * fallback, giving the dependency time to recover (graceful degradation).
 *
 * Packages: opossum
 */

import CircuitBreaker from 'opossum';

// The protected operation: a call to a flaky downstream dependency.
async function fetchRecommendations(userId: string): Promise<string[]> {
  const res = await fetch(`https://recommendations.internal/users/${userId}`, {
    // Always set a timeout on outbound calls; the breaker's timeout is a
    // second line of defense, not a replacement for client timeouts.
    signal: AbortSignal.timeout(2_000),
  });
  if (!res.ok) throw new Error(`downstream ${res.status}`);
  return (await res.json()) as string[];
}

const breaker = new CircuitBreaker(fetchRecommendations, {
  timeout: 3_000, // consider a call failed if it exceeds this
  errorThresholdPercentage: 50, // open the circuit at >=50% failures
  resetTimeout: 10_000, // after opening, wait this long before half-open trial
  rollingCountTimeout: 10_000, // stats window
  volumeThreshold: 10, // don't trip on a tiny sample size
});

// Fallback used while the circuit is OPEN (or on any failure): serve safe,
// degraded data instead of an error or a hanging request.
breaker.fallback((userId: string) => {
  console.warn(`[breaker] serving fallback for ${userId}`);
  return ['popular-item-1', 'popular-item-2']; // e.g., cached/default list
});

// Observability: emit these to your metrics pipeline (Q86/Q92).
breaker.on('open', () => console.warn('[breaker] OPEN — downstream unhealthy'));
breaker.on('halfOpen', () => console.info('[breaker] HALF-OPEN — probing'));
breaker.on('close', () => console.info('[breaker] CLOSED — recovered'));
breaker.on('reject', () => console.warn('[breaker] rejected (fast-fail)'));

export async function getRecommendations(userId: string): Promise<string[]> {
  // .fire() runs through the breaker; never throws if a fallback is set.
  return breaker.fire(userId) as Promise<string[]>;
}
