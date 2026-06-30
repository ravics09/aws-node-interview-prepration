# One-Page Cheat Sheet — AWS + Node.js Lead Interview

Condensed, highest-yield points for last-minute revision. Full reasoning lives in the [guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md) and [topics](../topics/README.md).

---

## Node.js runtime
- **Event loop phases:** timers → pending → poll → check (`setImmediate`) → close. Microtasks (`nextTick` > Promises) drain between each.
- **Never block the loop:** offload CPU work (Worker Threads → or better, queue + worker fleet). Stream large payloads; avoid sync FS/crypto.
- **`setImmediate` vs `nextTick`:** `nextTick` runs first (can starve loop); `setImmediate` runs in check phase — use it to yield.
- **Memory leak triage:** confirm trend → heap snapshot diff under load → fix retaining ref (unbounded cache, leaked listeners, timers).
- **GC:** generational; major GC = stop-the-world → p99 spikes. Set `--max-old-space-size` to ~75–80% of container memory.
- **Graceful shutdown:** SIGTERM → stop new conns → drain → close pools → exit < grace period. Separate liveness vs readiness.
- **Scale model:** one process per container; let ECS/EKS scale tasks. `cluster`/PM2 only to use cores on a single host.

## NestJS / Express
- **DI:** IoC container; default scope **singleton** (don't store request state). `REQUEST` scope has a cost.
- **Request pipeline order:** middleware → guards (authz) → pipes (validation) → handler → interceptors → exception filters.
- **Validation:** DTOs + `class-validator` + global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` (also a security control).
- **Structure:** feature modules + core (singletons) + shared; `exports` for encapsulation → enables clean microservice extraction.
- **Express vs Nest:** Express for tiny/edge/Lambda; Nest for structure/teams/scale. Nest can run on Fastify for throughput.
- **Modular monolith first** — split to microservices only when team/scale justifies the operational cost.

## AWS compute
- **Pick by traffic shape:** spiky/event → **Lambda**; steady containers → **Fargate**; high steady/GPU → ECS/EKS on EC2; legacy → EC2.
- **Lambda cold starts:** small bundle (esbuild, SDK v3 modular), init outside handler, provisioned concurrency for latency-critical, right-size memory.
- **Lambda + RDS:** connection exhaustion → use **RDS Proxy** + reserved concurrency; or go DynamoDB (connectionless).
- **Reserved concurrency** = cap/guarantee + protect downstreams; **provisioned concurrency** = pre-warmed, no cold start.
- **API Gateway** (managed auth/throttle/validation, great w/ Lambda) vs **ALB** (cheaper at high RPS, long-running containers).
- **Step Functions** for durable orchestration + retries + saga/compensation; **EventBridge** for decoupled event routing/filtering.
- **IAM:** roles (temp STS creds), not static keys. One role per workload, scoped to exact actions + resource ARNs. Task role ≠ execution role.
- **IaC:** CDK (TS) / Terraform; no click-ops in prod.

## Scaling & resilience
- **Stateless services** = horizontal scaling. Externalize sessions (Redis/JWT), cache (ElastiCache), files (S3). Avoid sticky sessions.
- **Autoscaling:** target tracking (default; scale on **requests-per-target** for I/O-bound Node, not just CPU); scheduled/predictive for known spikes.
- **Queue-based load leveling:** SQS absorbs spikes; scale workers on **queue depth/age**. Decouples ingestion from processing.
- **Retries:** exponential backoff + **full jitter**; only retry transient/idempotent; cap attempts; pair with circuit breaker.
- **Idempotency:** idempotency key + DynamoDB conditional write (+ TTL). Mandatory in at-least-once/serverless systems.
- **Circuit breaker:** closed → open (fast-fail + fallback) → half-open. Prevents cascading failure; graceful degradation.
- **Cache stampede:** single-flight lock + jittered TTL + stale-while-revalidate; warm hot keys after deploy/flush.
- **HA:** multi-AZ by default (RDS Multi-AZ/Aurora, DynamoDB). Multi-region only for strict RTO/RPO. Define RTO/RPO with the business.
- **CloudFront** offloads origin + absorbs spikes + Shield/WAF; version asset filenames instead of invalidating.
- **Load shedding:** reject early (429/503 + Retry-After) when overloaded; bulkheads isolate pools.

## Databases & caching
- **SQL (RDS/Aurora)** for complex queries/joins/transactions; **DynamoDB** for known access patterns, massive scale, serverless.
- **DynamoDB modeling:** access-patterns first; high-cardinality PK; sort keys for ranges; GSIs for more patterns; single-table design.
- **Hot partition:** high-cardinality keys + write sharding (suffix) + DAX/cache.
- **Multi-AZ** = HA (not readable); **read replicas** = read scaling (replica lag → don't read-after-write).
- **RDS Proxy:** pools/multiplexes connections (Lambda/large fleets), faster failover, IAM auth.
- **Connection pooling math:** `pool_size × instances ≤ max_connections` (with headroom).
- **Slow queries:** Performance Insights + `EXPLAIN ANALYZE`; add indexes, kill N+1, keyset pagination; beware over-indexing.
- **Redis vs Memcached:** Redis (structures, persistence, pub/sub, HA) is default; Memcached for simple multi-threaded cache.
- **Consistency:** transactions in-service; **saga + outbox** across services; strong vs eventual per use case.
- **Migrations:** expand/contract (backward-compatible); `CREATE INDEX CONCURRENTLY`; destructive change lags code by ≥1 deploy.
- **OLTP vs OLAP:** offload search → OpenSearch, analytics → S3/Athena/Redshift. Don't run analytics on the prod DB.

## Security
- **AuthN ≠ AuthZ.** Verify JWTs (RS256 via JWKS, check iss/aud/exp/token_use, reject `alg:none`); short access tokens + refresh; revocation strategy.
- **Cognito** for managed identity; verify at edge (API GW authorizer) + fine-grained checks in app.
- **Least privilege** everywhere; secrets in Secrets Manager (rotation) / SSM SecureString, encrypted with KMS, fetched at runtime.
- **VPC:** public (ALB/NAT), private app, isolated data. Security groups (stateful) do the work; NACLs (stateless) backstop; VPC endpoints keep AWS traffic private.
- **WAF** (L7: SQLi/XSS/rate/bot) + **Shield** (DDoS). Defense in depth protects security *and* cost.
- **OWASP:** parameterized queries, output encoding/CSP, helmet headers, server-side access control (no IDOR), TLS + encrypt at rest, `npm audit`/Dependabot.
- **Encrypt everything;** the nuance is **key management** (who can use which KMS key, rotation, separate data vs key access).
- **Zero trust:** authenticate/authorize every call; don't trust network location.

## Observability
- **3 pillars:** metrics, logs, traces. Monitoring = known checks; observability = ask new questions (debug unknowns).
- **Structured logs (pino, JSON)** + correlation/trace ID via `AsyncLocalStorage`; redact PII; deliberate log levels.
- **CloudWatch:** Logs + Metrics + Alarms; **EMF** to emit custom metrics from logs cheaply; composite alarms reduce noise.
- **Tracing:** OpenTelemetry (→ X-Ray/Datadog); propagate context into HTTP + SQS attributes; sample to control cost.
- **SLI/SLO/error budget:** user-centric SLIs; error budget governs ship-vs-stabilize; alert on **burn rate**, not every blip.
- **Metrics frameworks:** **RED** (Rate/Errors/Duration) for services + **USE** (Utilization/Saturation/Errors) for resources; plus Node event-loop lag & GC. Use **percentiles**, not averages.
- **Health checks:** liveness (restart) vs readiness (stop routing); tolerant dependency checks to avoid correlated fleet failure.
- **Incident:** detect → mitigate (rollback/scale/shed) before perfect diagnosis → root-cause → blameless post-mortem; pre-built runbooks.
- **Log cost:** retention tiers, sample debug, watch cardinality; separate immutable audit logs (CloudTrail/Config) from operational.

## Cost
- Right-size (Compute Optimizer); Savings Plans/Reserved for baseline, **Spot** for fault-tolerant workers; scale to zero; cache to cut compute/DB; S3 tiering; compress payloads. Tag for per-team/service cost attribution.

---

## How to stand out as a lead
1. Lead with **trade-offs**, not definitions (and when *not* to use something).
2. Start from **requirements** (RPS, latency SLO, consistency, budget, compliance).
3. Name the **failure modes** and mitigations.
4. **Quantify** (p99 < 300ms, RPO/RTO, break-even).
5. Think in **layers / defense in depth**.
6. Show **ownership**: observability, cost, runbooks, mentoring, IaC.
7. **Avoid over-engineering** — match complexity to need.
