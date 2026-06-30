# 3. AWS Compute & Serverless — Lambda, ECS, EC2, Fargate (Q31–Q44)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Prev:** [← 2. NestJS & Express.js](./02-nestjs-expressjs.md) · **Next:** [4. Scaling & Resilience →](./04-scaling-load-resilience.md)

---

## 3. AWS Compute & Serverless (Lambda, ECS, EC2, Fargate)

### Q31. How do you decide between AWS Lambda, ECS Fargate, ECS on EC2, and plain EC2 for a Node.js backend?

**Short answer:** Match the workload: Lambda for spiky/event-driven and low-ops; Fargate for steady containerized services without managing servers; ECS/EKS on EC2 for cost optimization at high steady scale or special hardware; EC2 for full control/legacy.

**Detailed answer:**
- **Lambda:** event-driven, bursty, unpredictable traffic, short-lived (<15 min) tasks. Pay per invocation, scales to zero, no server management. Watch cold starts, 15-min limit, and connection management to RDS.
- **ECS Fargate:** containers without managing the host. Best for long-running APIs, WebSocket servers, predictable + autoscaled traffic. Per-second vCPU/memory billing; simpler than EKS.
- **ECS/EKS on EC2:** when you have high, steady utilization (reserved/spot EC2 is cheaper than Fargate per unit), need GPUs, or specific instance types. More ops.
- **EC2:** full OS control, legacy apps, or specialized networking.

**Lead-level insight:** The decision is **traffic shape × ops appetite × cost**. Spiky → Lambda; steady → Fargate; very large + steady → EC2-backed for savings. A lead should also mention you can mix: Lambda for async/glue, Fargate for the core API.

---

### Q32. What causes Lambda cold starts and how do you minimize them for a Node.js function?

**Short answer:** Cold starts come from provisioning a new execution environment + initializing the runtime/your code. Minimize with smaller bundles, provisioned concurrency, SnapStart-style techniques, and keeping init lean.

**Detailed answer:**
A cold start happens when no warm environment exists: AWS creates a microVM, loads the runtime, downloads your code, and runs the init (module load + handler-outside code). For Node this is usually tens to a few hundred ms.

**Mitigations:**
- **Smaller deployment package:** tree-shake/bundle with esbuild; fewer/lighter dependencies = faster load. Avoid pulling the whole AWS SDK; import only needed clients (SDK v3 modular clients).
- **Provisioned Concurrency:** pre-warms N environments for latency-critical paths (costs money).
- **Init outside the handler:** create SDK clients and DB connections in the module scope so they're reused across warm invocations.
- **Right-size memory:** more memory = more CPU = faster init/execution; benchmark with Lambda Power Tuning.
- **Avoid VPC cold-start penalty** by using modern ENI sharing (already improved) and keeping VPC config only when needed.

**Lead-level insight:** Distinguish cold-start cost from *steady-state* latency. For user-facing synchronous APIs with tight SLAs, provisioned concurrency or a container (Fargate) may be the better call; for async/event processing, cold starts rarely matter.

---

### Q33. How do you manage database connections from Lambda to RDS without exhausting connections?

**Short answer:** Lambda's scale-out can open thousands of DB connections; use **RDS Proxy** to pool/multiplex, cap per-function concurrency, and reuse connections across warm invocations.

**Detailed answer:**
Each concurrent Lambda execution environment opens its own DB connection. Under a burst, hundreds/thousands of concurrent executions can blow past RDS `max_connections`, causing connection errors and cascading failures.

**Solutions:**
- **RDS Proxy:** sits between Lambda and RDS, pools and reuses connections, handles failover faster, and enforces limits. The standard answer for Lambda + relational DB.
- **Reserved/maximum concurrency:** cap the function's concurrency so it can't open more connections than the DB can handle.
- **Connection reuse:** create the client/pool *outside* the handler so warm invocations reuse it; set small pool sizes.
- **Consider DynamoDB:** for serverless-first designs, a connectionless, HTTP-based datastore (DynamoDB) sidesteps the problem entirely.

**Lead-level insight:** This is *the* classic serverless + relational pitfall. Naming RDS Proxy plus the architectural alternative (DynamoDB for serverless) signals real production experience.

