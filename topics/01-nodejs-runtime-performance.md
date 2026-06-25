# 1. Core Node.js Runtime, Event Loop & Performance (Q1–Q15)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Next:** [2. NestJS & Express.js →](./02-nestjs-expressjs.md)

---

## 1. Core Node.js Runtime, Event Loop & Performance

### Q1. Explain the Node.js event loop in depth. What are its phases and why does it matter for a backend lead?

**Short answer:** Node.js uses a single-threaded, non-blocking event loop (libuv) with distinct phases. Understanding it is essential to diagnose latency, throughput, and "why is my service slow under load" problems.

**Detailed answer:**
Node.js runs JavaScript on a single main thread but offloads I/O to the OS / a libuv thread pool. The event loop cycles through ordered phases on each tick:

1. **Timers** — executes callbacks scheduled by `setTimeout` / `setInterval`.
2. **Pending callbacks** — executes I/O callbacks deferred from the previous loop.
3. **Idle/prepare** — internal use.
4. **Poll** — retrieves new I/O events and executes most I/O callbacks; this is where the loop spends most time and may block waiting for events.
5. **Check** — executes `setImmediate` callbacks.
6. **Close callbacks** — e.g., `socket.on('close')`.

Between *every* phase (and between each callback), Node drains the **microtask queues**: `process.nextTick()` first, then resolved Promise callbacks. `process.nextTick` can starve the loop if abused.

**Why it matters as a lead:** A single CPU-heavy function (JSON parsing of a huge payload, synchronous crypto, regex backtracking) blocks the *entire* loop, so every concurrent request stalls. Leads must teach the team to keep the loop free: stream large payloads, move CPU work to Worker Threads or a separate service, and never use sync FS/crypto calls in request paths.

**Real-time use case:** A reporting endpoint that synchronously built a 50MB Excel file froze the whole API for ~800ms per call. Fix: offload generation to a worker/queue + S3, return a pre-signed URL.

---

### Q2. What is the difference between the libuv thread pool and Worker Threads? When do you use each?

**Short answer:** The libuv thread pool handles certain async I/O (FS, DNS, some crypto/zlib) under the hood; Worker Threads let you run *your* JavaScript on separate threads for CPU-bound work.

**Detailed answer:**
- **libuv thread pool** (default size 4, tunable via `UV_THREADPOOL_SIZE`) backs operations like `fs.*` async calls, `crypto.pbkdf2`, `zlib`, and DNS lookups via `getaddrinfo`. You don't write threads — Node uses them internally. If you exceed the pool size with concurrent FS/crypto work, requests queue and latency spikes.
- **Worker Threads** (`worker_threads` module) are real V8 isolates with their own event loop and memory, communicating via message passing or `SharedArrayBuffer`. Use them for **CPU-bound** JS: image processing, encryption, large data transforms, parsing.

**When to use each:**
- Image/PDF processing, compression, ML inference in-process → Worker Threads (or better, offload to a dedicated service / Lambda).
- Many concurrent file reads or `crypto.pbkdf2` for password hashing → increase `UV_THREADPOOL_SIZE` and benchmark.

**Lead-level insight:** Worker Threads share a process and thus a memory/crash domain; for true isolation and independent scaling, a separate microservice or Lambda is often the better architectural choice. Don't reach for Worker Threads as the first answer to "scaling."

---

### Q3. How do you diagnose and fix a memory leak in a long-running Node.js service?

**Short answer:** Reproduce under load, capture heap snapshots over time, diff them to find growing retained objects, and fix the retaining references.

**Detailed answer:**
1. **Confirm the leak:** Watch RSS/heapUsed trend (`process.memoryUsage()`, CloudWatch container memory, or `--max-old-space-size` crashes). A leak shows monotonic growth that doesn't recover after GC.
2. **Capture evidence:** Use `node --inspect` + Chrome DevTools, `heapdump`, or `clinic.js`. Take 2–3 heap snapshots at intervals under steady load and **diff** them. Look at the "retained size" and "objects allocated between snapshots."
3. **Common culprits:**
   - Unbounded caches / `Map` that never evicts (use LRU with max size).
   - Event listeners added per request without removal (`emitter.setMaxListeners` warning).
   - Closures capturing large objects.
   - Global arrays accumulating data.
   - Timers (`setInterval`) never cleared.
4. **Fix and verify:** Patch the retaining reference, re-run the load test, confirm flat memory.

**Real-time use case:** A WebSocket gateway leaked because disconnected sockets were kept in a global `connections` array. Fix: remove on `close` event and add an LRU + periodic sweep.

