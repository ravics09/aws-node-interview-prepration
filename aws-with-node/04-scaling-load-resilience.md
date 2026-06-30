# 4. Scaling, Load Handling & Resilience (Q45–Q58)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Prev:** [← 3. AWS Compute](./03-aws-compute-serverless.md) · **Next:** [5. Databases & Caching →](./05-databases-caching.md)

---

## 4. Scaling, Load Handling & Resilience

### Q45. How do you design a Node.js service to scale horizontally, and what makes a service "stateless"?

**Short answer:** Keep no per-request state in process memory — externalize session/cache/state to Redis/DynamoDB/S3 so any instance can serve any request, then add instances behind a load balancer.

**Detailed answer:**
A stateless service stores nothing in local memory that a subsequent request depends on. Move:
- **Sessions** → Redis (ElastiCache) or stateless JWTs.
- **Cache** → ElastiCache (shared), not per-instance memory.
- **Uploaded files / temp data** → S3.
- **Background job state** → SQS + a datastore.

Then horizontal scaling is trivial: a load balancer spreads traffic across N identical instances, and autoscaling adds/removes them based on load. Local state breaks this (a user's session lives on one box → needs sticky sessions → uneven load and failures on instance loss).

**Lead-level insight:** Statelessness is the foundation of elasticity and resilience (any instance can die and be replaced). Sticky sessions are a smell — call them out and prefer externalized state. WebSockets are the legitimate stateful exception (Q26) requiring a backplane.

---

### Q46. Explain Auto Scaling strategies on AWS (target tracking, step, scheduled, predictive). Which do you choose?

**Short answer:** Target tracking for most cases (keep a metric like CPU or requests-per-target at a target), step scaling for fine-grained reactions, scheduled for known patterns, predictive for cyclical traffic.

**Detailed answer:**
- **Target tracking:** "keep average CPU at 60%" or "keep ALB requests-per-target at 1000." Simplest and most robust — AWS computes the adjustments. Default choice.
- **Step scaling:** add/remove different amounts based on alarm thresholds (e.g., +2 if CPU>70%, +4 if >90%). More control for spiky load.
- **Scheduled scaling:** pre-scale for known events (business hours, a sale, batch windows).
- **Predictive scaling:** ML forecasts cyclical demand and pre-provisions before the spike — great for daily/weekly patterns.

**Lead-level insight:** Choose the **scaling metric** carefully — for a Node API, **ALB request count per target** or a custom latency/queue-depth metric often beats CPU (Node may be I/O-bound, not CPU-bound). Combine scheduled/predictive (proactive) with target tracking (reactive) for known spikes like flash sales. Always set sensible min/max and cooldowns.

---

### Q47. What is queue-based load leveling and how does SQS help handle traffic spikes?

**Short answer:** Put a queue (SQS) between producers and consumers so spikes are absorbed in the queue and consumers process at a sustainable rate, protecting downstreams.

**Detailed answer:**
Instead of synchronous calls that overwhelm a backend during a spike, the API writes a message to SQS and returns quickly; a worker fleet consumes at its own pace. The queue acts as a **shock absorber**: bursts grow the queue depth rather than crashing the consumer or its database.

- **Scaling the consumers:** autoscale workers on **queue depth / age of oldest message** (great scaling signal).
- **SQS standard** (at-least-once, high throughput) vs **FIFO** (ordered, exactly-once processing, lower throughput).
- **DLQ** for messages that repeatedly fail.

**Real-time use case:** A ticketing site during an on-sale: requests enqueue order intents; workers process at the DB's safe rate; users get "processing" status. The site stays up instead of melting the database.

**Lead-level insight:** This decouples *ingestion capacity* from *processing capacity* — a core resilience pattern. Pair with idempotency (Q49), DLQs, and backpressure. Mention the trade-off: added latency and eventual consistency.

---

### Q48. How do you implement retries with exponential backoff and jitter, and why is jitter important?

**Short answer:** Retry transient failures with increasing delays (exponential backoff) plus randomness (jitter) to avoid synchronized retry storms (thundering herd) that hammer a recovering service.

**Detailed answer:**
- **Backoff:** delay = base × 2^attempt, capped at a max, with a retry limit. Avoids tight retry loops.
- **Jitter:** add randomness (e.g., AWS-recommended "full jitter": `random(0, backoff)`). Without jitter, many clients that failed at the same instant retry at the same instant, re-overwhelming the service.
- **Only retry idempotent/transient errors** (timeouts, 429, 503), not 400/validation errors. Respect `Retry-After`.
- The **AWS SDK** has configurable retry strategies (adaptive mode) built in.

**Lead-level insight:** Retries amplify load during incidents — pair with **circuit breakers** (Q50), timeouts, and budgets (max retries) so retries don't turn a partial outage into a full one. Jitter is the detail that separates a senior from a junior answer.

---

### Q49. What is idempotency and how do you implement it in a distributed Node.js system?

**Short answer:** Idempotency means processing the same request/message multiple times has the same effect as once — implemented via idempotency keys + a dedupe store, so retries and at-least-once delivery don't double-charge/double-create.

**Detailed answer:**
At-least-once systems (SQS, Lambda retries, client retries) *will* deliver duplicates. To stay correct:
- **Idempotency key:** client (or producer) sends a unique key per logical operation. The server records processed keys (DynamoDB with conditional `PutItem`/TTL) and returns the prior result on duplicates.
- **Natural idempotency:** design operations to be naturally idempotent (e.g., `SET status=paid` rather than `INCREMENT balance`).
- **Conditional writes:** DynamoDB conditional expressions / optimistic locking with version numbers.

**Real-time use case:** Payment API: an idempotency key ensures a retried "charge" doesn't bill the customer twice; the second call returns the original charge result.

**Lead-level insight:** Idempotency is non-negotiable in event-driven/serverless systems. Naming DynamoDB conditional writes + TTL for an idempotency store, and "design operations to be idempotent by nature," is a strong lead signal.

---

### Q50. What is the circuit breaker pattern and how would you implement it in Node.js?

**Short answer:** A circuit breaker stops calling a failing dependency after a failure threshold (open state), fails fast or serves a fallback, then probes for recovery (half-open) — preventing cascading failures and resource exhaustion.

**Detailed answer:**
States: **closed** (calls flow, count failures) → **open** (failures exceeded threshold, short-circuit immediately, return fallback/error) → **half-open** (after a cooldown, allow a trial request; success closes, failure re-opens).

Without it, a slow dependency causes requests to pile up, exhaust connections/threads/memory, and bring down the whole service (cascading failure). In Node, libraries like **opossum** implement this with timeouts, fallbacks, and metrics.

**Real-time use case:** A recommendations service is down; the product page's circuit opens and instantly serves a cached/default list instead of every request hanging 30s and exhausting the event loop.

**Lead-level insight:** Combine breaker + timeout + retry + bulkhead (isolate resource pools per dependency). Emphasize **fail fast** and **graceful degradation** — partial functionality beats total outage.

---

### Q51. How does an Application Load Balancer distribute traffic and perform health checks?

**Short answer:** The ALB is a layer-7 load balancer that routes requests to healthy targets in target groups using rules (host/path), runs periodic health checks, and stops sending traffic to unhealthy targets.

**Detailed answer:**
- **Routing:** listener rules match host/path/headers and forward to target groups (ECS tasks, EC2, Lambda, IPs). Default algorithm is round-robin; least-outstanding-requests is available.
- **Health checks:** ALB pings a configured path (e.g., `/health`) at intervals; a target must pass `healthy threshold` checks to receive traffic and fails out after `unhealthy threshold`. Unhealthy targets are removed automatically.
- **Cross-AZ:** distributes across AZs for HA; integrates with ASG/ECS to register/deregister targets dynamically.
- **Connection draining (deregistration delay):** lets in-flight requests finish before removing a target (works with graceful shutdown, Q9).

**Lead-level insight:** Separate **liveness** vs **readiness** health endpoints: readiness should reflect dependency health (DB reachable) so the LB doesn't send traffic to an instance that can't serve. But don't make readiness too strict or a transient DB blip removes the whole fleet.

---

### Q52. How do you design for high availability across Availability Zones and Regions?

**Short answer:** Multi-AZ by default (spread compute + Multi-AZ DB within a region) for resilience to AZ failure; multi-Region (active-passive or active-active) for disaster recovery and global low latency, with the chosen RTO/RPO driving the design.

**Detailed answer:**
- **Multi-AZ (standard):** run tasks/instances across ≥2 AZs behind an ALB; use RDS Multi-AZ / Aurora (synchronous standby in another AZ) and DynamoDB (inherently multi-AZ). Survives an AZ outage with no data loss.
- **Multi-Region (DR):** 
  - *Backup & restore* (cheapest, slow RTO),
  - *Pilot light* / *warm standby* (scaled-down replica, faster),
  - *Active-active* (Route 53 + global data layer like DynamoDB Global Tables / Aurora Global DB — lowest RTO, highest cost/complexity).
- **DNS failover:** Route 53 health checks + failover/latency routing.

**Lead-level insight:** Define **RTO** (how fast to recover) and **RPO** (acceptable data loss) with the business first — they justify the cost. Most workloads need solid multi-AZ; multi-Region active-active is expensive and only for the most critical systems. Mention data replication lag and conflict resolution for active-active.

---

### Q53. How do you protect a backend from being overwhelmed (load shedding, throttling, bulkheads)?

**Short answer:** Throttle/rate-limit at the edge and app, shed load gracefully when overloaded (reject early with 429/503), isolate resources with bulkheads, and use queues to buffer.

**Detailed answer:**
- **Rate limiting/throttling** (Q27): edge (WAF/API Gateway) + app (Redis-backed) limits.
- **Load shedding:** when a queue/concurrency threshold is exceeded, reject new work fast (`503`/`429` + `Retry-After`) instead of accepting work you can't complete — protects the requests already in flight.
- **Bulkheads:** separate connection/thread pools per dependency so one slow downstream can't consume all resources.
- **Concurrency caps:** Lambda reserved concurrency, DB connection limits, `p-limit` for fan-out.
- **Queues:** absorb spikes (Q47).

**Lead-level insight:** Accepting more than you can serve makes *everything* slow and fails *all* requests; shedding excess keeps the system healthy for the requests it can serve. This "protect the system, degrade gracefully" mindset is core lead thinking.

---

### Q54. How does CloudFront improve performance and reduce backend load?

**Short answer:** CloudFront is a global CDN that caches content at edge locations close to users, offloading static (and cacheable dynamic) responses from your origin, reducing latency, and absorbing traffic spikes.

**Detailed answer:**
- **Edge caching:** static assets and cacheable API responses are served from the nearest PoP — lower latency, fewer origin hits.
- **Origin offload:** cache hits never reach your ALB/Lambda/S3 origin → less compute cost and load; cache by headers/query/cookies as configured.
- **Spike absorption + DDoS:** edge absorbs bursts; integrates with AWS Shield and WAF for protection.
- **Dynamic acceleration:** even uncacheable requests benefit from optimized AWS backbone routing and persistent connections.
- **Lambda@Edge / CloudFront Functions:** run logic at the edge (auth, redirects, header manipulation, A/B).

**Real-time use case:** Serving a SPA + media from S3 via CloudFront, plus caching `GET /products` for 60s — origin load drops dramatically during a marketing spike.

**Lead-level insight:** Pair CloudFront with proper `Cache-Control` headers and cache-key design. Use signed URLs/cookies for private content. Know that cache invalidation is eventually consistent and costs money — version asset filenames instead of invalidating.

---

### Q55. How do you load test a Node.js/AWS system and interpret the results?

**Short answer:** Define SLOs, generate realistic load with tools (k6, Artillery, Locust, Gatling), test in a prod-like environment, and watch latency percentiles, error rates, throughput, and resource saturation to find the bottleneck and breaking point.

**Detailed answer:**
- **Define targets:** expected RPS, peak, p95/p99 latency SLOs.
- **Tools:** k6/Artillery for HTTP, with ramp-up, soak (sustained), and spike tests.
- **Environment:** test against a prod-like stack (don't extrapolate from a laptop); include real DB sizes.
- **Metrics to read:** latency **percentiles** (not just average), error rate, throughput plateau, and **saturation** of the limiting resource (CPU, event-loop lag, DB connections, queue depth).
- **Find the knee:** the point where latency spikes/errors climb = capacity limit. Tune autoscaling and limits around it.

**Lead-level insight:** Averages lie — focus on p99 and tail latency. Identify the *bottleneck resource* (often the DB or a downstream, not Node CPU) and validate autoscaling triggers actually fire in time. Run **soak tests** to catch leaks (Q3) and connection growth.

---

### Q56. What is the thundering herd / cache stampede problem and how do you prevent it?

**Short answer:** When a popular cache entry expires, many concurrent requests simultaneously miss and hit the database, potentially overwhelming it. Prevent with locking, request coalescing, staggered TTLs, and background refresh.

**Detailed answer:**
- **Locking / single-flight:** the first request acquires a lock (Redis `SETNX`) and repopulates the cache while others wait or serve stale.
- **Request coalescing:** dedupe in-flight identical requests so only one hits the origin.
- **Jittered/staggered TTLs:** randomize expiry so keys don't expire together.
- **Stale-while-revalidate:** serve slightly stale data while refreshing asynchronously in the background.
- **Pre-warming:** refresh hot keys before expiry.

**Real-time use case:** Homepage data cached for 60s; at expiry, 10k requests/sec would stampede the DB. A single-flight lock means one query refills the cache while the rest serve the previous value.

**Lead-level insight:** This is a subtle, high-signal scaling question. Mention that the same idea applies to cold caches after a deploy/flush — warm critical keys to avoid a self-inflicted DB overload.

---

### Q57. How do you ensure messages are processed reliably and in order when needed (SQS/SNS/Kinesis)?

**Short answer:** Choose the right service for the guarantee — SQS Standard (at-least-once, best-effort order), SQS FIFO (ordered + dedupe per group), Kinesis (ordered per shard for streaming) — and pair with idempotency + DLQs.

**Detailed answer:**
- **SQS Standard:** high throughput, at-least-once, possible duplicates and out-of-order → require idempotent consumers.
- **SQS FIFO:** strict order and exactly-once *processing* within a **message group ID**; throughput is lower (but high with multiple groups). Use for per-entity ordering (e.g., all events for one account in order).
- **Kinesis Data Streams:** ordered within a **shard**, supports many consumers (fan-out), replay within retention; partition key controls ordering/distribution. Good for high-volume event streaming/analytics.
- **SNS:** pub/sub fan-out (FIFO topics available); combine SNS→multiple SQS for fan-out + durability.

**Lead-level insight:** Order requirements should be scoped to the *entity* (group/partition key), not globally — global ordering kills throughput. Always add DLQs and a redrive plan, and design consumers idempotent because even FIFO redeliveries can occur on failures.

---

### Q58. How do you approach cost optimization without sacrificing performance/reliability?

**Short answer:** Right-size resources, use the correct pricing model (Savings Plans/Reserved/Spot), scale to actual demand, cache to cut compute/DB load, and continuously monitor with Cost Explorer/budgets — guided by data, not guesses.

**Detailed answer:**
- **Right-size:** match CPU/memory to real usage (Compute Optimizer); avoid over-provisioned Fargate/RDS.
- **Pricing models:** Savings Plans / Reserved Instances for steady baseline; **Spot** for fault-tolerant/batch/worker fleets (huge savings); on-demand for spiky.
- **Scale to demand:** autoscaling + scale-to-zero (Lambda, Fargate min counts) so you don't pay for idle.
- **Reduce work:** caching (CloudFront/ElastiCache) offloads compute and DB; efficient queries cut RDS size; S3 lifecycle policies + Intelligent-Tiering for storage; compress payloads to cut data transfer (often a hidden cost).
- **Serverless vs container break-even** (Q41).
- **Observe:** Cost Explorer, budgets/alarms, cost allocation tags per team/service.

**Lead-level insight:** Frame cost as an engineering KPI with ownership and tagging. The biggest wins are usually right-sizing, killing idle resources, Spot for workers, and caching — and a lead drives a cost-awareness culture (e.g., per-service cost dashboards) rather than one-off cleanups.

---


