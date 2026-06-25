# AWS Services — Quick Review (Node.js Backend Lead)

A per-service refresher. Each entry: **What it is → When to use → Key features → Node.js tie-in → Gotchas (lead-level)**. Skim the ones you're rusty on before an interview.

---

## Compute

### AWS Lambda
- **What:** Event-driven, serverless function execution; you ship code, AWS runs and scales it.
- **When:** Spiky/unpredictable traffic, event processing (S3/SQS/Stream triggers), glue between services, cron jobs (with EventBridge), low-baseline APIs.
- **Key features:** Auto-scales to zero and up; pay per request + GB-second; triggers from 100s of sources; provisioned/reserved concurrency; layers; container image support (up to 10 GB).
- **Node.js tie-in:** First-class Node runtime; init SDK clients/DB pools **outside the handler** so warm invocations reuse them; bundle with esbuild and use **AWS SDK v3 modular clients** to cut cold starts.
- **Gotchas:** 15-min max; cold starts; **connection exhaustion** to RDS (one env = one connection → RDS Proxy); 6 MB sync payload; retries differ by source (make handlers idempotent).

### ECS on Fargate
- **What:** Run containers without managing servers; ECS orchestrates, Fargate provides the compute.
- **When:** Long-running APIs, WebSocket servers, workers; steady-but-autoscaled traffic; teams wanting containers without k8s.
- **Key features:** Per-second vCPU/memory billing; multi-AZ placement; ALB integration; task/execution roles; Fargate Spot for cheap workers.
- **Node.js tie-in:** One Node process per task; right-size vCPU; `awslogs` driver → CloudWatch; honor SIGTERM for graceful shutdown; set `--max-old-space-size` to ~75–80% of task memory.
- **Gotchas:** Pricier than EC2 at high steady utilization; no GPU; cold-ish scale-out (warm-up lag) → keep a sensible min count and autoscale on requests-per-target.

### ECS on EC2 / EKS / EC2
- **What:** ECS/EKS orchestration on EC2 you manage, or raw EC2 VMs.
- **When:** High steady utilization (Spot/Reserved cheaper), GPUs/custom AMIs, k8s ecosystem (EKS), or full OS control/legacy (EC2).
- **Gotchas:** More ops (patching, capacity, scaling). Don't pick EKS for the resume — it's real operational cost. EC2 is the fallback, not the default.

---

## Networking & edge

### VPC
- **What:** Logically isolated virtual network for your resources.
- **Key features:** Subnets (public/private/isolated), route tables, IGW/NAT, SGs, NACLs, VPC endpoints, peering/Transit Gateway.
- **Node.js tie-in:** Put app tasks in private subnets, DBs in isolated subnets; reach S3/DynamoDB/Secrets via **VPC endpoints** to avoid the public internet and reduce NAT cost.
- **Gotchas:** Lambda in a VPC can add cold-start/ENI considerations; NAT Gateway data processing is a sneaky cost.

### Application Load Balancer (ALB) / Network Load Balancer (NLB)
- **What:** ALB = layer-7 (HTTP); NLB = layer-4 (TCP/UDP).
- **When:** ALB for HTTP APIs, host/path routing, WebSockets, container/EC2/Lambda targets. NLB for extreme performance, static IPs, non-HTTP, or fronting with PrivateLink.
- **Node.js tie-in:** ALB target-group health check → your `/health/ready`; set `deregistration_delay` (connection draining) to pair with graceful shutdown for zero-downtime deploys.
- **Gotchas:** ALB is stateful per-connection; for WebSockets at scale you still need a Redis backplane or API Gateway WebSockets.

### API Gateway
- **What:** Fully managed API front door (REST, HTTP, WebSocket APIs).
- **When:** Public APIs needing auth (JWT/Cognito/Lambda authorizers), throttling, usage plans/API keys, request validation, caching — especially Lambda-backed.
- **Key features:** Throttling + usage plans, WAF integration, request/response transform, VPC Link to reach private ALB/NLB.
- **Node.js tie-in:** Offload coarse auth and rate limiting to the gateway; keep fine-grained authz in the app.
- **Gotchas:** Priced per request → can be costly at very high volume (consider ALB). HTTP APIs are cheaper/faster than REST APIs but with fewer features.

### CloudFront
- **What:** Global CDN with edge caching.
- **When:** Serve static assets/SPAs (from S3), cache cacheable GETs, accelerate dynamic traffic, absorb spikes, terminate TLS at the edge.
- **Key features:** Edge caching, origin offload, Shield/WAF, Lambda@Edge / CloudFront Functions, signed URLs/cookies.
- **Gotchas:** Cache invalidation is eventually consistent and costs money → **version asset filenames** instead. Design cache keys carefully.