**Lead-level insight:** In containerized AWS (ECS/Fargate/EKS), set a memory limit and let the orchestrator restart unhealthy tasks as a *safety net*, but treat restarts as a symptom, not a fix. Add a memory-growth CloudWatch alarm.

---

### Q4. What causes high event-loop latency and how do you measure it in production?

**Short answer:** Synchronous CPU work or microtask flooding blocks the loop; measure with `perf_hooks` event-loop delay monitor or APM tools.

**Detailed answer:**
Event-loop **lag** is the delay between when a callback *should* run and when it *does*. High lag means requests wait even when CPU isn't saturated.

**Measurement:**
- `perf_hooks.monitorEventLoopDelay()` gives a histogram (p50/p99) you can publish to CloudWatch as a custom metric.
- APM tools (Datadog, New Relic, AWS X-Ray with extensions) report event-loop lag automatically.
- A quick gauge: schedule a `setInterval` and measure drift.

**Causes & fixes:**
- Large synchronous JSON.parse/stringify → stream or paginate.
- Sync crypto/hashing in request path → use async variants / offload.
- `process.nextTick`/Promise recursion starving the loop → yield with `setImmediate`.
- Tight CPU loops → Worker Threads or a separate service.

**Lead-level insight:** Set an SLO on p99 event-loop delay (e.g., < 50ms) and alarm on it. It's often a *leading* indicator of latency problems before user-facing p99 degrades.

---

### Q5. Compare `cluster` module, PM2, and container-based horizontal scaling. What do you choose on AWS and why?

**Short answer:** Use the `cluster`/PM2 model to use all CPU cores on a single host; use containers + an orchestrator (ECS/EKS) + a load balancer for true horizontal scaling and resilience. On AWS I generally prefer one process per container and scale containers.

**Detailed answer:**
- **`cluster` module:** Forks N worker processes sharing a port; the master distributes connections. Lets a single Node process use multiple cores (Node is single-threaded per process).
- **PM2:** A process manager that wraps cluster mode, adds restarts, log management, zero-downtime reload. Great on a single VM/EC2 instance.
- **Containers + ECS/EKS:** Run many single-process containers behind an ALB, scale with Auto Scaling based on CPU/requests. Each task is independently replaceable and health-checked.

**AWS choice & rationale:**
- On **EC2** without containers: PM2/cluster to use all cores, plus an Auto Scaling Group for horizontal scale.
- On **ECS Fargate/EKS:** Prefer **one Node process per container** and let the orchestrator scale tasks. This keeps the failure domain small, makes metrics per-task clean, and aligns with 12-factor. You can still right-size vCPU so one process matches the allocated cores.

**Lead-level insight:** Running `cluster` *inside* a container that's also being horizontally scaled doubles the scaling logic and complicates resource limits. Pick one axis of scaling per layer.

---

### Q6. How do you handle CPU-bound tasks in a Node.js API without blocking other requests?

**Short answer:** Offload them — Worker Threads for in-process, or (better at scale) a queue + separate worker fleet / Lambda.

**Detailed answer:**
Options in increasing order of isolation:
1. **Worker Threads** — keep it in-process but off the main loop. Good for moderate CPU bursts.
2. **Child process / separate microservice** — stronger isolation, independent deploy/scale.
3. **Async job pattern** — the API enqueues a message (SQS), returns `202 Accepted` with a job ID, and a worker fleet (ECS service or Lambda) processes it. The client polls or receives a webhook/WebSocket notification.

**Real-time use case:** Video transcoding or thumbnail generation: API uploads to S3, drops an SQS message, a worker (or AWS MediaConvert / Lambda) processes, then writes result + notifies via SNS/WebSocket. The API thread never blocks.

**Lead-level insight:** The interview signal is recognizing that "CPU-bound + single-threaded request handler" demands *architectural* offloading, not just code tweaks. Mention backpressure and idempotency for the queue path.

---

### Q7. Explain backpressure in Node.js streams and why it matters.

**Short answer:** Backpressure is the mechanism that slows a fast producer when a slow consumer can't keep up, preventing unbounded memory growth.

**Detailed answer:**
Node streams are the idiomatic way to process data incrementally (files, HTTP bodies, S3 objects). When you `pipe()` a readable into a writable, if the writable's internal buffer fills (`write()` returns `false`), the readable pauses until a `drain` event. This is backpressure.

If you **bypass** it — e.g., reading an entire 2GB S3 object into memory, or pushing to a stream faster than it drains without honoring the return value — memory balloons and the process can OOM-crash.

**Real-time use case:** Streaming a large CSV from S3 → transform → write to another S3 object using `stream.pipeline()` keeps memory flat regardless of file size. Use `pipeline()` (not raw `pipe()`) because it propagates errors and cleans up file descriptors.

