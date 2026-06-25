# AWS Services — Head-to-Head Comparisons

Decision tables for the "X vs Y — which would you use and why?" questions that dominate lead interviews. Each section ends with a **decision rule** and a **lead-level note**.

---

## 1. Compute: Lambda vs Fargate vs ECS-on-EC2 vs EC2

| Dimension | Lambda | Fargate | ECS/EKS on EC2 | EC2 |
|-----------|--------|---------|----------------|-----|
| Model | Functions | Serverless containers | Containers on your VMs | Raw VMs |
| Scaling | Instant, to zero | Autoscale tasks (warm-up lag) | Autoscale + cluster capacity | ASG |
| Server mgmt | None | None (no host) | You manage hosts | You manage everything |
| Billing | Per request + GB-s | Per vCPU/mem second | EC2 hours (Spot/Reserved) | EC2 hours |
| Best for | Spiky/event-driven, glue | Long-running APIs/workers | High steady util, GPU, k8s | Legacy, full control |
| Limits | 15 min, cold starts, conn limits | Warm-up lag, no GPU | Ops overhead | Most ops |
| Cost sweet spot | Idle/spiky | Moderate, autoscaled | High steady utilization | High steady, specialized |

**Decision rule:** spiky/event → **Lambda**; steady containerized service → **Fargate**; very high steady utilization or GPU/k8s → **EC2-backed ECS/EKS**; legacy/full control → **EC2**.

**Lead-level note:** It's traffic shape × utilization × ops appetite × cost. Lambda is cheap when idle but can cost more than containers at sustained high RPS — do a break-even. Many real systems are hybrid (Lambda for async/glue, Fargate for the core API).

---

## 2. Messaging: SQS vs SNS vs EventBridge vs Kinesis

| Dimension | SQS | SNS | EventBridge | Kinesis Data Streams |
|-----------|-----|-----|-------------|----------------------|
| Pattern | Queue (pull) | Pub/sub fan-out (push) | Event bus + routing | Streaming log |
| Consumers | One pool per queue | Many subscribers | Many rule targets | Many (per shard, replay) |
| Ordering | FIFO (per group) | FIFO topics | No (best-effort) | Per shard |
| Delivery | At-least-once | At-least-once | At-least-once | At-least-once, replayable |
| Filtering | No (queue per type) | Basic (msg attributes) | Rich (content patterns) | Consumer-side |
| Retention/replay | Up to 14 days, no replay | None | Archive + replay | Retention window, replay |
| Throughput | Very high | Very high | High | Very high (shards) |
| Best for | Durable work buffering, load leveling | Broadcast, A2P (push/SMS) | Decoupled routing, SaaS, schemas | High-volume analytics/CDC |

**Decision rule:** buffer work for a worker pool → **SQS**; broadcast to many / send to people → **SNS**; route events by content to many AWS targets with filtering/replay → **EventBridge**; high-volume ordered stream with multiple consumers + replay → **Kinesis**.

**Lead-level note:** These aren't interchangeable. Common combos: **SNS→SQS** (fan-out + durable buffering), **API Gateway→SQS** (request buffering), **Kinesis→Lambda→Firehose→S3** (stream + lake), **EventBridge→Step Functions** (saga). Always add DLQs + idempotency.

---

## 3. Orchestration: Step Functions vs EventBridge vs chained Lambdas

| Dimension | Step Functions | EventBridge | Chained Lambdas |
|-----------|----------------|-------------|-----------------|
| Style | Orchestration (central) | Choreography (events) | DIY |
| State/visibility | Built-in, visual history | None (per-event) | You build it |
| Retries/error handling | Per-state, declarative | Target retry + DLQ | Hand-rolled |
| Saga/compensation | Native | Via events + logic | Hard |
| Best for | Multi-step workflows, sagas | Loose coupling, fan-out | Trivial sequences only |

**Decision rule:** complex multi-step workflow with retries/compensation → **Step Functions**; producers/consumers that shouldn't know each other → **EventBridge**; avoid hand-chaining Lambdas for anything non-trivial.

**Lead-level note:** Orchestration centralizes control and visibility; choreography maximizes decoupling but is harder to debug — invest in tracing.

---

## 4. Relational: RDS vs Aurora vs Aurora Serverless v2

