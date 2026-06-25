# Amazon ElastiCache (Redis) + Node.js

## What it is
A fully managed in-memory data store (Redis or Memcached). With **Redis** you get rich data structures, persistence, replication with automatic failover, and **Pub/Sub** — making it a Swiss-army knife for caching, sessions, rate limiting, leaderboards, locks, and a WebSocket backplane.

## How we use it with Node.js
Connect with **`ioredis`** (robust, supports cluster mode, pub/sub, pipelines). Instantiate the client once and reuse it. ElastiCache lives in your VPC, so your Lambda/ECS must be in the same VPC with security-group access.

## For what purpose (real use cases)
- **Cache-aside** for hot reads (offload the database).
- **Session store** shared across a stateless fleet.
- **Rate limiting** (shared counters across all instances).
- **Leaderboards / counters** (sorted sets, atomic increments).
- **Distributed locks** (single-flight, prevent duplicate work).
- **Pub/Sub backplane** for multi-instance WebSocket broadcasting.

## Code

### 1. Setup (reuse one client)
```ts
import Redis from 'ioredis';
export const redis = new Redis({
  host: process.env.REDIS_HOST!,
  port: 6379,
  tls: process.env.REDIS_TLS ? {} : undefined, // in-transit encryption
  maxRetriesPerRequest: 2,
});
```

### 2. Cache-aside pattern
```ts
async function getProduct(id: string) {
  const key = `product:${id}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);          // cache hit

  const product = await db.findProduct(id);        // cache miss -> DB
  // jittered TTL to avoid synchronized expiry (cache stampede)
  await redis.set(key, JSON.stringify(product), 'EX', 300 + Math.floor(Math.random() * 60));
  return product;
}

// Invalidate on write
async function updateProduct(id: string, data: any) {
  await db.update(id, data);
  await redis.del(`product:${id}`);
}
```

### 3. Distributed rate limiter (sliding-ish via INCR + EXPIRE)
```ts
async function allow(userId: string, limit = 100, windowSec = 60): Promise<boolean> {
  const key = `rl:${userId}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  return count <= limit;
}
```

### 4. Distributed lock (single-flight to prevent cache stampede)
```ts
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
  const token = crypto.randomUUID();
  // SET NX EX = acquire only if absent, auto-expire to avoid deadlock
  const acquired = await redis.set(`lock:${key}`, token, 'EX', 10, 'NX');
  if (!acquired) return null;                      // someone else holds it
  try { return await fn(); }
  finally {
    // release only if we still own it (atomic check-and-delete)
    await redis.eval(`if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`, 1, `lock:${key}`, token);
  }
}
```

### 5. Pub/Sub backplane for WebSocket broadcasting
```ts
const pub = new Redis({ host: process.env.REDIS_HOST });
const sub = new Redis({ host: process.env.REDIS_HOST });

// Every app instance subscribes; any instance can publish.
sub.subscribe('broadcast');
sub.on('message', (_channel, message) => {
  const { room, data } = JSON.parse(message);
  io.to(room).emit('update', data);   // deliver to locally-connected sockets
});

export const broadcast = (room: string, data: unknown) =>
  pub.publish('broadcast', JSON.stringify({ room, data }));
```

## Lead-level notes & gotchas
- **Local in-memory cache is per-instance** (inconsistent across a fleet) → use Redis for shared state.
- **Cache stampede:** jittered TTLs + single-flight locks + stale-while-revalidate; warm hot keys after a flush/deploy.
- **Always set TTLs** and a clear **invalidation strategy** — stale data is the hard part.
- Redis is **single-threaded per shard** → never run blocking commands (`KEYS *`, big `SMEMBERS`) in production; use `SCAN`.
- Use **cluster mode** to shard large datasets; enable **Multi-AZ with automatic failover** for HA.
- Separate **pub** and **sub** connections (a subscribed connection can't run normal commands).
- Encrypt **in transit (TLS)** and **at rest**; keep ElastiCache in private subnets.
