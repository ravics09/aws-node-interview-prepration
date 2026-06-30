# AWS Cheat Sheet — for a Node.js Backend Lead

Dense, high-recall reference. Grouped by domain. "Limits" are common defaults/soft quotas — confirm current values in AWS docs before relying on them in production.

---

## Compute

| Service | One-liner | Reach for it when |
|---------|-----------|-------------------|
| **Lambda** | Event-driven serverless functions | Spiky/unpredictable traffic, glue/event processing, scale-to-zero |
| **Fargate (ECS/EKS)** | Serverless containers | Long-running APIs/WebSockets, steady-but-autoscaled traffic, no server mgmt |
| **ECS on EC2** | Container orchestration on your EC2 | High steady utilization, Spot savings, GPU/custom AMI |
| **EKS** | Managed Kubernetes | You need k8s ecosystem/portability and have the ops maturity |
| **EC2** | Virtual machines | Full OS control, legacy, specialized networking |
| **App Runner** | Push container/repo → managed HTTPS service | Simple web apps without ALB/ECS wiring |
| **Batch** | Managed batch compute | Large parallel batch jobs |

**Lambda facts:** max timeout **15 min**; memory 128 MB–10 GB (CPU scales with memory); `/tmp` ephemeral storage 512 MB–10 GB; payload **6 MB** sync / **256 KB** async; default account concurrency **1,000** (soft); deployment package 50 MB zipped / 250 MB unzipped, or **10 GB** container image. **One concurrent execution = one environment = one DB connection** → use **RDS Proxy**.

**Cold start levers:** small bundle (esbuild + SDK v3 modular clients), init clients outside the handler, **provisioned concurrency** for latency-critical paths, right-size memory.

---

## Networking & edge

| Service | One-liner |
|---------|-----------|
| **VPC** | Your isolated network; subnets (public/private/isolated), route tables |
| **ALB** | Layer-7 LB: host/path routing, WebSockets, target groups, health checks |
| **NLB** | Layer-4 LB: TCP/UDP, ultra-low latency, static IP, millions of req/s |
| **API Gateway** | Managed API front door: auth, throttling, validation, REST/HTTP/WebSocket |
| **CloudFront** | Global CDN; edge caching, origin offload, Shield/WAF integration |
| **Route 53** | DNS + health checks + routing policies (latency, failover, weighted, geo) |
| **NAT Gateway** | Egress for private subnets (watch data-processing cost) |
| **VPC Endpoints** | Private access to AWS services (Gateway: S3/DynamoDB free; Interface: PrivateLink) |
| **Security Group** | Stateful, instance/ENI-level firewall |
| **NACL** | Stateless, subnet-level firewall (backstop) |

**Subnet tiers:** public (ALB, NAT) → private app (ECS/Lambda, egress via NAT) → isolated data (RDS/ElastiCache, no internet). **SGs do the real work; NACLs are a backstop.**

---

## Databases & caching

| Service | Model | Reach for it when |
|---------|-------|-------------------|
| **RDS** (Postgres/MySQL/etc.) | Relational, managed | Complex queries/joins, transactions, moderate scale |
| **Aurora** | Cloud-native relational | Same as RDS + higher performance, up to 15 readers, fast failover |
| **Aurora Serverless v2** | Auto-scaling Aurora | Variable/intermittent relational workloads |
| **DynamoDB** | NoSQL key-value/document | Known access patterns, massive scale, single-digit-ms, serverless/connectionless |
| **ElastiCache (Redis)** | In-memory cache/store | Hot reads, sessions, leaderboards, rate limiting, pub/sub, locks |
| **ElastiCache (Memcached)** | Simple multi-threaded cache | Large, simple, ephemeral key-value cache |
| **DAX** | DynamoDB in-memory cache | Read-heavy DynamoDB hot keys (microsecond reads) |
| **Redshift** | Columnar data warehouse | OLAP / BI / large aggregations |
| **OpenSearch** | Search + log analytics | Full-text/faceted search, log exploration |
| **DocumentDB / Neptune / Timestream / Keyspaces** | Mongo-compatible / graph / time-series / Cassandra | Specialized models |