| Dimension | RDS | Aurora | Aurora Serverless v2 |
|-----------|-----|--------|----------------------|
| Engine | MySQL/Postgres/etc. | MySQL/Postgres-compatible | MySQL/Postgres-compatible |
| Storage | Instance-attached | Distributed, auto-grow | Distributed, auto-grow |
| Read replicas | Up to 5 (async) | Up to 15 (low-lag, shared storage) | Same |
| Failover | Multi-AZ standby | Faster (shared storage) | Faster |
| Scaling | Manual instance resize | Manual + readers | **Auto** vCPU scaling |
| Best for | Standard relational, cost-sensitive | Higher perf/HA, more readers | Variable/intermittent load |

**Decision rule:** standard managed relational → **RDS**; need higher performance, more/faster readers, fast failover → **Aurora**; spiky/variable relational load → **Aurora Serverless v2**. (For globally distributed strong-consistency SQL, **Aurora DSQL**.)

**Lead-level note:** Multi-AZ = HA (not read scaling); read replicas = read scaling (watch lag). Use **RDS Proxy** with Lambda/large fleets to avoid connection exhaustion.

---

## 5. SQL vs NoSQL: RDS/Aurora vs DynamoDB

| Dimension | RDS / Aurora | DynamoDB |
|-----------|--------------|----------|
| Data model | Relational, flexible queries | Key-value/document, access-pattern-driven |
| Queries | Joins, aggregations, ad-hoc | Get/Query/Scan by keys/GSIs |
| Scale | Vertical + read replicas | Horizontal, virtually unlimited |
| Latency | Good; depends on tuning | Predictable single-digit ms |
| Connections | Pooled (limit pressure) | Connectionless (HTTP) — great for Lambda |
| Transactions | Full ACID | `TransactWriteItems` (scoped) |
| Ops | Patching, scaling, backups | Fully serverless |
| Best for | Complex domains, reporting | Known patterns, massive scale |

**Decision rule:** complex/ad-hoc queries + transactions → **relational**; known access patterns + massive scale + serverless → **DynamoDB**. Polyglot persistence (both) is common.

**Lead-level note:** The classic mistake is forcing relational thinking onto DynamoDB (or vice versa). Model DynamoDB from access patterns; reach for relational when query flexibility matters more than infinite scale.

---

## 6. Caching: ElastiCache Redis vs Memcached vs DAX

| Dimension | Redis | Memcached | DAX |
|-----------|-------|-----------|-----|
| Data types | Rich (lists/sets/sorted/hash/streams) | Simple key-value | DynamoDB items |
| Persistence/HA | Snapshots + replication + failover | None (volatile) | Managed |
| Threading | Single-threaded per shard | Multi-threaded | Managed |
| Extras | Pub/sub, Lua, geo, locks, TTL | Multi-node sharding | Microsecond DynamoDB reads |
| Best for | Sessions, leaderboards, locks, rate limit, backplane | Simple large ephemeral cache | Read-heavy DynamoDB hot keys |

**Decision rule:** default to **Redis** (covers ~90% of needs + HA); **Memcached** for simple multi-threaded volatile cache; **DAX** specifically to accelerate DynamoDB reads.

**Lead-level note:** Local in-memory caches are per-instance (inconsistent across a fleet) → use Redis for shared state. Avoid blocking Redis commands (`KEYS *`) in production.

---

## 7. Edge/API: API Gateway (REST vs HTTP) vs ALB

| Dimension | API Gateway REST | API Gateway HTTP | ALB |
|-----------|------------------|------------------|-----|
| Features | Most (keys, usage plans, WAF, caching, validation) | Core (JWT authz, routing) | LB features + WAF |
| Latency/cost | Higher | Lower/cheaper | Cheapest at high RPS |
| Auth | Cognito/Lambda/IAM authorizers | JWT/Lambda authorizer | Cognito/OIDC (+WAF) |
| Targets | Lambda, HTTP, AWS services | Lambda, HTTP | ECS/EC2/Lambda/IP |
| Best for | Full-featured managed APIs | Lean Lambda APIs | Long-running containers, high RPS |

**Decision rule:** Lambda public API needing API keys/usage plans/validation → **REST API**; lean Lambda API → **HTTP API**; containerized long-running service at high RPS → **ALB** (often behind CloudFront + WAF). Combine: API Gateway → VPC Link → ALB.

---

## 8. Storage: S3 vs EBS vs EFS

| Dimension | S3 | EBS | EFS |
|-----------|-----|-----|-----|
| Type | Object (HTTP API) | Block (one instance) | Shared NFS filesystem |
| Access | Many clients, anywhere | Single EC2 | Many EC2/ECS/Lambda |
| Use | Files, lake, assets, backups | OS/DB disk | Shared POSIX files |
| Scale | Unlimited | Volume size | Auto-grow |