**Lead-level insight:** For S3, prefer the SDK's streaming `Body` (`GetObjectCommand` returns a stream) and `@aws-sdk/lib-storage` `Upload` for multipart streaming uploads with built-in backpressure.

---

### Q8. What are the differences between `process.nextTick()`, `setImmediate()`, and `setTimeout(fn, 0)`?

**Short answer:** `nextTick` runs before the loop continues (microtask, highest priority), `setImmediate` runs in the check phase, `setTimeout(0)` runs in the timers phase on a later tick.

**Detailed answer:**
- **`process.nextTick(fn)`** — queued in the nextTick queue, drained *immediately after the current operation completes* and *before* the event loop continues to the next phase. Highest priority; overuse starves I/O.
- **Promise `.then`** — microtask, drained after nextTick queue.
- **`setImmediate(fn)`** — executes in the **check** phase, after the poll phase. Good for "run after current I/O."
- **`setTimeout(fn, 0)`** — executes in the **timers** phase of a *future* iteration; minimum delay is clamped (~1ms), so it's generally slower than `setImmediate` inside an I/O cycle.

**Lead-level insight:** Inside an I/O callback, `setImmediate` is guaranteed to run before any timer. Use `setImmediate` to yield control and break up CPU work; reserve `nextTick` for cleanup that must happen before anything else and use it sparingly.

---

### Q9. How do you implement graceful shutdown in a Node.js service, and why is it critical on AWS?

**Short answer:** Listen for `SIGTERM`, stop accepting new connections, drain in-flight requests, close DB/queue connections, then exit — within the orchestrator's grace period.

**Detailed answer:**
On ECS/EKS/EC2 ASG, the platform sends `SIGTERM` before terminating a task (deploys, scale-in, spot reclaim). Without graceful shutdown you drop in-flight requests and corrupt state.

