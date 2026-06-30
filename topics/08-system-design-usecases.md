# 8. System Design & Real-Time Use Cases (Q94–Q100)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Prev:** [← 7. Monitoring & Observability](./07-monitoring-logging-observability.md)

---

## 8. System Design & Real-Time Use Cases

> These are open-ended design questions. There's no single right answer — interviewers assess how you reason about requirements, trade-offs, scaling, failure, security, and cost. Each answer below gives a reference architecture and the key talking points a lead should hit.

### Q94. Design a scalable REST API on AWS for a Node.js/NestJS application expecting unpredictable traffic.

**Reference architecture:**
- **Edge:** Route 53 → CloudFront (cache static + cacheable GETs) → AWS WAF → ALB (or API Gateway).
- **Compute:** NestJS containers on **ECS Fargate** across ≥2 AZs, behind the ALB, with target-tracking autoscaling on ALB request-count-per-target (and CPU as backup). (Or Lambda if traffic is very spiky/low-baseline.)
- **Data:** Aurora (with read replicas + RDS Proxy) for relational, or DynamoDB for known access patterns; **ElastiCache (Redis)** for hot reads/sessions.
- **Async:** SQS + worker service for anything slow (emails, processing) so the API stays fast.
- **Config/secrets:** SSM/Secrets Manager; IAM task roles.
- **Observability:** CloudWatch metrics/alarms, structured logs (pino), X-Ray/OTel tracing, SLOs.

**Key talking points:** statelessness (Q45), autoscaling metric choice (Q46), caching + CDN to absorb spikes (Q54), graceful shutdown for zero-downtime deploys (Q9), multi-AZ HA (Q52), and cost-aware compute choice (Q41).

**Lead-level insight:** Start from requirements (RPS, latency SLO, consistency needs, budget), justify each choice with trade-offs, and call out the failure modes (AZ loss, DB failover, dependency outage → circuit breakers). Mention how you'd evolve it as traffic grows rather than over-engineering on day one.

---

### Q95. Design a real-time notification system (push notifications + in-app updates) for millions of users.

**Reference architecture:**
- **Ingestion:** events published to **SNS/EventBridge** or a Kafka/Kinesis stream when something notify-worthy happens.
- **Fan-out & routing:** a notification service consumes events, applies user preferences, and dispatches via channels: **SNS** (mobile push via APNs/FCM, SMS), **SES** (email), and real-time in-app.
- **Real-time in-app:** **API Gateway WebSocket APIs** (managed connection state) or AppSync subscriptions; for self-managed, WebSocket gateways on Fargate with a **Redis pub/sub backplane** (Q26) and a connection registry (DynamoDB mapping userId→connectionId).
- **Delivery guarantees:** SQS buffering + retries + DLQ, idempotency (Q49) to avoid duplicate notifications, and a store (DynamoDB) for notification history/read state.

**Key talking points:** decoupling via pub/sub, scaling stateful WebSocket connections (managed service vs backplane), per-user preference/fan-out, throttling to respect device push limits, and ordering/dedup.