**Decision rule:** app files/uploads/static/lake → **S3**; a disk for one instance/DB → **EBS**; shared filesystem across instances → **EFS**.

**Lead-level note:** Don't route large file bytes through your API — use **S3 pre-signed URLs** + event-driven processing.

---

## 9. Secrets/config: Secrets Manager vs SSM Parameter Store

| Dimension | Secrets Manager | SSM Parameter Store |
|-----------|-----------------|---------------------|
| Rotation | Native (built-in for RDS) | Manual/DIY |
| Cost | Per secret + API | Cheaper (free standard tier) |
| Structure | Secrets | Hierarchical params (String/SecureString) |
| Best for | Credentials needing rotation | Config + simpler secrets |

**Decision rule:** rotating credentials → **Secrets Manager**; general config + simpler secrets → **SSM Parameter Store** (SecureString). Both KMS-encrypted; fetch at runtime via the role.

---

## 10. Identity: Cognito vs IAM vs custom auth

| Dimension | Cognito | IAM | Custom (JWT in app) |
|-----------|---------|-----|---------------------|
| For | App end-users | AWS principals (services/people) | App users (DIY) |
| Output | OIDC JWTs / temp AWS creds | Temp AWS creds (STS) | Your tokens |
| Effort | Low (managed) | N/A (AWS access) | High (you own security) |

**Decision rule:** end-user auth → **Cognito** (or another managed IdP); service/resource access to AWS → **IAM roles**; only build custom auth when you have a hard requirement managed IdPs can't meet (you then own MFA, rotation, breach risk).

---

## 11. IaC: CDK vs CloudFormation vs Terraform vs SAM

| Dimension | CDK | CloudFormation | Terraform | SAM |
|-----------|-----|----------------|-----------|-----|
| Language | TS/Python/etc. | JSON/YAML | HCL | YAML (CFN superset) |
| Cloud | AWS | AWS | Multi-cloud | AWS serverless |
| State | CFN-managed | CFN-managed | Own state file | CFN-managed |
| Best for | Node/TS teams, testable infra | Native baseline | Multi-cloud, mature | Serverless-first |

**Decision rule:** Node/TS team wanting expressive, testable infra → **CDK**; multi-cloud/standardized org → **Terraform**; serverless-focused → **SAM**.

**Lead-level note:** Whatever the tool — version control, peer review, no click-ops in prod, separate state per env, least-privilege deploy roles.

---

## 12. Observability: CloudWatch vs X-Ray vs OpenTelemetry vs 3rd-party

| Dimension | CloudWatch | X-Ray | OpenTelemetry (ADOT) | Datadog/New Relic |
|-----------|-----------|-------|----------------------|-------------------|
| Pillar | Metrics + logs + alarms | Traces | Traces/metrics/logs (vendor-neutral) | All-in-one |
| Lock-in | AWS | AWS | Portable | Vendor |
| Best for | AWS-native baseline | AWS tracing | Portable instrumentation | Rich UX, multi-cloud |

**Decision rule:** AWS-native baseline → **CloudWatch (+ EMF)**; tracing → **OpenTelemetry → ADOT** (export to X-Ray or a vendor) for portability; rich product features/multi-cloud → a third-party APM.

**Lead-level note:** Instrument with OpenTelemetry to avoid lock-in; alert on SLO burn rate; correlate traces with structured-log correlation IDs.

---

## Quick "which service?" reflexes

- **Absorb a traffic spike** → SQS in front of workers (queue-based load leveling).
- **Broadcast an event to many consumers** → SNS (or EventBridge for filtering/replay).
- **Run something on a schedule reliably** → EventBridge Scheduler → Lambda/ECS.
- **Multi-step workflow with retries/compensation** → Step Functions.
- **Serverless + relational without connection pain** → RDS Proxy (or rethink to DynamoDB).
- **Cache shared across a fleet** → ElastiCache Redis (not in-process memory).
- **Large file upload** → S3 pre-signed URL + multipart, processed via S3 event.
- **Protect a public API** → CloudFront + WAF + (API Gateway throttling or app rate limiting).
- **Decouple OLTP from analytics** → Streams/Firehose → S3 + Athena / Redshift / OpenSearch.
- **Secrets needing rotation** → Secrets Manager; **plain config** → SSM Parameter Store.