**Relational scaling:** Multi-AZ = HA (synchronous standby, **not** readable on classic RDS); **read replicas** = read scaling (async, replica lag). **RDS Proxy** pools connections (essential for Lambda/large fleets).

**DynamoDB:** partition key must be high-cardinality (avoid **hot partitions** → write sharding/DAX); on-demand vs provisioned (+ auto scaling) capacity; **strongly vs eventually consistent** reads; `TransactWriteItems` for ACID; **Streams** for CDC; **Global Tables** for active-active multi-region; PITR up to 35 days.

---

## Messaging & events

| Service | Pattern | Use when |
|---------|---------|----------|
| **SQS Standard** | Pull queue, at-least-once, best-effort order | Durable work buffering, load leveling, one consumer pool |
| **SQS FIFO** | Ordered + exactly-once-processing per group | Per-entity ordering, no duplicates |
| **SNS** | Pub/sub fan-out (push) | Broadcast to many subscribers; mobile push/SMS/email (A2P) |
| **EventBridge** | Event bus w/ content filtering + many targets | Decoupled routing, SaaS integration, schema registry, replay |
| **EventBridge Scheduler** | Managed cron/one-time schedules at scale | Reliable scheduled triggers (no duplicate-cron problem) |
| **EventBridge Pipes** | Source → filter/enrich → target | Point-to-point integration glue |
| **Kinesis Data Streams** | Ordered, replayable stream (per shard) | High-volume streaming, multiple consumers, replay |
| **Kinesis Firehose** | Managed delivery to S3/Redshift/OpenSearch | No-code batching/loading of streams to a lake/warehouse |
| **MSK** | Managed Kafka | Existing Kafka ecosystem, very high throughput |
| **Step Functions** | Managed state machine | Orchestration, retries, saga/compensation, long-running workflows |
| **Amazon MQ** | Managed ActiveMQ/RabbitMQ | Lift-and-shift apps needing JMS/AMQP protocols |

**Canonical combos:** SNS→SQS fan-out (broadcast + durable buffering); API Gateway→SQS (request buffering); Kinesis→Lambda→Firehose→S3 (stream + lake); EventBridge→Step Functions (saga). **SQS DLQ** after `maxReceiveCount`; **partial batch response** (`ReportBatchItemFailures`) for Lambda+SQS.

**SQS limits:** message ≤ **256 KB** (use S3 + claim-check for bigger); visibility timeout default 30s (max 12h); retention up to 14 days; FIFO ~3,000 msg/s with batching per API.

---

## Storage

| Service | One-liner |
|---------|-----------|
| **S3** | Object storage; 11 9's durability; events, lifecycle, versioning, encryption |
| **EBS** | Block storage for one EC2 (gp3/io2); like a virtual disk |
| **EFS** | Managed NFS; shared POSIX filesystem across many instances |
| **FSx** | Managed Windows/Lustre/NetApp/OpenZFS filesystems |
| **S3 Glacier** | Cold/archival storage tiers |

**S3 classes:** Standard, Intelligent-Tiering (auto), Standard-IA, One Zone-IA, Glacier Instant/Flexible/Deep Archive. **Large uploads:** pre-signed URLs + multipart (never proxy big bytes through your API). Object event → EventBridge/SNS/SQS for processing.

---

## Security & identity