**Lead-level insight:** The hard parts are **stateful connections at scale** (favor API Gateway WebSockets / AppSync to offload), **fan-out efficiency** (don't query the DB per recipient — batch), and **idempotent, retryable delivery**. Discuss back-pressure and prioritization (transactional vs marketing notifications).

---

### Q96. Design a file/media processing pipeline (e.g., user uploads images/videos that need processing).

**Reference architecture:**
1. **Upload:** client requests a **pre-signed S3 URL** (Q43) from the NestJS API and uploads directly to S3 (multipart for large files) — compute never proxies bytes.
2. **Trigger:** `s3:ObjectCreated` → **EventBridge/SNS** → **SQS**.
3. **Process:** a worker fleet (ECS Fargate or Lambda; AWS MediaConvert for video, Lambda/Sharp for images) consumes the queue, processes, and writes outputs back to S3. Long/complex flows orchestrated by **Step Functions** (Q37).
4. **Notify:** on completion, update DynamoDB status + emit an event → notify the user (Q95). Serve results via CloudFront (signed URLs).

**Key talking points:** offloading bytes to S3, event-driven decoupling, queue-based load leveling for spiky uploads (Q47), autoscaling workers on queue depth, idempotency + DLQ for failed jobs, and cost (Spot for workers, S3 lifecycle for originals).

**Lead-level insight:** Never push large files through the API tier. Make processing idempotent (reprocessing on retry must be safe), handle partial failures with DLQs + a redrive/replay plan, and use Step Functions when the pipeline has multiple stages with branching/compensation. Add virus/malware scanning for user-uploaded content.

---

### Q97. Design a multi-tenant SaaS backend. How do you isolate tenants for data, performance, and security?

**Reference architecture & isolation models:**
- **Data isolation options (trade-off spectrum):**
  - *Silo* — separate DB/schema per tenant: strongest isolation, easier per-tenant backup/compliance, higher cost/ops.
  - *Pool* — shared tables with a `tenantId` partition/row-level security: most cost-efficient, scales to many tenants, but requires rigorous enforcement.
  - *Bridge* — hybrid (shared infra, separate schemas) or pool for small + silo for enterprise tenants.
- **Enforcement:** `tenantId` from the auth token (Cognito custom claims), injected into every query via a guard/interceptor; Postgres **Row-Level Security** or DynamoDB partition-key prefixing as a safety net so a bug can't leak cross-tenant data.
- **Performance isolation:** per-tenant rate limits/quotas (Q27), avoid noisy-neighbor (a heavy tenant throttled, not allowed to starve others), optionally dedicated capacity for large tenants.
- **Security:** scope IAM/keys per tenant where applicable, encrypt with per-tenant KMS keys for the highest tier, and audit access by tenant.

**Lead-level insight:** The central interview signal is **tenant isolation enforced at multiple layers** (token → app guard → DB RLS) so a single missing `WHERE tenantId` can't cause a breach. Discuss the cost/isolation trade-off and a tiered model (pool for SMB, silo for enterprise), plus per-tenant observability and cost attribution (tagging).

---

### Q98. Design a public, rate-limited API with API keys, usage plans, and protection against abuse.

**Reference architecture:**
- **Front door:** **API Gateway** with **API keys + usage plans** (per-key throttling and quotas) — managed, no custom code. Or ALB + app-level limiting if on containers.
- **Auth:** API keys for identification + usage plans; OAuth/JWT for user-scoped access; **WAF** for SQLi/XSS/bot/rate-based IP rules (Q76).
- **Throttling layers:** edge (API Gateway/WAF) + app-level Redis-backed limiter (Q27) for business/fair-use limits and per-endpoint costs.
- **Abuse protection:** WAF rate-based rules, Shield for DDoS, request validation/size limits, and anomaly alarms on spikes.
- **Tiering:** different usage plans (free/pro/enterprise) with different quotas; meter usage for billing (logs/EMF → metering pipeline).

**Key talking points:** defense in depth (edge + app), distinguishing identification (API key) from authorization (scopes), 429 + `Retry-After` semantics, and per-tier quotas.

**Lead-level insight:** Separate **infrastructure protection** (WAF/Shield/edge throttling — protects cost and availability) from **business limits** (per-plan quotas). Mention idempotency keys for write endpoints, clear rate-limit response headers, and metering/billing integration — a lead thinks about the product and monetization, not just the tech.

---

### Q99. How would you migrate a Node.js monolith to microservices on AWS without a big-bang rewrite?

**Approach — Strangler Fig pattern:**
1. **Stabilize & understand:** add observability (Q84) to the monolith, identify bounded contexts and the highest-value/highest-pain modules.
2. **Facade/routing layer:** put an API Gateway/ALB in front so you can route specific paths to new services while the rest still hits the monolith.
3. **Extract incrementally:** peel off one bounded context at a time into a service (a well-encapsulated NestJS module maps cleanly, Q17). Start with low-risk, loosely-coupled domains.
4. **Decouple data:** the hardest part — split shared databases gradually; use the **outbox pattern** and events (EventBridge/SNS) for cross-service consistency (Q65); accept eventual consistency where acceptable.
5. **Migrate traffic gradually:** canary/percentage routing; keep the old path as fallback; monitor SLOs and roll back on regressions.
6. **Decommission** the old module once the new service is proven.

**Lead-level insight:** Strangler Fig over big-bang rewrite — incremental, reversible, low-risk. The **database decoupling** and **distributed-transaction/consistency** challenges are where most migrations fail, so address them explicitly (sagas, outbox, idempotency). And challenge the premise: only split when team/scale boundaries justify the operational cost — a **modular monolith** may be the right destination.

---

### Q100. Design a high-throughput data ingestion + analytics pipeline (e.g., millions of events/sec from IoT or clickstream).

**Reference architecture:**
- **Ingestion:** devices/clients → **API Gateway/IoT Core** or directly to **Kinesis Data Streams** (or **MSK/Kafka**) for ordered, high-throughput, replayable ingestion (partitioned by a high-cardinality key to avoid hot shards, Q71).
- **Stream processing:** Lambda (or Kinesis Data Analytics / Flink) consumers for real-time aggregation/enrichment; write hot metrics to DynamoDB/Timestream and dashboards.
- **Buffer to lake:** **Kinesis Data Firehose** → **S3** (partitioned by date), forming a data lake; compress + columnar (Parquet) via Firehose/Glue.
- **Analytics:** **Athena** for ad-hoc SQL on S3, **Redshift** for BI warehouse, **QuickSight**/OpenSearch for visualization. **Glue** for ETL/catalog.
- **Reliability:** at-least-once + idempotent consumers (Q49), DLQ/error records to S3, enhanced fan-out for multiple consumers, and replay from the stream/lake for backfills.

**Key talking points:** separating real-time (stream) from batch/analytical (lake) paths (lambda/kappa architecture), partition/shard key design to spread load, backpressure, cost (Firehose batching, S3 tiering, columnar formats), and decoupling producers from consumers.

**Lead-level insight:** The core is **decouple ingestion from processing** with a durable, replayable log (Kinesis/Kafka), then fan out to multiple consumers (real-time + lake) without coupling. Emphasize partition-key design (the #1 throughput killer), idempotency, replay for recovery/backfill, and separating OLTP from OLAP (Q69). Tie choices back to volume, latency requirements, and cost.

---

## Closing Notes for the Candidate

**How to stand out as a lead in these interviews:**

1. **Lead with trade-offs, not facts.** Anyone can define a service; a lead explains *when not* to use it and what they'd give up.
2. **Always start from requirements.** RPS, latency SLO, consistency needs, budget, team size, and compliance drive every decision.
3. **Name the failure modes.** AZ loss, DB failover, dependency outage, thundering herd, hot partitions, connection exhaustion, poison pills — and how you mitigate each.
4. **Quantify.** "p99 < 300ms," "scale to 10k RPS," "RPO 5 min / RTO 30 min," "break-even at ~X requests/month." Numbers signal real experience.
5. **Think in layers / defense in depth** for both security and resilience.
6. **Show ownership beyond code:** observability, cost, on-call/runbooks, mentoring, IaC discipline, and incident response.
7. **Avoid over-engineering.** A modular monolith, multi-AZ (not multi-region), and managed services are often the *right* answer. Match complexity to actual needs.

**Recurring lead-level themes across all 100 questions:**
- Statelessness & horizontal scaling
- Idempotency + retries with backoff/jitter + DLQs
- Decoupling via queues/events (load leveling, resilience)
- Least privilege & defense in depth
- Observability built in from day one (logs/metrics/traces + correlation IDs + SLOs)
- Cost as an engineering KPI
- Graceful degradation over total failure (circuit breakers, load shedding, fallbacks)
- Measure before optimizing

Good luck with your Lead Backend Developer interview!
