/**
 * Bounded concurrency for fan-out work (Q14).
 *
 * Why it matters: `await Promise.all(items.map(callDownstream))` over thousands
 * of items fires them ALL at once — exhausting DB connections, tripping API
 * rate limits, or OOM-ing the process. Cap concurrency to a value the
 * downstream can sustain (and pair with retries + idempotency).
 *
 * Two versions below: a tiny dependency-free limiter, and the `p-limit` form.
 */

// --- Dependency-free bounded map --------------------------------------------
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++; // claim the next index atomically (single thread)
      results[index] = await worker(items[index], index);
    }
  }

  // Launch up to `concurrency` runners that pull from the shared cursor.
  const pool = Array.from({ length: Math.min(concurrency, items.length) }, runner);
  await Promise.all(pool);
  return results;
}

// --- Example: process 10k records against DynamoDB at safe concurrency -------
// await mapWithConcurrency(records, 25, async (record) => {
//   return ddb.send(new PutItemCommand({ TableName: 'T', Item: toItem(record) }));
// });

// --- Equivalent using p-limit (npm i p-limit) -------------------------------
// import pLimit from 'p-limit';
// const limit = pLimit(25);
// const results = await Promise.all(
//   records.map((r) => limit(() => ddb.send(new PutItemCommand({ /* ... */ })))),
// );