---

### Q34. Explain API Gateway vs Application Load Balancer in front of Node.js compute. When do you use each?

**Short answer:** API Gateway for managed API features (auth, throttling, request validation, usage plans, REST/HTTP/WebSocket) — often with Lambda; ALB for load-balancing long-running container/EC2 services with lower per-request cost at high volume.

**Detailed answer:**
- **API Gateway:** fully managed API front door. Built-in JWT/Cognito/Lambda authorizers, throttling, request/response validation, caching, API keys/usage plans, WebSocket APIs. Great with Lambda; HTTP APIs are cheaper/faster than REST APIs. Priced per request — can get expensive at very high volume.
- **ALB:** layer-7 load balancer for ECS/EC2/Lambda targets. Path/host routing, sticky sessions, WebSockets, lower cost at high sustained throughput. Fewer API-management features (pair with WAF/Cognito for some).

**Lead-level insight:** Lambda-backed public APIs → API Gateway. Containerized long-running services with high RPS → ALB (often behind CloudFront + WAF). You can also use API Gateway → VPC Link → ALB to get API features in front of containers.

---

### Q35. How does Lambda concurrency work, and how do reserved vs provisioned concurrency differ?

**Short answer:** Lambda scales by adding concurrent execution environments up to an account limit; **reserved** concurrency caps/guarantees a function's share, **provisioned** concurrency pre-initializes environments to eliminate cold starts.

**Detailed answer:**
- **Concurrency** = number of in-flight executions. Default account limit (e.g., 1,000) shared across functions; bursts scale up rapidly then at a steady rate.
- **Reserved concurrency:** carves out a guaranteed (and maximum) slice for a function. Protects it from being starved by others *and* protects downstreams (like RDS, Q33) from being overwhelmed by that function.
- **Provisioned concurrency:** keeps N environments warm and initialized → no cold starts for those N. Costs money even when idle; often paired with Application Auto Scaling on a schedule.

**Lead-level insight:** Use reserved concurrency as both a *fairness* and a *protection* lever (cap a function hitting a fragile downstream). Use provisioned concurrency only on latency-critical synchronous paths, scheduled to match traffic to control cost.

---

### Q36. How do you do zero-downtime deployments on ECS, and what deployment strategies exist?

**Short answer:** Use rolling updates with health checks + connection draining, or blue/green via CodeDeploy, and canary/linear shifting for risk control.

**Detailed answer:**
- **Rolling update (ECS default):** start new tasks, wait for them to pass ALB health checks, drain and stop old ones. Controlled by `minimumHealthyPercent`/`maximumPercent`. Combined with graceful shutdown (Q9) → zero downtime.
- **Blue/Green (CodeDeploy):** stand up a parallel "green" task set, shift traffic at the ALB, keep "blue" for instant rollback. Supports **canary** (e.g., 10% then 100%) and **linear** shifts with CloudWatch alarm-based auto-rollback.
- **Health checks:** ALB target group health + ECS container health checks gate the rollout.

**Lead-level insight:** Tie deployment to **automatic rollback** on alarms (error rate, latency). Mention DB migration safety: backward-compatible (expand/contract) migrations so old and new task versions can run simultaneously during the shift.

---

### Q37. How do you use Step Functions to orchestrate a Node.js workflow, and when is it better than chaining Lambdas?

**Short answer:** Step Functions is a managed state machine for orchestrating multi-step workflows with built-in retries, error handling, parallelism, and visibility — far more robust than Lambdas calling Lambdas.

**Detailed answer:**
Chaining Lambdas manually means you hand-roll retries, state passing, error handling, and you lose visibility. Step Functions externalizes the orchestration:
- Declarative states (Task, Choice, Parallel, Map, Wait), per-state retry/backoff and catch.
- **Standard** workflows for long-running/durable (up to a year), **Express** for high-volume short workflows.
- Visual execution history for debugging; integrates directly with 200+ AWS services (often no glue Lambda needed).

**Real-time use case:** Order fulfillment: validate → charge payment (retry on transient failure) → reserve inventory → in parallel send email + update analytics → on any failure, compensating refund step (saga). Each step's state and failures are visible.