### Route 53
- **What:** DNS + health checks.
- **When:** Domain management, failover (active-passive), latency/weighted/geo routing, multi-region DR.
- **Gotchas:** TTLs affect failover speed; health-check + failover routing is core to multi-region DR.

---

## Databases & caching

### RDS / Aurora
- **What:** Managed relational databases (RDS: MySQL/Postgres/MariaDB/Oracle/SQL Server; Aurora: cloud-native MySQL/Postgres-compatible).
- **When:** Complex queries/joins, transactions (ACID), reporting, well-understood relational domains.
- **Key features:** Multi-AZ (HA), read replicas (read scaling), automated backups + PITR, RDS Proxy; Aurora adds shared storage, up to 15 fast readers, fast failover, Global Database, Serverless v2; **Aurora DSQL** (distributed SQL, strong consistency, multi-region).
- **Node.js tie-in:** Use a tuned connection pool (pg/mysql); from Lambda use **RDS Proxy**; keep transaction boundaries at the service layer.
- **Gotchas:** Connection exhaustion at scale; replica lag (don't read-after-write from a replica); write scaling is hard (shard or move hot entities to DynamoDB).

### DynamoDB
- **What:** Fully managed serverless NoSQL key-value/document DB.
- **When:** Known access patterns, massive/unpredictable scale, single-digit-ms latency, connectionless (great with Lambda), high-write workloads (carts, sessions, IoT, events).
- **Key features:** On-demand/provisioned (+ auto scaling) capacity; GSIs/LSIs; strongly/eventually consistent reads; `TransactWriteItems`; **Streams** (CDC); **Global Tables**; PITR; DAX cache; TTL.
- **Node.js tie-in:** Use `@aws-sdk/lib-dynamodb` DocumentClient; conditional writes for idempotency/optimistic locking; batch + bounded concurrency to avoid throttling.
- **Gotchas:** Model around access patterns first (not normalization); **hot partitions** (high-cardinality keys + write sharding); ad-hoc queries/joins are painful; GSIs cost extra capacity.

### ElastiCache (Redis / Memcached)
- **What:** Managed in-memory cache/store.
- **When:** Hot reads (cache-aside), sessions, rate limiting, leaderboards (sorted sets), distributed locks, pub/sub, WebSocket backplane (Redis); simple large ephemeral cache (Memcached).
- **Node.js tie-in:** `ioredis`; NestJS `CacheModule` with Redis store; always TTL + invalidation strategy; guard against **cache stampede** (single-flight lock, jittered TTL).
- **Gotchas:** Local in-memory cache is per-instance (inconsistent across a fleet) → use Redis for shared state; Redis is single-threaded per shard (avoid `KEYS *` and blocking commands).

### Redshift / OpenSearch / Athena
- **What:** Redshift = columnar warehouse (OLAP); OpenSearch = search + log analytics; Athena = serverless SQL over S3.
- **When:** Offload analytics/search from the OLTP DB. Sync via Streams/CDC/Firehose.
- **Gotchas:** Keep **OLTP and OLAP separate** — running analytics on the prod DB degrades user latency.

---

## Messaging & events

### SQS
- **What:** Managed message queue (Standard + FIFO).
- **When:** Durable async work, **queue-based load leveling** (absorb spikes), decoupling producer/consumer.
- **Key features:** At-least-once (Standard) / ordered + exactly-once-processing per group (FIFO); visibility timeout; DLQ; long polling; batch.
- **Node.js tie-in:** Lambda event source with **partial batch response**; or a Fargate consumer autoscaled on **queue depth/age**; make consumers idempotent.
- **Gotchas:** 256 KB message limit (use S3 claim-check); duplicates happen → idempotency; poison messages → DLQ + redrive.

### SNS
- **What:** Pub/sub fan-out (push).
- **When:** Broadcast one message to many subscribers; mobile push/SMS/email (A2P); SNS→multiple SQS fan-out.
- **Gotchas:** No message retention/replay like a queue; pair with SQS for durability; for rich routing/filtering prefer EventBridge.

### EventBridge
- **What:** Serverless event bus with content-based routing.
- **When:** Decoupled event-driven architectures, SaaS integrations, schema registry, archive/replay, scheduled events (Scheduler).
- **Gotchas:** Slightly higher latency than SNS for simple fan-out; great filtering/targets but think about debugging (tracing) and DLQs.

### Kinesis Data Streams / Firehose
- **What:** Streams = ordered, replayable real-time stream (per shard); Firehose = managed delivery to S3/Redshift/OpenSearch.
- **When:** High-volume ingestion (clickstream/IoT), multiple consumers, replay/backfill; Firehose for no-code batching to a lake.
- **Gotchas:** Shard/partition-key design controls throughput (avoid hot shards); ordering only within a shard; poison-pill can block a shard (bisect/failure destination).

### Step Functions
- **What:** Managed state machine for orchestrating workflows.
- **When:** Multi-step workflows with retries/branching, **saga** compensation, human-in-the-loop, long-running processes.
- **Gotchas:** Standard (durable, up to 1 yr) vs Express (high-volume, short); don't use for simple sync request/response (added latency/cost). Orchestration (SFN) vs choreography (EventBridge).

---

## Storage

### S3
- **What:** Object storage; 11 9's durability.
- **When:** Files, uploads, static assets, data lake, backups, logs.
- **Key features:** Storage classes + lifecycle, versioning, encryption (SSE-KMS), event notifications, pre-signed URLs, multipart upload, Object Lock (immutability).
- **Node.js tie-in:** **Pre-signed URLs** for direct client uploads/downloads; `@aws-sdk/lib-storage` `Upload` for streaming multipart with backpressure; S3 event → SQS/Lambda for processing.
- **Gotchas:** Don't proxy large files through your API tier; lock down bucket policies + short pre-signed expiry; consider CloudFront for downloads.

### EBS / EFS
- **What:** EBS = block volume for one EC2; EFS = shared NFS filesystem for many.
- **Gotchas:** EBS is single-AZ/single-instance (snapshot to S3 for backup); EFS for shared POSIX access (e.g., legacy apps), but watch latency/cost vs S3.

---

## Security & identity

### IAM / STS
- **What:** Identity and access management; STS issues temporary credentials.
- **Node.js tie-in:** SDK auto-loads the task/function role — **no static keys in code/env**.
- **Gotchas:** One scoped role per workload; resource-level ARNs + conditions; task role ≠ execution role; deny-by-default, explicit-deny wins.

### Cognito
- **What:** Managed identity: User Pools (auth, JWTs) + Identity Pools (temp AWS creds).
- **Node.js tie-in:** Verify Cognito JWTs against JWKS in a NestJS guard, or use an API Gateway Cognito authorizer; map Cognito groups to roles.
- **Gotchas:** Verify iss/aud/token_use/exp; coarse auth at edge + fine-grained in app.

### KMS / Secrets Manager / SSM Parameter Store
- **What:** Encryption keys / rotated secrets / config + secrets.
- **Node.js tie-in:** Fetch secrets at runtime via the role; cache in memory; refresh on rotation; inject into ECS via `secrets` (not baked into the image).
- **Gotchas:** Secrets Manager for rotation (native RDS); SSM SecureString is cheaper for simpler secrets; never log secrets; pre-commit secret scanning.

### WAF / Shield / GuardDuty
- **What:** L7 filtering / DDoS protection / threat detection.
- **Gotchas:** Tune WAF in count mode first; defense in depth protects both security and cost (block malicious load before it scales your backend).

---

## Observability

### CloudWatch (Logs / Metrics / Alarms)
- **Node.js tie-in:** Structured JSON logs (pino) via `awslogs`; emit custom metrics via **EMF**; alarm on user-facing symptoms + leading indicators (event-loop lag, queue depth).
- **Gotchas:** Log volume/cardinality = cost; set retention tiers; separate immutable audit logs.

### X-Ray / OpenTelemetry (ADOT)
- **What:** Distributed tracing + service map.
- **Node.js tie-in:** Auto-instrument HTTP/DB/AWS SDK; propagate trace context into SQS attributes; correlate with log correlation IDs (`AsyncLocalStorage`).
- **Gotchas:** Sample to control cost; prefer OpenTelemetry for portability.

---

## Deployment & IaC

### CDK / CloudFormation / SAM / Terraform
- **Node.js tie-in:** **CDK in TypeScript** is ideal for a Node team — same language, testable infra.
- **Gotchas:** Separate state per env; least-privilege deploy roles; plan/preview before apply; secrets out of state; review infra PRs like code.

### CodePipeline / CodeBuild / CodeDeploy / ECR
- **What:** CI/CD + image registry.
- **Gotchas:** Blue/green or canary via CodeDeploy with alarm-based auto-rollback; image scanning gates; backward-compatible (expand/contract) DB migrations so old+new versions coexist during a deploy.
