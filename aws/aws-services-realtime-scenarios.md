# AWS Real-Time Scenarios — Architecture & Reasoning

15 realistic scenarios a Node.js/NestJS lead is likely to be asked. Each has: **Scenario → Recommended architecture → Why (lead reasoning) → Failure modes & mitigations → Cost/scale note**. The goal is to show *how to reason*, not memorize a single "right" diagram.

> Interview tip: always start by extracting requirements — traffic shape, latency SLO, consistency needs, budget, compliance — *then* choose services and name the trade-offs.

---

## Scenario 1 — Flash sale / traffic spike on an e-commerce checkout

**Recommended:** CloudFront + WAF → ALB → NestJS on **Fargate** (autoscaled on requests-per-target). Checkout writes an order *intent* to **SQS**; a worker fleet processes at the DB's safe rate. Aurora (with RDS Proxy) for orders; **ElastiCache** for product/inventory reads.

**Why:** Synchronous checkout against the DB melts under a spike. **Queue-based load leveling** decouples ingestion from processing — the queue absorbs the burst while workers drain at a sustainable rate. CloudFront + caching offloads read traffic.

**Failure modes & mitigations:** double orders on retry → **idempotency keys** (DynamoDB conditional write); DB connection exhaustion → **RDS Proxy** + bounded worker concurrency; poison messages → DLQ + redrive; inventory oversell → conditional/atomic decrement.

**Cost/scale:** Autoscale workers on **queue depth/age**; scale Fargate min count for the event (scheduled scaling). Spot for stateless workers.

---

## Scenario 2 — Large media upload + processing (video/images)

**Recommended:** Client requests a **pre-signed S3 URL** from NestJS → uploads directly to S3 (multipart for big files). `s3:ObjectCreated` → EventBridge → SQS → worker (Fargate or Lambda; MediaConvert for video). **Step Functions** orchestrates multi-stage pipelines. Status in DynamoDB; notify via WebSocket/SNS. Serve via CloudFront (signed URLs).

**Why:** Never proxy large bytes through the API tier (memory/bandwidth bottleneck). Direct-to-S3 + event-driven processing scales independently and cheaply.

**Failure modes & mitigations:** reprocessing on retry → **idempotent** jobs; partial pipeline failure → Step Functions catch + compensation; malware → virus scan stage; huge files → multipart + backpressure.

**Cost/scale:** Spot workers; S3 lifecycle to move originals to cheaper tiers; scale on queue depth.

---

## Scenario 3 — Real-time notifications to millions of users

**Recommended:** Events → **EventBridge/SNS** → notification service applies preferences → dispatch via **SNS** (mobile push/SMS), **SES** (email), and real-time in-app via **API Gateway WebSocket APIs** (managed connections) or AppSync subscriptions. Connection registry + history in DynamoDB. SQS buffering between stages.

**Why:** Stateful WebSocket connections fight stateless scaling — offload connection management to a managed service (API Gateway WebSockets) instead of self-managing sticky sockets. Fan-out via pub/sub keeps producers decoupled.

**Failure modes & mitigations:** duplicate notifications → idempotency + dedup; device push limits → throttle; fan-out cost → batch, don't query per recipient; backpressure + prioritization (transactional vs marketing).

**Cost/scale:** WebSocket APIs scale connections for you; DynamoDB for connection lookup at scale.

---

## Scenario 4 — Self-managed WebSocket service on containers

**Recommended:** NestJS WebSocket gateway on **Fargate** behind an ALB (WebSocket support), with a **Redis (ElastiCache) pub/sub backplane** so any task can broadcast to clients connected to any other task. Externalize session state to Redis.

**Why:** With multiple tasks, a message must reach a client regardless of which task holds its socket — the Redis backplane solves this. Avoid sticky-session fragility where possible.

**Failure modes & mitigations:** task loss drops connections → clients auto-reconnect + resume; uneven connection distribution → connection-count-based scaling; memory leak from un-cleaned sockets → remove on `close` + LRU.

**Cost/scale:** At very large scale, consider migrating to API Gateway WebSockets to offload connection management entirely.

---

## Scenario 5 — Scheduled/cron jobs in a multi-instance fleet

**Recommended:** **EventBridge Scheduler** → triggers a Lambda or an ECS task. For in-app scheduling, run a single dedicated scheduler task or use a Redis leader-election lock.

**Why:** In-process `@Cron` in a fleet fires on *every* instance → duplicate execution. Separate **scheduling** from **execution**; let a managed scheduler trigger idempotent work.