**Lead-level insight:** Use Step Functions when you need durable orchestration, human-in-the-loop waits, or saga-style compensation. Don't use it for simple synchronous request/response — that's added latency/cost. Distinguish **orchestration** (Step Functions) from **choreography** (EventBridge/SNS events).

---

### Q38. What is EventBridge and how does it fit an event-driven Node.js architecture?

**Short answer:** EventBridge is a serverless event bus that routes events from sources to targets using rules/patterns, enabling decoupled, event-driven systems with schema discovery and filtering.

**Detailed answer:**
Producers publish events to a bus; **rules** match event patterns and route to targets (Lambda, SQS, Step Functions, other buses, SaaS). Features: content-based filtering, schema registry, archive/replay, and scheduling (EventBridge Scheduler).

**Vs SNS:** SNS is simple high-throughput pub/sub (fan-out to subscribers); EventBridge adds rich filtering, many AWS targets, schema registry, replay, and SaaS integrations — better for complex routing. SNS is cheaper/faster for simple fan-out.

**Real-time use case:** A `UserSignedUp` event routes to: a welcome-email Lambda, an analytics queue, and a CRM integration — producers don't know consumers, so you add consumers without touching producers.

**Lead-level insight:** Event-driven decoupling improves resilience and team autonomy but introduces eventual consistency and harder debugging — pair with tracing (Q29) and DLQs. Use the archive/replay feature for recovery and backfills.

---

### Q39. How do you handle Lambda errors, retries, and dead-letter queues for reliability?

**Short answer:** Retry behavior depends on the invocation type; configure DLQs/on-failure destinations, make handlers idempotent, and use partial batch responses for stream/queue sources.

**Detailed answer:**
- **Async invocations** (S3, SNS, EventBridge): Lambda retries twice on failure, then sends to a **DLQ** or **on-failure destination** (SQS/SNS). Configure max retries and max event age.
- **Stream sources** (Kinesis/DynamoDB Streams): retries block the shard by default (poison-pill risk); use `bisectBatchOnFunctionError`, max retry, and a failure destination.
- **SQS source:** failed messages return to the queue and go to the queue's DLQ after `maxReceiveCount`. Use **partial batch response** (`ReportBatchItemFailures`) so only failed messages are retried, not the whole batch.
- **Idempotency:** retries mean handlers must be idempotent (dedupe by message/idempotency key).

**Lead-level insight:** The poison-pill problem (one bad record blocking a shard) and partial batch responses are strong lead-level signals. Always pair retries with idempotency + DLQ alarms + a replay/redrive plan.

---

### Q40. How would you containerize and deploy a NestJS app to ECS Fargate end to end?

**Short answer:** Multi-stage Docker image → push to ECR → ECS task definition (with task role, secrets, logging) → ECS service behind an ALB with autoscaling → CI/CD pipeline with rolling/blue-green deploys.

**Detailed answer:**
1. **Image:** multi-stage Dockerfile (Q15), non-root, healthcheck. Build in CI, scan, push to **ECR**.
2. **Task definition:** container image, CPU/memory, **task role** (app permissions) vs **execution role** (pull image, read secrets), `secrets` from Secrets Manager/SSM, `awslogs` driver to CloudWatch, port mappings.
3. **Service:** desired count, ALB target group, health checks, placement across AZs, `minimumHealthyPercent`/`maximumPercent` for rolling deploys.
4. **Autoscaling:** target tracking on CPU/memory or ALB request count per target.
5. **Networking:** private subnets, security groups, NAT for egress, ALB in public subnets.
6. **CI/CD:** CodePipeline/GitHub Actions → build/test → push → update service (or CodeDeploy blue/green).

**Lead-level insight:** Emphasize task role vs execution role distinction, secrets injected at runtime (not baked), multi-AZ placement, and IaC (CDK/Terraform) so the whole thing is reproducible and reviewable.

---

### Q41. What are the trade-offs of serverless vs containers regarding cost, scaling, and operations?