Pattern:
```js
const server = app.listen(port);
async function shutdown(signal) {
  console.log(`${signal} received, draining...`);
  server.close(async () => {          // stop accepting new conns
    await db.end();                   // close pools
    await queueConsumer.stop();       // stop pulling SQS
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25000); // hard cap < grace period
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

**AWS specifics:**
- ECS: align the timeout with `stopTimeout` and the ALB **deregistration delay** (connection draining) so the LB stops routing before you exit.
- Set ALB health check + `deregistration_delay.timeout_seconds` appropriately.
- For SQS consumers, stop polling and let in-flight messages finish or return them (visibility timeout).

**Lead-level insight:** Graceful shutdown + readiness probes + connection draining together give zero-downtime deploys. NestJS has `enableShutdownHooks()` and `onModuleDestroy`/`beforeApplicationShutdown` lifecycle hooks—use them.

---

### Q10. What strategies do you use to optimize Node.js application performance?

**Short answer:** Keep the event loop free, cache aggressively, pool connections, stream large data, use compression/keep-alive, and profile before optimizing.

**Detailed answer:**
- **Don't block the loop:** async everything, offload CPU work (Q6).
- **Connection pooling:** reuse DB connections (pg/mysql pools), and reuse HTTP agents with `keepAlive: true` for outbound calls (including AWS SDK clients — instantiate once, reuse).
- **Caching layers:** in-memory LRU for hot config, ElastiCache (Redis) for shared cache, CloudFront/HTTP caching at the edge.
- **Payload efficiency:** gzip/br compression, pagination, field selection, avoid N+1 queries.
- **Cluster/containers** to use all cores.
- **Profile first:** `clinic.js`, `--prof`, flamegraphs, APM. Optimize the measured hotspot, not guesses.

**Lead-level insight:** State the discipline: *measure → form hypothesis → change one thing → re-measure*. Premature micro-optimization (e.g., swapping a library) without a profile is a red flag for a lead.

---

### Q11. How does garbage collection work in V8, and how can it impact latency?

**Short answer:** V8 uses generational, mostly-concurrent GC. Major GC pauses can cause p99 latency spikes; tune heap size and reduce allocation churn.

**Detailed answer:**
V8 splits the heap into **young generation** (new space, scavenged frequently and cheaply) and **old generation** (objects that survived, collected by mark-sweep-compact, more expensive). Modern V8 does much GC work concurrently/incrementally, but **stop-the-world** pauses still occur, especially major GC on large heaps.

**Impact:** During a pause the event loop is frozen → request latency spikes (visible in p99/p99.9). High allocation rates (creating many short-lived objects, big buffers) increase GC frequency.

**Tuning:**
- `--max-old-space-size` to match container memory (avoid OOM and excessive GC).
- Reduce allocations: reuse buffers, avoid unnecessary object spreads in hot paths, stream instead of buffering.
- Watch GC via `--trace-gc` or `perf_hooks` GC observer.

**Lead-level insight:** On Fargate, set `--max-old-space-size` to ~75–80% of the container memory limit so V8 GCs before the kernel OOM-kills the container.

---

### Q12. How do you manage configuration and secrets across environments in a Node.js app?

**Short answer:** Externalize config (12-factor), validate at startup, and pull secrets at runtime from AWS Secrets Manager / SSM Parameter Store — never commit them.

**Detailed answer:**
- **Config sources:** environment variables for non-secret config; **SSM Parameter Store** (cheap, hierarchical) for config and small secrets; **Secrets Manager** for credentials needing rotation.
- **Validation:** validate env/config at boot with a schema (Joi/zod/`@nestjs/config` with validation) and fail fast if missing/malformed.
- **Runtime fetch & cache:** fetch secrets at startup (or via the Secrets Manager/SSM Lambda extension/agent cache) and cache in memory; refresh on rotation.
- **Least privilege:** the task role can read only its own parameters (path-scoped IAM).

**Lead-level insight:** Mention **rotation** (Secrets Manager native rotation for RDS), **encryption with KMS**, and avoiding secrets in container env vars where they can leak via `docker inspect` or logs. Prefer fetching at runtime over baking into the image.

---

### Q13. How do you handle errors and prevent a single unhandled rejection from crashing the whole service?

**Short answer:** Use structured error handling, catch async errors centrally, and treat `uncaughtException`/`unhandledRejection` as fatal — log, alert, and restart cleanly rather than continuing in an unknown state.

**Detailed answer:**
- **Operational vs programmer errors:** Operational (network timeout, validation) should be handled and translated to proper HTTP responses. Programmer errors (bugs) should crash and restart.
- **Centralized handling:** Express error middleware / NestJS exception filters to map errors to consistent responses and log with correlation IDs.
- **Process-level safety net:**
```js
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandledRejection');
  // let graceful shutdown + orchestrator restart
  shutdown('unhandledRejection');
});
```
- **Don't swallow:** Continuing after an `uncaughtException` leaves the process in an undefined state — let it restart.

**Lead-level insight:** Combine with the orchestrator's restart policy and an alarm on crash frequency. The goal is *fast, clean recovery* + visibility, not heroic in-process recovery.

---

### Q14. How do you choose between async/await, Promises, and callbacks, and how do you handle concurrency limits?

**Short answer:** Prefer async/await for readability; use `Promise.all`/`allSettled` for parallelism; cap concurrency with a limiter to avoid overwhelming downstreams.

**Detailed answer:**
- **async/await** is the default for clarity and stack traces. Wrap in try/catch and propagate.
- **Parallel fan-out:** `Promise.all` (fail-fast) or `Promise.allSettled` (collect all results/errors) when independent calls can run concurrently.
- **Concurrency control:** Unbounded `Promise.all` over thousands of items can exhaust DB connections, hit API rate limits, or OOM. Use `p-limit`, a queue, or batch in chunks.

**Real-time use case:** Processing 10,000 records by calling DynamoDB: instead of 10,000 simultaneous calls, use a concurrency of ~25–50 with `p-limit` to respect provisioned/burst capacity and avoid throttling.

**Lead-level insight:** Always ask "what's the downstream's limit?" Concurrency is a *system* property — pair it with retries + exponential backoff + jitter and idempotency.

---

### Q15. How do you keep a Node.js Docker image small, secure, and fast to start?

**Short answer:** Multi-stage builds, slim/distroless base images, production-only dependencies, non-root user, and pinned versions.

**Detailed answer:**
- **Multi-stage build:** build/compile (including TypeScript) in a builder stage, copy only `dist` + production `node_modules` into a minimal runtime stage.
- **Base image:** `node:20-slim` or distroless/Alpine (watch Alpine's musl quirks with native modules). Smaller image = faster pulls and cold starts, smaller attack surface.
- **Dependencies:** `npm ci --omit=dev`, lockfile committed, `.dockerignore` to exclude tests/`.git`.
- **Security:** run as non-root (`USER node`), scan with ECR image scanning / Trivy, pin base image by digest.
- **Startup:** precompile, avoid heavy work at boot, use a proper init/`tini` for signal handling (so SIGTERM reaches Node for graceful shutdown).

**Lead-level insight:** Smaller images directly improve ECS/EKS deploy speed and scale-out responsiveness. Tie image scanning into CI/CD and fail builds on critical CVEs.

---