**Failure modes & mitigations:** duplicate runs → idempotency + single-firing source; missed runs → EventBridge retries + DLQ; long jobs → ECS task or Step Functions instead of Lambda's 15-min cap.

**Cost/scale:** Scheduler + Lambda is serverless and cheap; heavy batch → Fargate/Batch.

---

## Scenario 6 — High-throughput ingestion + analytics (IoT / clickstream)

**Recommended:** Producers → **Kinesis Data Streams** (partitioned by high-cardinality key) → Lambda/Flink for real-time aggregation (hot metrics to DynamoDB/Timestream) and **Firehose → S3** (data lake, Parquet). Analytics via **Athena**/**Redshift**; dashboards via QuickSight/OpenSearch.

**Why:** A durable, replayable log (Kinesis) decouples ingestion from multiple consumers (real-time + lake) and enables replay/backfill. Separate **OLTP from OLAP**.

**Failure modes & mitigations:** hot shard → better partition key; poison record blocks shard → bisect + failure destination; duplicates → idempotent consumers; backpressure → shard scaling.

**Cost/scale:** Firehose batching + columnar formats + S3 tiering cut cost dramatically; on-demand Kinesis for variable load.

---

## Scenario 7 — Serverless REST API with a relational database

**Recommended:** API Gateway (HTTP API) → **Lambda** (NestJS via adapter or lightweight handlers) → **RDS Proxy** → Aurora. Cognito authorizer at the gateway. Secrets via Secrets Manager.

**Why:** Lambda's rapid scale-out opens a connection per concurrent execution → blows past `max_connections`. **RDS Proxy** pools/multiplexes connections; reserved concurrency caps the blast radius.

**Failure modes & mitigations:** cold starts on a tight SLA → provisioned concurrency; connection pinning reduces multiplexing → short transactions; long requests → consider Fargate.

**Cost/scale:** Cheap at low/spiky traffic; reassess vs Fargate if sustained high RPS makes per-request pricing expensive.

---

## Scenario 8 — Multi-tenant SaaS data isolation

**Recommended:** `tenantId` from the Cognito token injected into every query via a NestJS guard/interceptor; enforce with Postgres **Row-Level Security** (pool model) or DynamoDB partition-key prefixing. Tiered model: pool for SMB, **silo** (separate DB/schema) for enterprise. Per-tenant rate limits + cost tags.

**Why:** Isolation must be enforced at multiple layers (token → app → DB RLS) so a single missing `WHERE tenantId` can't leak cross-tenant data. Cost/isolation is a deliberate trade-off.

**Failure modes & mitigations:** noisy neighbor → per-tenant quotas; data leak bug → RLS as a safety net; per-tenant compliance → silo + per-tenant KMS keys.

**Cost/scale:** Pool maximizes density/cost-efficiency; silo maximizes isolation at higher cost — tier by customer.

---

## Scenario 9 — Public API with API keys, quotas, and abuse protection

**Recommended:** CloudFront + **WAF** (rate-based + SQLi/XSS/bot rules) → **API Gateway** with **usage plans + API keys** (per-tier quotas/throttling). App-level Redis rate limiter for business/fair-use limits. Shield for DDoS. Metering via logs/EMF for billing.

**Why:** Defense in depth — edge throttling protects infrastructure and cost; app limits enforce business rules. Separate identification (API key) from authorization (scopes).

**Failure modes & mitigations:** abusive spikes → WAF rate rules + Shield; key leakage → rotation + scoped keys; over-limit → 429 + `Retry-After`.

**Cost/scale:** WAF/edge blocks malicious load *before* it scales your backend (cost protection).

---

## Scenario 10 — Zero-downtime deployment of a containerized API

**Recommended:** ECS **rolling** (`minimumHealthyPercent`/`maximumPercent`) or **blue/green via CodeDeploy** with canary/linear traffic shift + **CloudWatch alarm-based auto-rollback**. Graceful shutdown (SIGTERM) + ALB **connection draining** + readiness probes. Backward-compatible (**expand/contract**) DB migrations.

**Why:** New and old task versions run simultaneously during the shift — both the app (graceful drain) and the schema (expand/contract) must tolerate that.

**Failure modes & mitigations:** dropped in-flight requests → graceful shutdown + deregistration delay; bad release → canary + auto-rollback; destructive migration breaks old tasks → defer drops by ≥1 deploy.

**Cost/scale:** Blue/green needs temporary double capacity; rolling is cheaper but slower to roll back.

---

## Scenario 11 — Disaster recovery across regions

**Recommended:** Choose by RTO/RPO. Backup & restore (cheapest, slow) → pilot light → warm standby → **active-active** (Route 53 latency/failover routing + DynamoDB **Global Tables** / Aurora **Global Database**). Cross-region snapshot copies + IaC to rebuild.

**Why:** RTO/RPO (business-defined) justify the cost. Most workloads need solid **multi-AZ**; multi-region active-active is expensive and only for the most critical systems.

**Failure modes & mitigations:** replication lag/conflicts (active-active) → conflict resolution + idempotency; untested DR → **game days**; DNS TTL slows failover → low TTL + health checks.

**Cost/scale:** Cost rises sharply from backup-restore to active-active — match to criticality.

---

## Scenario 12 — Event-driven order fulfillment with compensation (saga)

**Recommended:** **Step Functions** state machine: validate → charge payment (retry on transient) → reserve inventory → in parallel (email + analytics) → on failure, compensating refund/release steps. Each step a Lambda or service call; events emitted to EventBridge.

**Why:** Distributed transactions can't be ACID across services — the **saga** pattern uses local transactions + compensations. Step Functions gives durable state, retries, and visibility.

**Failure modes & mitigations:** partial failure → compensation steps; duplicate processing → idempotency; dual-write DB+bus inconsistency → **outbox pattern**.

**Cost/scale:** Express workflows for high volume; Standard for durable/long-running.

---

## Scenario 13 — Diagnosing a sudden latency spike in production

**Recommended:** SLO dashboard to scope (p50 vs p99, which routes) → check recent deploys/config/feature flags + AWS Health → **X-Ray/OTel traces** to localize the slow span → correlate resources (event-loop lag, GC, DB connections/locks, cache hit rate, queue depth). Mitigate (rollback/scale/shed/circuit-break) before perfect diagnosis.

**Why:** Structured method (symptom → narrow → hypothesize → verify) + observability (correlation IDs, traces, dashboards) makes this fast. Mitigation first, root-cause second.

**Common culprits:** slow query/missing index, downstream timeout (→ circuit breaker), cache stampede after a flush, connection-pool exhaustion, GC pressure, hot partition.

**Cost/scale:** Investing in observability *before* the incident is what enables fast recovery.

---

## Scenario 14 — Securing secrets and credentials end to end

**Recommended:** **Secrets Manager** (rotating DB creds, native RDS rotation) + **SSM Parameter Store** (config/simpler secrets), KMS-encrypted. Fetched at runtime via the **task/function role** (no static keys), cached in memory, injected into ECS via `secrets` (not baked into the image). Pre-commit secret scanning; CloudTrail audit.

**Why:** Roles + temporary STS creds eliminate the top breach vector (leaked keys). Rotation limits the value of any leak. Least privilege + KMS key policies separate data access from decryption.

**Failure modes & mitigations:** leaked secret → rotate + revoke (short-lived creds expire); secret in logs → redaction; over-broad role → scope to exact ARNs + Access Analyzer.

**Cost/scale:** SSM SecureString is cheaper for simple secrets; Secrets Manager where rotation matters.

---

## Scenario 15 — Cost spike investigation and optimization

**Recommended:** Cost Explorer + cost allocation **tags** to attribute spend per team/service → identify drivers (idle compute, over-provisioned Fargate/RDS, NAT data processing, log volume/cardinality, cross-AZ/egress transfer, expensive per-request API Gateway at high volume). Right-size (Compute Optimizer), Spot for workers, Savings Plans for baseline, caching (CloudFront/ElastiCache), S3 lifecycle.

**Why:** Cost is an engineering KPI. The biggest wins are usually right-sizing, killing idle resources, Spot for fault-tolerant workers, and caching to offload compute/DB.

**Failure modes & mitigations:** cutting too aggressively hurts reliability → keep multi-AZ + headroom; surprise bills → budgets + anomaly alarms; untagged spend → enforce tagging in IaC.

**Cost/scale:** Model **serverless vs container break-even**; many systems are hybrid for a reason.

---

## How to close a scenario answer (lead signal)

1. Restate the **requirement drivers** you optimized for (traffic shape, SLO, consistency, cost).
2. Name the **trade-offs** you accepted (e.g., eventual consistency for scale, double capacity for blue/green).
3. Call out the **failure modes** and how the design degrades gracefully.
4. Mention **how you'd evolve** it as scale grows — and resist over-engineering on day one.