**Short answer:** Serverless minimizes ops and scales to zero (great for spiky/low traffic) but can cost more at sustained high volume and has limits (15-min, cold starts); containers give control and cheaper steady-state but require scaling/patching management.

**Detailed answer:**
- **Cost:** Lambda bills per request+duration — cheap when idle/spiky, potentially expensive at constant high RPS. Containers (Fargate/EC2) bill for running capacity — cheaper when highly utilized, wasteful when idle.
- **Scaling:** Lambda scales near-instantly to zero and up; containers scale via autoscaling with warm-up lag and a minimum running count.
- **Ops:** Lambda = no servers/patching; containers = manage images, scaling policies, OS/runtime patching (less with Fargate).
- **Limits:** Lambda 15-min, payload/ephemeral storage limits, cold starts; containers have none of these but cost idle capacity.

**Lead-level insight:** The mature answer is "it depends on traffic shape and utilization," often with a **break-even analysis**: model requests/duration vs container hours. Many real systems are hybrid.

---

### Q42. How do you manage IAM permissions for Lambda/ECS following least privilege?

**Short answer:** Give each function/task its own role scoped to exactly the resources/actions it needs, use resource-level ARNs and conditions, and never use wildcard admin or shared over-broad roles.

**Detailed answer:**
- **Per-workload roles:** one IAM role per Lambda/ECS task (task role), not a shared role. This limits blast radius.
- **Scope tightly:** specify exact actions (`dynamodb:GetItem`, not `dynamodb:*`) and resource ARNs (specific table, specific S3 prefix), add `Condition` keys where possible.
- **Execution vs task role (ECS):** execution role pulls images/reads secrets; task role grants the app's runtime permissions.
- **Tooling:** IAM Access Analyzer to right-size; generate policies from CloudTrail usage; permission boundaries for guardrails.

**Lead-level insight:** Least privilege is iterative — start minimal, add as denied actions surface in CloudTrail. As a lead you enforce this via IaC + policy review and avoid the "just give it admin to unblock" anti-pattern.

---

### Q43. How do you handle large file uploads/downloads with S3 from a Node.js backend?

**Short answer:** Use **pre-signed URLs** so clients upload/download directly to/from S3 (bypassing your servers), multipart upload for large files, and stream rather than buffer.

**Detailed answer:**
- **Pre-signed URLs:** backend generates a time-limited signed URL; client `PUT`s the file straight to S3. Your compute never proxies the bytes → no memory/bandwidth bottleneck, cheaper, scalable.
- **Multipart upload:** for large files, split into parts (parallel, resumable). `@aws-sdk/lib-storage` `Upload` handles multipart + backpressure when you must stream through the server.
- **Downloads:** pre-signed GET URLs or serve via CloudFront with signed URLs/cookies.
- **Post-processing:** S3 event → SQS/Lambda to process (virus scan, transcode, thumbnail).

**Real-time use case:** User uploads a 2GB video: app returns a pre-signed multipart upload; on `s3:ObjectCreated`, EventBridge triggers a transcoding workflow; user is notified when ready.

**Lead-level insight:** Routing big payloads through Node is a scaling/cost anti-pattern. Pre-signed URLs + event-driven processing is the canonical pattern — say it explicitly. Lock down with short expiry, content-type/size conditions, and bucket policies.

---

### Q44. How do you manage infrastructure as code, and why does it matter for a lead?

**Short answer:** Define all infra with IaC (AWS CDK, Terraform, CloudFormation, or SAM/Serverless Framework) in version control, with peer review, environments, and automated pipelines — no manual console changes.

**Detailed answer:**
- **Tools:** AWS CDK (TypeScript — same language as the team, great for Node shops), Terraform (multi-cloud, mature), SAM/Serverless Framework (serverless-focused).
- **Benefits:** reproducible environments, code review for infra changes, drift detection, rollback, and disaster recovery by redeploy.
- **Practices:** separate state per environment, least-privilege deploy roles, plan/preview before apply, modular/reusable constructs, secrets out of state.

**Lead-level insight:** As a lead you mandate "no click-ops in prod," review infra PRs, and treat infra changes with the same rigor as app code. CDK is especially attractive for a Node/TS team because the same language and testing tools apply.

---