| Service | One-liner |
|---------|-----------|
| **IAM** | Users, roles (temp STS creds), policies (deny-by-default, explicit-deny-wins) |
| **Cognito** | Managed user pools (OIDC JWTs) + identity pools (temp AWS creds) |
| **KMS** | Managed encryption keys, key policies, rotation, CloudTrail audit |
| **Secrets Manager** | Secret storage + **rotation** (native for RDS) |
| **SSM Parameter Store** | Config + SecureString secrets (cheaper, hierarchical) |
| **WAF** | Layer-7 filtering: SQLi/XSS, rate-based, bot, geo/IP rules |
| **Shield** | DDoS protection (Standard free; Advanced + cost protection) |
| **GuardDuty** | Threat detection from logs/network |
| **Security Hub / Config / CloudTrail / Inspector** | Posture / compliance / API audit / vuln scanning |
| **STS** | Temporary credentials (AssumeRole) |

**Mantras:** roles not static keys; least privilege per workload (one role per Lambda/task, scoped to exact actions + ARNs); ECS **task role** (app perms) ≠ **execution role** (pull image / read secrets); encrypt everything (the nuance is **key management**); verify JWTs (RS256/JWKS, check iss/aud/exp, reject `alg:none`).

---

## Observability

| Service | One-liner |
|---------|-----------|
| **CloudWatch Logs** | Log aggregation + Logs Insights queries |
| **CloudWatch Metrics** | Time-series; custom metrics via SDK or **EMF** (metrics in logs) |
| **CloudWatch Alarms** | Threshold/anomaly alarms → SNS/auto-action; composite alarms reduce noise |
| **X-Ray** | Distributed tracing + service map (or **OpenTelemetry** → ADOT) |
| **CloudWatch Synthetics / RUM** | Canary checks / real-user monitoring |

**Frameworks:** **RED** (Rate/Errors/Duration) for services + **USE** (Utilization/Saturation/Errors) for resources; Node-specific: event-loop lag, GC, heap. Use **percentiles**, not averages. Alert on **SLO burn rate**, not every blip. Liveness (restart) vs readiness (stop routing) probes.

---

## Deployment & IaC

| Service | One-liner |
|---------|-----------|
| **CloudFormation** | Native declarative IaC (JSON/YAML) |
| **CDK** | IaC in TypeScript/etc. → synthesizes CloudFormation (great for Node teams) |
| **SAM** | Serverless-focused IaC on top of CloudFormation |
| **Terraform** | Multi-cloud IaC (HCL), own state |
| **CodePipeline / CodeBuild / CodeDeploy** | CI/CD: pipeline / build / blue-green & canary deploys |
| **ECR** | Container registry + image scanning |

**ECS deploys:** rolling (`minimumHealthyPercent`/`maximumPercent`) or **blue/green via CodeDeploy** (canary/linear + alarm-based auto-rollback). Pair with graceful shutdown + connection draining for zero downtime. **No click-ops in prod.**

---

## Cost levers (quick)

- Right-size (Compute Optimizer); **Savings Plans/Reserved** for baseline, **Spot/Fargate Spot** for fault-tolerant workers.
- Scale to demand (autoscaling, scale-to-zero); cache (CloudFront/ElastiCache) to cut compute + DB.
- S3 lifecycle/Intelligent-Tiering; compress payloads (data transfer is a hidden cost); watch **NAT Gateway** and **log volume/cardinality** costs.
- **Serverless vs container break-even:** Lambda cheap when idle/spiky, pricey at sustained high RPS; containers cheaper when highly utilized.
- Cost allocation **tags** per team/service; budgets + alarms.

---

## "Decision driver" quick map

| If the question is about… | Lead with… |
|---------------------------|-----------|
| Compute choice | traffic shape × utilization × ops appetite × cost |
| SQL vs NoSQL | query complexity / access-pattern predictability / scale / consistency |
| Messaging service | fan-out vs buffering vs routing vs streaming; ordering; delivery guarantee |
| HA design | RTO/RPO from the business → multi-AZ default, multi-region only if justified |
| Security | least privilege + defense in depth + encrypt + verify-everything |
| Scaling | statelessness, autoscale on the right metric, queue-based load leveling |
| Reliability | idempotency + retries(backoff+jitter) + DLQ + circuit breaker + graceful degradation |
