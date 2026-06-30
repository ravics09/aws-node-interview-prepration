# AWS Real-Time Scenarios — Detailed Walkthroughs (Interview Edition)

> This is the **long-form companion** to [aws-services-realtime-scenarios.md](./aws-services-realtime-scenarios.md). That file is the quick-reference cheat version; **this file is how you would actually talk through each scenario in a live interview** — out loud, structured, with reasoning, numbers, and trade-offs.

## How to use this file

For each scenario you'll find:
- **The question & how to open** — clarifying questions to ask first (interviewers love this; it shows seniority).
- **How I'd explain it (narrative)** — the spoken-style walkthrough, in the order you'd actually say it.
- **Recommended architecture (in detail)** — the full data flow, component by component.
- **Why this design (deep reasoning)** — the *why*, the alternatives you rejected, and the trade-offs.
- **Failure modes & mitigations (in detail)** — what breaks, how you detect it, how you recover/degrade.
- **Cost & scale (in detail)** — what drives cost, how it scales, where the knee is.
- **30-second summary** — how you'd land the answer.

**Golden rule for every scenario:** *Requirements first, then architecture, then trade-offs, then failure modes, then "how I'd evolve it."* Never jump straight to a diagram.

---

## Scenario 1 — Flash sale / huge traffic spike on an e-commerce checkout

### The question & how to open
"Our checkout falls over during flash sales. How would you design it to survive a 50x spike?"

Before answering, I'd ask: *What's the baseline vs peak RPS? What's the acceptable checkout latency? Is the inventory strictly limited (oversell forbidden)? Is "order accepted but processed a few seconds later" acceptable to the business?* Those answers decide whether I can go asynchronous. In almost all real flash-sale designs, the business will accept "your order is confirmed, processing" — and that single fact unlocks the whole architecture.

### How I'd explain it (narrative)
"The core problem is that a synchronous checkout does expensive work — payment, inventory, order persistence — inline, on the request thread, against a relational database that has a hard ceiling on connections and write throughput. Under a 50x spike, the database becomes the bottleneck, connections exhaust, latency climbs, requests pile up, and the whole thing collapses. So my first move is to **stop doing the heavy work synchronously**. I accept the order intent quickly, put it on a durable queue, and let a worker fleet drain that queue at a rate the database can actually sustain. The queue becomes a shock absorber: a spike grows the queue depth instead of melting the backend."

### Recommended architecture (in detail)
1. **Edge:** Route 53 → **CloudFront** (cache product pages, images, and any cacheable GET responses) → **AWS WAF** (rate-based rules + bot control to shave off abusive/bot traffic before it costs me anything).
2. **API tier:** NestJS running on **ECS Fargate** across ≥2 AZs behind an **ALB**. Autoscaling uses **ALB requests-per-target** as the primary metric (Node is I/O-bound here, so CPU alone is a poor signal), with a scheduled scale-up just before the sale starts (predictive/scheduled scaling).
3. **Checkout path:** the `POST /checkout` handler does only cheap, fast work: validate the request, perform an **atomic/conditional inventory reservation**, write an **order intent** to **SQS** (or DynamoDB + a stream), and immediately return `202 Accepted` with an order ID and "processing" status.
4. **Processing tier:** a separate **worker service** (Fargate or Lambda) consumes SQS and performs the slow steps — charge payment, finalize the order in **Aurora** (fronted by **RDS Proxy**), update inventory — at a controlled concurrency.
5. **Reads:** product/inventory reads served from **ElastiCache (Redis)** to keep them off the primary DB.
6. **Client experience:** the client polls `GET /orders/{id}` or receives a push/WebSocket update when the order is finalized.

### Why this design (deep reasoning)
- **Queue-based load leveling** is the heart of it: it decouples *ingestion capacity* (how fast I can accept orders) from *processing capacity* (how fast the DB can safely commit them). The API tier can scale to absorb the spike cheaply because it's doing almost no work; the worker tier scales independently and is bounded by the DB.
- I chose **Fargate over Lambda for the API** because checkout traffic during a sale is sustained and high — at that volume Lambda's per-request pricing and cold-start tail are worse than warm containers. But Lambda is perfectly reasonable for the **workers** if the per-message work is short.
- **RDS Proxy** is non-negotiable: without it, a scaled-out worker fleet (or Lambda) opens a connection per execution and blows past Aurora's `max_connections`. Proxy multiplexes hundreds of clients onto a small pool.
- **Atomic inventory reservation at accept time** (not at processing time) is what prevents overselling while still being asynchronous — I reserve the unit synchronously (a fast conditional decrement), then fulfill payment asynchronously, and release the reservation if payment fails.
- Alternatives I'd reject: pure vertical scaling of the DB (just delays the ceiling), or caching writes (you can't cache a write). Read replicas help reads, not the write spike.

### Failure modes & mitigations (in detail)
- **Duplicate orders from client retries / at-least-once SQS delivery:** users double-click, and SQS delivers at-least-once. I make the worker **idempotent** using an idempotency key (the order ID) and a DynamoDB conditional write so reprocessing the same intent is a no-op that returns the original result.
- **DB connection exhaustion:** mitigated by RDS Proxy + a **bounded worker concurrency** (e.g., `p-limit` / reserved Lambda concurrency) tuned to the DB's safe write rate.
- **Poison messages:** a malformed/repeatedly-failing message would otherwise block throughput; I configure a **DLQ** after `maxReceiveCount` and an alarm + redrive plan, and use **partial batch responses** so one bad message doesn't fail a whole batch.
- **Payment provider throttling/outage:** wrap payment calls in **retries with backoff + jitter** and a **circuit breaker** so a struggling provider doesn't cause my workers to hang and back up the queue; fall back to "retry later" status.
- **Inventory oversell:** atomic conditional decrement; if it fails, reject fast with a clean "sold out."
- **Detection:** alarms on **SQS queue depth and age-of-oldest-message** (the canary for "workers can't keep up"), DB connection utilization, and checkout error rate.

### Cost & scale (in detail)
- **Scaling signal:** autoscale workers on **queue depth / oldest-message age** — this is a far better signal than CPU because it directly reflects backlog. Autoscale the API tier on requests-per-target.
- **Pre-warming:** flash sales have a known start time, so I use **scheduled scaling** to pre-provision both tiers minutes before — autoscaling reactively is too slow for an instantaneous 50x jump.
- **Cost levers:** **Fargate Spot** for the stateless worker fleet (big savings, and they're interruption-tolerant because work is queued and idempotent); CloudFront + Redis to keep read load off the DB; scale workers back down (even to a small min) after the sale.
- **The knee:** the system's true ceiling is the DB's sustainable write rate. The queue lets me ride out the spike, but if sustained demand permanently exceeds DB write capacity, I'd shard the orders table or move the hottest write path to DynamoDB.

### 30-second summary
"Accept fast, process at a safe rate. CloudFront + WAF at the edge, a thin Fargate API that reserves inventory atomically and drops an idempotent order intent on SQS, and an independently-scaled worker fleet (behind RDS Proxy) that drains the queue. The queue absorbs the spike; idempotency, DLQs, and a circuit breaker keep it correct and resilient; scheduled scaling handles the known start time."

---

## Scenario 2 — Large media upload + processing pipeline (video/images)

### The question & how to open
"Users upload large videos/images that we need to transcode and serve. Design it."

Clarifying questions: *How large are the files (MB? GB?)? What processing — transcode, thumbnails, virus scan, ML tagging? Is processing time-sensitive (user waits) or background? What's the read pattern for serving the results?* File size and "does the user wait" drive the whole design.

### How I'd explain it (narrative)
"The first principle is: **never stream large file bytes through my application servers.** If a 2 GB upload flows through my Node API, I burn memory and bandwidth, I'm limited by my instance count, and I've coupled upload throughput to my compute. Instead, the client uploads **directly to S3** using a **pre-signed URL** my API hands out. My compute only ever deals with small metadata. Then processing is **event-driven** off the S3 object-created event, done by a worker fleet that scales on its own, completely decoupled from the upload path."

### Recommended architecture (in detail)
1. **Get an upload URL:** client calls `POST /uploads` → NestJS returns a **pre-signed S3 PUT URL** (short expiry, content-type/size constrained), plus an object key namespaced by user/tenant. For large files, issue a **multipart** pre-signed upload so the client uploads parts in parallel and can resume.
2. **Direct upload:** client `PUT`s the bytes straight to S3 — no app-server hop.
3. **Trigger:** `s3:ObjectCreated` → **EventBridge** (or S3 → SNS) → **SQS** (durable buffer in front of workers).
4. **Process:** a **worker** (Fargate for heavy/long jobs, or Lambda for short ones; **AWS MediaConvert** for video transcoding, `sharp` for images) reads the source from S3, processes, and writes outputs back to S3 (different prefix/bucket).
5. **Orchestrate (if multi-stage):** if the pipeline has several stages (scan → transcode → thumbnail → tag), I use **Step Functions** so each stage has retries, branching, and visibility, with compensation on failure.
6. **Status & notify:** processing status tracked in **DynamoDB**; on completion, emit an event → notify the user via WebSocket/SNS (Scenario 3).
7. **Serve:** results served via **CloudFront** with **signed URLs/cookies** for private content.

### Why this design (deep reasoning)
- **Pre-signed URLs** push the bandwidth-heavy work to S3, which is built for exactly this and scales infinitely. My API stays tiny and stateless. This is the single most important decision.
- **Event-driven processing** means uploads and processing scale independently. A burst of uploads grows the SQS queue; workers scale on queue depth without affecting the upload experience.
- **Multipart upload** matters for large files: parallelism for speed, resumability for flaky networks, and it sidesteps single-PUT size limits.
- **Step Functions** earns its place only when there are *multiple* stages with failure handling/branching; for a single transform, a plain SQS→worker is simpler and cheaper. I'd call out that I wouldn't over-engineer a one-step job into a state machine.
- **MediaConvert** over rolling my own ffmpeg fleet: it's purpose-built, handles formats/codecs/scaling, and removes a huge operational burden — unless there's a specific reason to self-manage.

### Failure modes & mitigations (in detail)
- **Reprocessing on retry:** at-least-once delivery means a job may run twice; I make processing **idempotent** (deterministic output key derived from input + processing version) so a re-run overwrites identically rather than duplicating.
- **Partial pipeline failure:** in Step Functions, each state has retry/catch; a failure routes to a compensation/cleanup step and marks status FAILED with a reason the user can see.
- **Malicious uploads:** add an early **virus/malware scan** stage; constrain pre-signed URLs by content-type and size; never trust the client-declared type.
- **Huge files / memory:** workers **stream** from S3 rather than buffering whole files; size caps enforced via upload policy.
- **Orphaned uploads:** S3 **lifecycle rules** clean up incomplete multipart uploads and un-processed temp objects.
- **Detection:** alarms on queue age, worker error rate, and Step Functions execution failures; a DLQ for jobs that exhaust retries.

### Cost & scale (in detail)
- **Compute:** **Fargate Spot** for the worker fleet — transcoding is interruption-tolerant because it's queued and idempotent. Lambda only if jobs fit comfortably under the 15-min limit and memory ceiling.
- **Storage:** **S3 lifecycle** to transition source originals to cheaper tiers (IA/Glacier) after processing; keep only hot output in Standard.
- **Delivery:** CloudFront offloads repeated downloads from S3 and reduces egress cost while improving latency.
- **Scale:** scale workers on **SQS depth**; the upload path scales with S3 automatically — effectively unbounded.
- **The knee:** cost scales with processing minutes (MediaConvert) and storage; the architecture itself doesn't have a throughput ceiling because every tier scales independently.

### 30-second summary
"Pre-signed direct-to-S3 uploads (multipart for big files) so bytes never touch my compute. S3 event → EventBridge → SQS → an autoscaled worker fleet (MediaConvert/sharp), orchestrated by Step Functions if multi-stage. Idempotent jobs, DLQs, virus scanning, and CloudFront for delivery. Every tier scales independently; Spot + S3 lifecycle keep it cheap."

---

## Scenario 3 — Real-time notifications to millions of users

### The question & how to open
"Design a system that delivers notifications — push, SMS, email, and live in-app updates — to millions of users."

Clarifying questions: *Which channels? What delivery guarantees and latency (transactional vs marketing)? Do users have per-channel preferences? How many concurrent live (in-app) connections? Is ordering required?* The "in-app real-time" requirement and the concurrent-connection count are what make this hard.

### How I'd explain it (narrative)
"I'd split this into two problems that look similar but scale very differently. **Channel delivery** (push/SMS/email) is a fan-out + dispatch problem — well-suited to managed services. **Live in-app updates** is a **stateful connection** problem, and stateful connections fight stateless horizontal scaling. The mistake people make is self-managing millions of WebSocket connections with sticky sessions. I'd offload connection state to a managed service and keep my own services stateless and event-driven."

### Recommended architecture (in detail)
1. **Event ingestion:** anything notify-worthy publishes an event to **EventBridge** (rich routing/filtering) or **SNS**. Producers don't know who consumes.
2. **Notification service:** consumes events, looks up the user's **preferences** (which channels, quiet hours) and **fans out** to channel-specific queues. Buffered by **SQS** between stages for durability and retry.
3. **Channel dispatch:**
   - **Mobile push / SMS:** **Amazon SNS** (A2P — application-to-person), integrating APNs/FCM.
   - **Email:** **Amazon SES**.
   - **In-app real-time:** **API Gateway WebSocket APIs** manage the persistent connections; a `connectionId ↔ userId` mapping is stored in **DynamoDB**. To push, the notification service looks up the user's active connections and calls the API Gateway management API to send.
4. **History & read-state:** stored in **DynamoDB** (per-user, time-ordered) so users can see past notifications and unread counts.

### Why this design (deep reasoning)
- **API Gateway WebSockets** offloads the hardest part — managing millions of long-lived connections, scaling them, and handling connect/disconnect — to AWS. I don't run a WebSocket server fleet, don't need sticky sessions, and don't need a Redis backplane for connection routing. (If I were forced onto containers, I'd use a Fargate WebSocket gateway + Redis pub/sub backplane — that's Scenario 4 — but managed is better at this scale.)
- **EventBridge/SNS fan-out** keeps producers fully decoupled: I can add a new channel or consumer without touching the code that emits the event.
- **Preference-driven fan-out** centralizes business rules (opt-outs, quiet hours, channel routing) in one place.
- **SQS between stages** gives durability and independent retry per channel — a flaky email provider doesn't delay push notifications.
- **DynamoDB** for connection mapping and history because it's connectionless (great for Lambda dispatch), single-digit-ms, and scales horizontally to millions of users without connection-pool concerns.

### Failure modes & mitigations (in detail)
- **Duplicate notifications:** at-least-once everywhere → **idempotency/dedup keys** per (user, notification) so a user isn't paged twice.
- **Fan-out cost/perf trap:** never query the DB once per recipient in a loop — that's an N+1 disaster at millions of users. I **batch** lookups and dispatch, and pre-aggregate audiences.
- **Stale connections:** WebSocket `$disconnect` cleans up the DynamoDB mapping; sends to dead connections (410 Gone) trigger cleanup.
- **Provider limits:** APNs/FCM/SES have rate limits → token-bucket **throttling** + queue buffering so I dispatch within limits instead of getting throttled/blocked.
- **Prioritization:** transactional notifications (OTP, payment) must not get stuck behind a marketing blast → **separate queues/priority lanes**.
- **Detection:** alarms on per-channel queue age, delivery failure rate, and WebSocket connection errors.

### Cost & scale (in detail)
- **Connections:** API Gateway WebSockets bills per message + connection-minutes and scales connection count for me — no fleet to size.
- **Dispatch compute:** Lambda for the dispatchers (spiky, event-driven) keeps cost proportional to volume.
- **DynamoDB:** on-demand capacity for unpredictable notification bursts; design the connection-lookup key (`userId` → connections) to avoid hot partitions.
- **The knee:** the limiting factors are downstream provider rate limits (APNs/FCM/SES), not my architecture — so I design around those with buffering and throttling.

### 30-second summary
"Decouple via EventBridge/SNS; a notification service applies preferences and fans out to per-channel SQS queues; SNS for push/SMS, SES for email, and **API Gateway WebSockets** for live in-app so AWS manages millions of connections (mapping in DynamoDB). Idempotency, batched fan-out, separate priority lanes, and per-provider throttling keep it correct and within limits."

---


## Scenario 4 — Self-managed WebSocket service on containers

### The question & how to open
"You need real-time bidirectional comms (e.g., a live collaboration or trading dashboard) and you're running on containers, not API Gateway. How do you scale WebSockets?"

Clarifying questions: *How many concurrent connections? Message rate per connection? Do all clients need to receive every message (broadcast) or is it targeted? Can clients tolerate reconnects?* The broadcast-vs-targeted distinction and connection count drive the design.

### How I'd explain it (narrative)
"WebSockets break the usual stateless assumption: a connection is pinned to one specific server process for its lifetime. So if user A is connected to task 1 and user B to task 2, and A sends a message that B must receive, task 1 has no direct way to reach B. The classic solution is a **shared pub/sub backplane** — every task subscribes to a channel, publishes messages there, and the task holding each target connection delivers them. On AWS that backplane is **ElastiCache Redis pub/sub**. The other half of the problem is that I must externalize all session state so a task can die and clients just reconnect to a healthy one."

### Recommended architecture (in detail)
1. **Gateway:** NestJS WebSocket gateway (Socket.IO or `ws`) on **ECS Fargate**, ≥2 AZs, behind an **ALB** (which supports WebSocket upgrade).
2. **Backplane:** **ElastiCache Redis** with the Socket.IO Redis adapter (or a custom pub/sub). When any task wants to broadcast or send to a user, it publishes to Redis; all tasks subscribe and deliver to their locally-held connections.
3. **State externalization:** session/auth state and any room membership in Redis (not in process memory), so connections are recoverable.
4. **Scaling signal:** autoscale on **active connection count** (a custom CloudWatch metric) and CPU, not just request count.
5. **Auth:** validate a JWT on the WebSocket handshake; re-validate on reconnect.

### Why this design (deep reasoning)
- The **Redis backplane** is the crux: it's what lets N tasks behave like one logical hub. Without it, horizontal scaling silently drops cross-task messages.
- I prefer **connection-count-based autoscaling** because WebSocket cost/pressure correlates with open connections and message rate, not HTTP request count.
- I **externalize state** so the system is resilient: losing a task should only cause its clients to reconnect (and resume), not lose data.
- **Trade-off I'd state honestly:** at very large scale (hundreds of thousands+ of connections), self-managing this is operationally heavy — I'd seriously consider migrating to **API Gateway WebSocket APIs** or **AWS AppSync subscriptions** to offload connection management entirely (Scenario 3). I'd choose self-managed only when I need protocol control, lower per-message cost at scale, or specific library features.

### Failure modes & mitigations (in detail)
- **Task loss drops connections:** clients implement **auto-reconnect with backoff**, and on reconnect they resume from a last-seen cursor/sequence so no messages are lost.
- **Uneven connection distribution:** new connections may pile on one task; the ALB plus connection-count scaling rebalances over time; avoid long-lived imbalance with periodic connection cycling if needed.
- **Memory leaks from un-cleaned sockets:** rigorously remove connection references on `disconnect`/`close`, cap with an LRU, and run a periodic sweep — a classic Node WebSocket leak (a global `connections` array that never shrinks).
- **Redis as a single point of pressure:** use a replicated ElastiCache cluster with failover; keep pub/sub messages small; avoid blocking commands.
- **Thundering reconnect after a deploy:** jittered reconnect backoff on clients to avoid a synchronized reconnect storm.
- **Detection:** alarms on connection count per task, Redis CPU/latency, and message delivery errors.

### Cost & scale (in detail)
- **Compute:** Fargate tasks sized to a target connections-per-task; scale out as connections grow. Keep a sensible min for warm capacity.
- **Redis:** size for pub/sub throughput and any stored state; this is usually the cost/scale pivot for the backplane.
- **The knee:** memory per connection × connections, and Redis pub/sub fan-out throughput. Past a certain scale the managed option (API Gateway WebSockets) becomes cheaper in *engineering time* even if not always in dollars.

### 30-second summary
"WebSocket gateway on Fargate behind an ALB, with an **ElastiCache Redis pub/sub backplane** so any task can deliver to any client, and all session state externalized so tasks are disposable. Scale on connection count; clients auto-reconnect with jittered backoff and resume from a cursor. At very large scale I'd move to API Gateway WebSockets to offload connection management."

---

## Scenario 5 — Scheduled / cron jobs in a multi-instance fleet

### The question & how to open
"You have a nightly report and some periodic cleanup jobs. You run multiple instances of the service. What's the problem and how do you design it?"

Clarifying questions: *How many instances run the service? How long does each job take? Is it catastrophic if a job runs twice? Does it need to run at a precise time?* The "multiple instances" detail is the trap the interviewer is testing.

### How I'd explain it (narrative)
"The trap here is the naive approach: putting an in-process cron (`@Cron` in NestJS) inside a service that runs on, say, six instances. That cron fires on **every instance**, so the nightly report runs six times — duplicate work, duplicate emails, possible data corruption. The principle I'd state is: **separate scheduling from execution.** The schedule should fire exactly once from a single authoritative source, and that should trigger idempotent execution somewhere that can scale appropriately."

### Recommended architecture (in detail)
1. **Scheduler:** **Amazon EventBridge Scheduler** (or an EventBridge cron rule) fires once at the scheduled time — a single, managed, authoritative trigger.
2. **Execution target:**
   - Short jobs → **Lambda**.
   - Long/heavy jobs (a big nightly report) → an **ECS task** (run-task) or **Step Functions** if multi-step, since Lambda caps at 15 minutes.
3. **Heavy batch:** for a large report, the triggered task can fan work out via **SQS** to a temporarily-scaled worker fleet, then assemble the result to **S3** and email a link.
4. **If I must keep scheduling in-app:** run a **single dedicated scheduler instance**, or use a **Redis distributed lock / leader election** so only one instance executes the cron tick.

### Why this design (deep reasoning)
- **EventBridge Scheduler** eliminates the duplicate-cron problem by design — one managed trigger, no matter how many app instances exist. It also gives retries, time zones, and one-time schedules.
- Choosing the **execution target by job duration** respects Lambda's 15-min limit: I don't try to cram a 40-minute report into Lambda.
- **Fanning a big batch through SQS** lets me scale workers up only for the batch window, then back to zero — much cheaper than a permanently large fleet.
- The **distributed-lock fallback** is what I'd reach for only if there's a hard reason the schedule must live in the app process; I'd flag it as the inferior option because it adds coordination complexity.

### Failure modes & mitigations (in detail)
- **Duplicate execution:** even with a single trigger, retries can re-fire → make jobs **idempotent** (e.g., "generate report for date X" overwrites rather than appends; guard with a run-record in DynamoDB keyed by job+date).
- **Missed runs:** EventBridge retries + a **DLQ** capture failures; an alarm fires if a scheduled job didn't record completion.
- **Long jobs killed mid-run:** use ECS/Step Functions (no 15-min cap), checkpoint progress so a retry resumes rather than restarts.
- **Job overlap:** if a run can exceed its interval, guard against concurrent runs with a lock/run-record so run N+1 doesn't start before N finishes.
- **Detection:** a "heartbeat"/completion record per job; alarm on missing completion within the expected window.

### Cost & scale (in detail)
- **Scheduler + Lambda** is essentially free at low volume and pay-per-use.
- **Batch fan-out** scales workers only during the window (Spot for cost), then scales to zero — you pay for the work, not idle capacity.
- **The knee:** large reports are bounded by the data store's read throughput and the assembly step; partition the work and parallelize within safe limits.

### 30-second summary
"Never run in-process cron across a fleet — it fires on every instance. **Separate scheduling from execution**: EventBridge Scheduler fires once and triggers Lambda (short) or an ECS task / Step Functions (long), fanning heavy batches through SQS to a temporarily-scaled worker fleet. Jobs are idempotent with completion records, retries, and DLQs."

---

## Scenario 6 — High-throughput ingestion + analytics (IoT / clickstream)

### The question & how to open
"Millions of events per second from devices/clickstream. We need real-time dashboards *and* historical analytics. Design the pipeline."

Clarifying questions: *What's the event rate and per-event size? What latency do the 'real-time' dashboards need — seconds or minutes? What historical/ad-hoc analytics? Is ordering required, and at what granularity? Retention requirements?* "Real-time + historical" signals I need to split the pipeline into a streaming path and a batch/lake path.

### How I'd explain it (narrative)
"The key insight is to **decouple ingestion from the many things that consume the data** by putting a durable, replayable streaming log in the middle. Producers write once to the stream; multiple independent consumers read it — one for real-time aggregation, another to land raw data in a lake. I also separate **operational (OLTP)** from **analytical (OLAP)** workloads so heavy analytics never touch the systems serving live traffic. And I obsess over the **partition key**, because in any sharded streaming system, a bad key creates a hot shard that caps throughput regardless of how much capacity I've provisioned."

### Recommended architecture (in detail)
1. **Ingestion:** devices/clients → **Kinesis Data Streams** (or **MSK/Kafka** if there's an existing Kafka ecosystem), partitioned by a **high-cardinality key** (e.g., deviceId/sessionId) to spread load evenly across shards. For IoT specifically, **AWS IoT Core** can sit in front for device auth/management.
2. **Real-time path:** **Lambda** (or **Kinesis Data Analytics / Apache Flink**) consumes the stream, computes rolling aggregates/enrichment, and writes hot metrics to **DynamoDB** or **Amazon Timestream** for low-latency dashboards.
3. **Lake path:** **Kinesis Data Firehose** batches and writes raw events to **S3** (partitioned by date, in **Parquet** columnar format), forming the data lake.
4. **Analytics:** ad-hoc SQL via **Athena** directly on S3; heavier BI in **Redshift**; log-style exploration/search in **OpenSearch**; dashboards in **QuickSight**.
5. **Catalog/ETL:** **AWS Glue** for the data catalog and any transformations.

### Why this design (deep reasoning)
- A **replayable log (Kinesis/Kafka)** is the backbone: it decouples producers from consumers and enables **replay/backfill** — if a consumer has a bug, I fix it and reprocess from the stream rather than losing data.
- **Two paths (lambda architecture-ish):** the streaming path optimizes for low latency (approximate, recent), the lake path optimizes for completeness and cheap historical analysis. Trying to serve both from one store is where designs go wrong.
- **OLTP/OLAP separation:** running big aggregations on the operational DB would wreck live latency; I project read-optimized data into Athena/Redshift instead.
- **Firehose over hand-rolled batching:** it's a no-code managed delivery service that handles buffering, compression, and format conversion to Parquet — which massively reduces both storage and query cost.
- **Partition-key design** is the #1 throughput determinant; I'd explicitly call out avoiding low-cardinality keys (like "today's date" or a status flag) that funnel everything to one shard.

### Failure modes & mitigations (in detail)
- **Hot shard:** caused by a skewed partition key; mitigate with a higher-cardinality or composite key (and write-sharding suffixes for unavoidable hotspots). Monitor per-shard throughput.
- **Poison record blocks a shard:** a record that always fails would otherwise stall the shard (ordering guarantee); mitigate with `bisectBatchOnFunctionError`, a max-retry, and a **failure destination** so bad records are quarantined, not retried forever.
- **Duplicate processing:** at-least-once delivery → **idempotent consumers** (dedupe by event ID).
- **Backpressure / capacity:** use **on-demand** Kinesis capacity (or reshard) for variable load; Firehose buffers to S3 to absorb bursts.
- **Schema drift:** a schema registry + Glue catalog so downstream consumers don't break when event shapes evolve.
- **Detection:** alarms on iterator age (consumer falling behind), shard-level throughput, and Firehose delivery errors.

### Cost & scale (in detail)
- **Big cost wins:** Firehose **batching** + **columnar Parquet** + **S3 partitioning** can cut Athena scan costs by an order of magnitude (you scan less data). **S3 lifecycle tiering** for old data.
- **Kinesis:** on-demand for variable load, provisioned shards when the rate is predictable (cheaper at steady high volume).
- **Scale:** every tier scales horizontally — shards for ingest, Lambda/Flink for processing, S3 effectively unbounded.
- **The knee:** shard count vs partition-key distribution for ingest throughput; query cost scales with bytes scanned, which is why columnar + partitioning matters.

### 30-second summary
"Put a durable, replayable **Kinesis** log in the middle, partitioned by a high-cardinality key. Split into a **real-time path** (Lambda/Flink → DynamoDB/Timestream for dashboards) and a **lake path** (Firehose → S3 Parquet → Athena/Redshift). Keep OLTP and OLAP separate; design partition keys to avoid hot shards; idempotent consumers + failure destinations for poison records; columnar + partitioning to control query cost."

---


## Scenario 7 — Serverless REST API with a relational database

### The question & how to open
"Build a serverless REST API (Lambda) but the data lives in a relational database (Aurora/Postgres). What's the catch and how do you handle it?"

Clarifying questions: *What's the traffic profile — spiky/low baseline, or sustained high? What latency SLA (cold starts a concern)? Why relational — complex queries/transactions? How spiky can concurrency get?* The catch the interviewer wants is the connection-management problem.

### How I'd explain it (narrative)
"Serverless and relational databases have a fundamental impedance mismatch. Lambda scales by creating many **independent execution environments**, and each one opens its **own** database connection. A traditional app uses a shared connection pool; Lambda can't, because environments don't share memory. So under a burst, I might suddenly have 800 concurrent Lambdas trying to open 800 connections, and Aurora's `max_connections` is far lower than that — connections exhaust, new ones are refused, and the API fails. The fix is **RDS Proxy**, which sits between Lambda and the database and multiplexes hundreds of client connections onto a small managed pool."

### Recommended architecture (in detail)
1. **Edge:** **API Gateway** (HTTP API for lean/cheap, REST API if I need usage plans/validation) with a **Cognito JWT authorizer** so bad tokens are rejected before hitting compute.
2. **Compute:** **Lambda** running NestJS (via a serverless adapter) or lightweight handlers. SDK/DB clients initialized **outside the handler** so warm invocations reuse them.
3. **Connection management:** **RDS Proxy** in front of **Aurora** — pools and multiplexes connections, and speeds up failover.
4. **Concurrency control:** **reserved concurrency** on the function caps how many connections it can ever demand, protecting the DB.
5. **Secrets:** DB credentials in **Secrets Manager**, fetched via the function role (Proxy can also use IAM auth + Secrets Manager).

### Why this design (deep reasoning)
- **RDS Proxy** is the centerpiece — it's the standard, AWS-blessed answer to Lambda + relational. It also improves resilience by holding connections through DB failovers.
- **Reserved concurrency** does double duty: it guarantees the function some capacity *and* caps its blast radius so it can't open more connections than the DB can take.
- **Init outside the handler** maximizes connection reuse across warm invocations, reducing churn.
- **Honest trade-off:** I'd tell the interviewer that if this API is destined for *sustained high* RPS, Lambda's per-request pricing and cold-start tail may make **Fargate** the better long-term choice — Lambda shines for spiky/low-baseline. And if the access patterns are actually key-based and don't need joins, I'd question whether **DynamoDB** (connectionless, serverless-native) is a better fit than fighting the relational mismatch at all.

### Failure modes & mitigations (in detail)
- **Connection exhaustion (the headline risk):** RDS Proxy + reserved concurrency; monitor DB connection utilization.
- **Cold starts on a tight SLA:** **provisioned concurrency** for latency-critical routes; smaller bundles (esbuild, SDK v3 modular clients) to shrink init time.
- **Connection pinning reduces multiplexing:** session-level state or long transactions cause Proxy to "pin" a connection, eroding the pooling benefit → keep transactions short and avoid session state.
- **VPC Lambda considerations:** Lambda needs VPC access to reach Aurora; modern ENI handling mitigates the old cold-start penalty, but I keep VPC config only where required.
- **Detection:** alarms on Lambda throttles/errors/duration, RDS Proxy connection borrow latency, and DB connection count.

### Cost & scale (in detail)
- **Cheap at low/spiky traffic:** pay only per request + duration; scales to zero.
- **Reassess at high sustained RPS:** model the per-request cost vs a warm Fargate fleet — there's a break-even where containers win.
- **RDS Proxy** has its own hourly cost, justified by the reliability it buys.
- **The knee:** the relational DB's connection and write capacity remain the ultimate ceiling; Proxy raises the effective concurrency ceiling but doesn't make the DB infinitely scalable.

### 30-second summary
"The catch is per-environment connections: a Lambda burst can exhaust the DB's connection limit. I front Aurora with **RDS Proxy** to multiplex connections, cap the function with **reserved concurrency**, init clients outside the handler, and use provisioned concurrency if cold starts hurt the SLA. If traffic is sustained-high I'd weigh Fargate; if access patterns are key-based, I'd weigh DynamoDB."

---

## Scenario 8 — Multi-tenant SaaS data isolation

### The question & how to open
"Design the data layer for a multi-tenant SaaS. How do you keep tenants isolated for security, performance, and cost?"

Clarifying questions: *How many tenants, and what's the size distribution (many small vs a few huge)? What are the compliance/isolation requirements (any tenant needing dedicated data residency)? What's the budget sensitivity? Is there a noisy-neighbor concern?* The tenant size distribution and compliance needs drive whether I go pooled, siloed, or hybrid.

### How I'd explain it (narrative)
"Multi-tenancy is fundamentally a spectrum from **pooled** (all tenants share infrastructure and tables, separated by a `tenantId`) to **siloed** (each tenant gets its own database/schema/stack). Pooled is the most cost-efficient and scales to many tenants but demands rigorous isolation discipline; siloed gives the strongest isolation and easiest per-tenant compliance but costs more and is operationally heavier. The senior move is usually a **tiered/hybrid** model — pooled for the long tail of small tenants, siloed for large enterprise customers — and, crucially, to **enforce isolation at multiple layers** so a single missing `WHERE tenantId` can't leak data across tenants."

### Recommended architecture (in detail)
1. **Tenant context:** the **`tenantId`** comes from a trusted source — a custom claim in the **Cognito** JWT — never from a client-supplied body/header. A NestJS **guard/interceptor** extracts it and puts it in request context (`AsyncLocalStorage`).
2. **Enforcement at the data layer (defense in depth):**
   - **Pooled relational:** shared tables with a `tenant_id` column **plus Postgres Row-Level Security (RLS)** so the database itself rejects cross-tenant rows even if application code forgets a filter.
   - **Pooled DynamoDB:** prefix the partition key with `tenantId` so a tenant's data is physically partitioned and queries are naturally scoped.
   - **Siloed:** separate database/schema (or even separate stack) per large tenant.
3. **Performance isolation:** **per-tenant rate limits/quotas** (Redis-backed) so one tenant can't starve others (noisy neighbor); optionally dedicated capacity for the biggest tenants.
4. **Cost & ops:** **cost allocation tags** per tenant/tier; per-tenant observability (dashboards filtered by tenantId via correlation context).
5. **Security:** for the highest tier, **per-tenant KMS keys** for envelope encryption.

### Why this design (deep reasoning)
- **Multi-layer enforcement** is the key lead-level point: token → app guard → **DB-level RLS / key prefixing**. Application-only checks are one bug away from a breach; RLS is a safety net at the lowest level.
- **Tiered model** optimizes the cost/isolation trade-off: pooled density for SMBs (cheap, scalable), siloed isolation for enterprises that pay for and require it (compliance, residency, blast-radius).
- **Tenant context from the token, not the request body** prevents trivial tenant-spoofing attacks.
- **Per-tenant quotas** turn a shared system fair: a runaway tenant gets throttled rather than degrading everyone.

### Failure modes & mitigations (in detail)
- **Cross-tenant data leak (the nightmare):** RLS / key prefixing as a backstop behind app checks; automated tests that assert tenant isolation; code review focus on every query path.
- **Noisy neighbor:** per-tenant rate limits + quotas; isolate or dedicate capacity for whales; monitor per-tenant resource usage.
- **"Hot" large tenant in a pooled store:** can cause hot partitions (DynamoDB) — may justify promoting that tenant to a silo.
- **Per-tenant compliance/residency:** silo + region-specific deployment + per-tenant keys.
- **Tenant offboarding/data deletion:** pooled makes "delete all of tenant X" harder (must scope deletes carefully); siloed makes it trivial (drop the DB).
- **Detection:** per-tenant dashboards and anomaly alarms; audit logs tagged by tenant.

### Cost & scale (in detail)
- **Pooled** maximizes density and is the cheapest per tenant; **siloed** multiplies fixed costs per tenant.
- **Tiering** lets economics match value: small tenants cost little (pooled), large tenants pay for dedicated isolation (siloed).
- **The knee:** number of tenants and the size of the largest tenants. Pooled scales to huge tenant *counts*; very large *individual* tenants are the ones you peel off into silos.

### 30-second summary
"Isolation enforced at multiple layers: `tenantId` from the Cognito token, injected via a guard, and enforced at the DB with **Postgres RLS** or **DynamoDB key prefixing** as a safety net. Use a **tiered model** — pooled for the small-tenant long tail, siloed for enterprise — with per-tenant quotas to stop noisy neighbors, cost-allocation tags, and per-tenant KMS keys for the top tier."

---

## Scenario 9 — Public API with API keys, quotas, and abuse protection

### The question & how to open
"Expose a public API with tiered plans (free/pro/enterprise), API keys, quotas, and protection against abuse and DDoS. Design it."

Clarifying questions: *Do consumers authenticate as users (OAuth) or just identify with an API key? What are the per-tier limits? Is the API monetized (need usage metering for billing)? What's the threat model — scraping, credential stuffing, DDoS?* Monetization and threat model shape the throttling layers.

### How I'd explain it (narrative)
"I think about this as **layers of defense**, each protecting a different thing. At the very edge, **WAF and Shield** protect my *infrastructure and cost* from malicious and volumetric traffic — I want to block or absorb attacks before they ever reach (and scale) my backend. Then **API Gateway usage plans** enforce *per-key technical limits* (rate + quota per tier). Finally, **application-level rate limiting** enforces *business/fair-use rules* that are too nuanced for the edge. I'd also separate two concepts people conflate: an **API key identifies** who's calling (and which plan), while **authorization** decides what they can do — those are different mechanisms."

### Recommended architecture (in detail)
1. **Edge protection:** **CloudFront** + **AWS WAF** (managed rule sets for SQLi/XSS, **rate-based rules** to throttle abusive IPs, bot control, geo/IP allow-deny) + **AWS Shield** (Standard automatically; Advanced for high-risk APIs with cost protection).
2. **API management:** **API Gateway** with **API keys + usage plans** — each plan (free/pro/enterprise) defines a **throttle rate** and a **quota** (e.g., 10k requests/day free, 1M pro). Keys map consumers to plans.
3. **Auth:** API key for identification; **OAuth/JWT** (Cognito or partner IdP) for user-scoped authorization and scopes.
4. **App-level limits:** a **Redis-backed rate limiter** (`@nestjs/throttler` with a Redis store) for fair-use and per-endpoint cost weighting that usage plans can't express; shared across the fleet so limits are real.
5. **Metering/billing:** emit usage via structured logs / **EMF** → a metering pipeline (Kinesis/Firehose → S3 → aggregation) for billing and analytics.
6. **Responses:** standard `429 Too Many Requests` + `Retry-After` and clear rate-limit headers.

### Why this design (deep reasoning)
- **Defense in depth** is the whole point: edge throttling/WAF protects availability and cost (you don't pay to autoscale against an attack), while app limits enforce business rules. Relying on only one layer leaves a gap.
- **API Gateway usage plans** give per-key quotas/throttling *as a managed feature* — no custom code, which is exactly why I'd pick REST API here over hand-rolling.
- **Separating identification (key) from authorization (scopes)** prevents the common mistake of treating an API key as an authorization grant.
- **Redis-backed app throttling** because in-memory counters are per-instance and trivially bypassed by hitting different instances — the limit must be shared/global.
- **Metering as first-class** because a monetized API needs trustworthy usage data; building it in from day one avoids painful retrofits.

### Failure modes & mitigations (in detail)
- **Volumetric DDoS:** WAF rate-based rules + Shield absorb/block at the edge before backend scaling kicks in (cost protection).
- **API key leakage:** scope keys to plans, support **rotation**, and monitor for anomalous usage per key; consider per-key IP allow-lists for enterprise.
- **Quota exhaustion / abuse:** clean `429 + Retry-After`; per-tier quotas prevent a single consumer from consuming shared capacity.
- **Hot/expensive endpoints:** weight limits per endpoint (some calls cost more) via app-level limiter.
- **Credential stuffing / bots:** WAF bot control + anomaly detection.
- **Detection:** alarms on 4xx/5xx rates, per-key usage anomalies, WAF blocked-request spikes, and backend latency.

### Cost & scale (in detail)
- **WAF/edge is a cost *protector*:** blocking malicious load at the edge prevents expensive backend autoscaling — it often pays for itself during an attack.
- **API Gateway** is per-request priced; at very high *legitimate* volume I'd evaluate ALB + app-managed keys, but the managed usage-plan features usually justify API Gateway for a public product.
- **Scale:** API Gateway and the edge scale automatically; the backend scales behind them on normal signals.
- **The knee:** legitimate peak throughput vs the backend's capacity — the edge ensures only legitimate, rate-limited traffic reaches it.

### 30-second summary
"Layered defense: **CloudFront + WAF + Shield** at the edge to protect cost/availability, **API Gateway usage plans + API keys** for per-tier rate/quota, and a **Redis-backed app limiter** for fair-use rules — with API keys for identification but OAuth/JWT for authorization. Standard 429s, key rotation, and EMF-based usage metering for billing."

---


## Scenario 10 — Zero-downtime deployment of a containerized API

### The question & how to open
"How do you deploy a new version of a containerized API with zero downtime, and roll back safely if it's bad?"

Clarifying questions: *What's the deploy frequency and risk tolerance? Are there database schema changes involved? What's the rollback time objective? Can the app run two versions simultaneously?* The database-migration angle is the part many candidates miss.

### How I'd explain it (narrative)
"Zero-downtime deployment is really three problems solved together. First, **the app must drain gracefully** — when a task is told to stop, it must finish in-flight requests instead of dropping them. Second, **the load balancer must stop sending traffic to a task before it exits** — connection draining. Third — and this is the one people forget — **the database schema must be backward-compatible**, because during the rollout the old and new versions of the app run *at the same time*, both talking to the same database. If I drop a column the old version still uses, I break it mid-deploy. So I use **expand/contract** migrations. With those three in place, I can do rolling or blue/green deploys with automatic rollback."

### Recommended architecture (in detail)
1. **Deploy strategy — two options:**
   - **Rolling update (ECS default):** new tasks start, must pass ALB health checks, then old tasks drain and stop. Controlled by `minimumHealthyPercent`/`maximumPercent`. Cheaper (no double fleet).
   - **Blue/green via CodeDeploy:** stand up a parallel "green" task set, shift traffic at the ALB (**canary** 10% → 100%, or **linear**), keep "blue" for instant rollback. Best for risk control.
2. **Graceful shutdown:** the Node app traps **SIGTERM**, stops accepting new connections, drains in-flight requests, closes DB/queue connections, and exits within the grace period (NestJS `enableShutdownHooks()`).
3. **Connection draining:** ALB target group **deregistration delay** so the LB stops routing to a task before it exits; readiness probe flips to "not ready" during drain.
4. **Automatic rollback:** CodeDeploy tied to **CloudWatch alarms** (error rate, latency) — if the canary breaches, traffic auto-reverts to blue.
5. **Database migrations:** **expand/contract** — add new schema (backward-compatible) → deploy code that writes both/reads new → backfill → only later remove old schema, ≥1 deploy after no code uses it. Use `CREATE INDEX CONCURRENTLY` and batched backfills to avoid locks.

### Why this design (deep reasoning)
- The **three-legged stool** (graceful shutdown + connection draining + backward-compatible schema) is what actually delivers zero downtime; missing any one leg drops requests or breaks the old version mid-rollout.
- **Blue/green with canary + alarm-based auto-rollback** minimizes blast radius: a bad release only affects a small slice and reverts automatically — I don't rely on a human noticing at 3am.
- **Expand/contract** is the database discipline that makes simultaneous old+new versions safe; I'd emphasize that destructive changes must **lag** the code change.
- **Trade-off:** blue/green needs temporary **double capacity** (cost) but gives instant rollback; rolling is cheaper but rolls back more slowly. I'd pick based on risk tolerance and cost.

### Failure modes & mitigations (in detail)
- **Dropped in-flight requests:** graceful shutdown + deregistration delay; hard timeout cap below the orchestrator grace period.
- **Bad release reaches all users:** canary/linear traffic shifting + automatic rollback on alarms; feature flags to decouple deploy from release.
- **Destructive migration breaks old tasks:** expand/contract; never drop/rename in the same deploy that ships dependent code.
- **Long-locking migration:** `CREATE INDEX CONCURRENTLY`, batched backfills, off-peak windows; test on a prod-sized dataset first.
- **Health check too strict:** an over-aggressive readiness check tied to a shared dependency can fail the whole fleet at once — keep dependency checks tolerant.
- **Detection:** deployment dashboards, canary alarms, and post-deploy synthetic checks.

### Cost & scale (in detail)
- **Rolling** uses near-current capacity (cheap); **blue/green** roughly doubles capacity for the deploy window (more cost, faster/safer rollback).
- **Scale:** deployment mechanics are independent of traffic scale; the autoscaler keeps running throughout.
- **The knee:** very large fleets make blue/green's double-capacity costly — I might use a higher `maximumPercent` rolling deploy or canary on a subset.

### 30-second summary
"Three things together: **graceful SIGTERM shutdown**, **ALB connection draining**, and **backward-compatible (expand/contract) DB migrations** so old and new versions coexist safely during rollout. Then **blue/green via CodeDeploy with canary shifting and alarm-based auto-rollback** for risk control, or a rolling update when cost matters more than rollback speed."

---

## Scenario 11 — Disaster recovery across regions

### The question & how to open
"Design disaster recovery for a critical service. What's your strategy across regions?"

Clarifying questions — and these are *the* questions: *What's the business-defined **RTO** (how fast must we recover?) and **RPO** (how much data loss is acceptable)? What's the budget? Is this for a regional AWS outage, or just an AZ failure? Which data stores are involved?* RTO/RPO and budget literally determine which of the four DR strategies I pick.

### How I'd explain it (narrative)
"DR is a cost-vs-recovery-speed trade-off, and the business has to set the targets — I can't choose the architecture without **RTO and RPO**. I'd frame the four standard strategies on a spectrum from cheapest/slowest to most expensive/fastest: **backup & restore**, **pilot light**, **warm standby**, and **active-active multi-region**. I'd also push back on jumping to multi-region: for most workloads, a solid **multi-AZ** design already survives the far-more-common AZ failure, and full active-active multi-region is expensive and complex enough that it's only justified for the most critical systems. I'd right-size the strategy to the actual business need rather than gold-plating."

### Recommended architecture (in detail)
- **Baseline (always):** **Multi-AZ** within the primary region — compute across ≥2 AZs behind an ALB, **RDS Multi-AZ / Aurora** (synchronous standby in another AZ), DynamoDB (inherently multi-AZ). This handles AZ loss with no data loss and is the foundation.
- **DR spectrum across regions (pick by RTO/RPO):**
  1. **Backup & restore** (cheapest, RTO hours): cross-region **snapshot copies** + S3 replication; rebuild from **IaC** in the DR region on disaster.
  2. **Pilot light** (RTO ~tens of minutes): core data continuously replicated to a scaled-down DR region; spin up compute on failover.
  3. **Warm standby** (RTO minutes): a smaller-but-live full stack in DR, scaled up on failover.
  4. **Active-active** (RTO near-zero, RPO near-zero): traffic served from multiple regions via **Route 53** (latency/failover routing), with a globally-replicated data layer — **DynamoDB Global Tables** or **Aurora Global Database** (or **Aurora DSQL** for multi-region strong consistency).
- **Failover orchestration:** **Route 53 health checks** + failover routing; IaC (CDK/Terraform) to reproduce infrastructure deterministically.

### Why this design (deep reasoning)
- **RTO/RPO drive everything:** a back-office tool might be fine with backup & restore; a payments platform needs warm standby or active-active. Matching strategy to requirement is the senior judgment.
- **Multi-AZ first:** AZ failures are far more common than full regional outages; nailing multi-AZ delivers most of the resilience for a fraction of the cost/complexity of multi-region.
- **IaC is the DR enabler:** if my whole environment is code, "recover in another region" becomes "deploy the stack there," which is repeatable and testable.
- **Active-active honesty:** I'd explicitly name its costs — running 2x infrastructure, plus the hard problem of **data replication lag and conflict resolution** for multi-master writes. It's powerful but not free, so I reserve it for the systems that truly need it.

### Failure modes & mitigations (in detail)
- **Replication lag / conflicts (active-active):** design for eventual consistency, idempotent writes, and explicit conflict-resolution rules (last-writer-wins or app-level merge); route a given entity's writes to one region where possible.
- **Untested DR plan:** the biggest real-world failure — a plan that's never been exercised. Mitigate with regular **DR game days** that actually fail over.
- **Slow DNS failover:** low TTLs + Route 53 health checks so failover is quick.
- **Backups that don't restore:** periodically **restore** backups to validate them; a backup you've never restored is a hope, not a plan.
- **Configuration drift between regions:** IaC as the single source of truth; avoid manual changes.
- **Detection:** cross-region health checks, replication-lag metrics, and backup-success alarms.

### Cost & scale (in detail)
- **Cost rises sharply** along the spectrum: backup & restore is cheap; active-active roughly doubles infrastructure spend plus cross-region data transfer.
- **Match to criticality:** don't pay for active-active on a non-critical service.
- **The knee:** for active-active, the data layer's global replication characteristics (lag, conflict handling, cost) are the practical limits.

### 30-second summary
"Start by getting **RTO/RPO** from the business — they determine the strategy. **Multi-AZ** is the non-negotiable baseline (handles the common AZ failure). For cross-region DR, choose along the spectrum — backup & restore → pilot light → warm standby → **active-active** (Route 53 + DynamoDB Global Tables / Aurora Global DB) — driven by RTO/RPO and budget. IaC enables reproducible recovery, and I'd **rehearse it with game days**."

---

## Scenario 12 — Event-driven order fulfillment with compensation (saga)

### The question & how to open
"An order touches payment, inventory, shipping, and notifications across separate services. How do you keep it consistent when there's no distributed transaction?"

Clarifying questions: *Are these truly separate services/databases (so no single ACID transaction spans them)? What must happen on partial failure — refund, release inventory? Is there a need for human approval anywhere? What's the volume?* The "separate services, no global transaction" framing points straight at the saga pattern.

### How I'd explain it (narrative)
"Once a business operation spans multiple services with their own databases, I can't wrap it in a single ACID transaction — distributed two-phase commit is fragile and doesn't scale. The pattern for this is the **saga**: a sequence of **local** transactions, where each step has a **compensating action** that undoes it if a later step fails. So if payment succeeds but inventory reservation fails, I run the compensation for payment — a refund. I'd implement this with **Step Functions** as an orchestrator because it gives me durable state, per-step retries, and a visual execution history, which is invaluable for debugging a multi-step flow. I'd also call out the **dual-write problem** — updating my database and publishing an event must not get out of sync — which I solve with the **outbox pattern**."

### Recommended architecture (in detail)
1. **Orchestrator:** a **Step Functions** state machine models the flow: `Validate → Charge Payment → Reserve Inventory → (parallel) Send Confirmation Email + Update Analytics → Complete`.
2. **Steps:** each state invokes a Lambda or a service call. Each has **per-state retry with backoff** for transient failures and a **catch** that routes to compensation.
3. **Compensation:** on failure at any step, the catch transitions run the inverse actions for completed steps — e.g., **refund payment**, **release inventory** — leaving the system in a consistent state.
4. **Events:** services emit domain events (`PaymentCharged`, `OrderConfirmed`) to **EventBridge** for downstream consumers, decoupling them from the orchestration.
5. **Outbox pattern:** services write the state change **and** the to-publish event in the **same local transaction** (to an outbox table); a relay process publishes from the outbox to the bus — guaranteeing the DB change and the event can't diverge.
6. **Idempotency:** each step is idempotent (keyed by order ID + step) so retries don't double-charge or double-reserve.

### Why this design (deep reasoning)
- **Saga over distributed transactions:** 2PC locks resources across services and fails badly under partial outages; sagas use local transactions + compensation, which is resilient and scalable, at the cost of only **eventual** consistency (a brief window where the order is partially processed).
- **Step Functions (orchestration) over pure event choreography:** for a flow with compensation and branching, a central orchestrator gives **visibility and explicit error handling**. Pure choreography (services reacting to each other's events) is more decoupled but much harder to reason about and debug for complex sagas — I'd mention I'd choose choreography for simpler, looser flows.
- **Outbox pattern** closes the **dual-write gap**: without it, a service might commit to its DB but crash before publishing the event (or vice versa), leaving the system inconsistent. The outbox makes the DB write and the event atomic.
- **Idempotency** is mandatory because retries and at-least-once delivery guarantee duplicates.

### Failure modes & mitigations (in detail)
- **Partial failure:** compensation steps undo completed work (refund, release) → the order ends in a clean failed state with a reason.
- **Duplicate processing:** idempotency keys per step; conditional writes.
- **Dual-write inconsistency:** outbox pattern + a reliable relay (e.g., DynamoDB Streams / a poller publishing the outbox).
- **Stuck/long-running sagas:** Step Functions handles waits and timeouts; for human approval, use a callback/task token pattern.
- **Compensation itself fails:** retries on compensation, and a DLQ/alert for manual intervention as a last resort (some compensations are themselves eventually-consistent).
- **Detection:** Step Functions execution-failure alarms, per-step error metrics, and a dashboard of sagas in each state.

### Cost & scale (in detail)
- **Step Functions:** use **Express workflows** for high-volume, short-lived order flows (cheaper, higher throughput) and **Standard** for long-running/durable ones — I'd pick based on volume and duration.
- **Scale:** each step (Lambda/service) scales independently; the orchestrator scales with execution count.
- **The knee:** downstream services (payment provider, inventory DB) are the real limits; the saga adds resilience but inherits their throughput ceilings — so I pair it with retries/circuit breakers around those calls.

### 30-second summary
"No global ACID across services, so I use the **saga pattern**: local transactions with **compensating actions**, orchestrated by **Step Functions** for durable state, retries, and visibility. I emit domain events via EventBridge, use the **outbox pattern** to avoid dual-write inconsistency, and make every step idempotent. On failure, compensations (refund, release inventory) restore consistency. Express workflows for high volume."

---


## Scenario 13 — Diagnosing a sudden latency spike in production

### The question & how to open
"Your API's p99 latency suddenly tripled, but there are no obvious errors. Walk me through how you'd diagnose and fix it."

This is a *process* question more than an architecture one — they want to see how you think under pressure. I'd open by stating my philosophy: *mitigate first, root-cause second*, and *work from symptoms to cause using data, not hunches*. I'd also ask: *When did it start? Did it correlate with a deploy or traffic change? Is it all endpoints or some? Is it p50 too, or only the tail?*

### How I'd explain it (narrative)
"My first instinct in an incident is **not** to start guessing at code — it's to **scope the problem with data and stabilize the user impact**, then narrow down to the cause with the observability stack. The fact that latency spiked but errors didn't is itself a clue: it usually means something is *slow*, not *broken* — a saturated resource, a slow dependency, GC pauses, or contention — rather than a logic bug. I'd follow a disciplined funnel: scope → recent changes → trace → correlate resources → hypothesize → verify, mitigating as soon as I have a safe lever."

### Recommended approach (in detail)
1. **Scope it (dashboards):** Is it all routes or specific ones? All regions/AZs? p50 too, or only p99 (a tail problem points to a subset of requests — a specific dependency, a hot key, or GC)? Check the SLO dashboard.
2. **Check recent changes:** the highest-probability cause. Any **deploy**, config change, or **feature-flag** flip near the start time? Traffic surge? Check **AWS Health** for provider-side issues.
3. **Trace it:** open **X-Ray / OpenTelemetry** traces for slow requests and find which **span** dominates — is it the app, a database call, a downstream service, or a queue wait? This localizes the problem fast.
4. **Correlate resources (USE):** look at **event-loop lag** and **GC pause** (Node-specific), CPU/memory, **DB connection-pool saturation** and slow-query/lock metrics (Performance Insights), **cache hit rate**, and **queue depth**.
5. **Form & test a hypothesis:** e.g., "cache hit rate dropped to near-zero at the same moment" → likely a **cache stampede** after a flush/deploy. Verify against the data.
6. **Mitigate, then fix:** roll back the suspect deploy, scale out, shed load, or open a circuit breaker on a slow dependency — *before* I have the perfect root cause. Then fix properly and add a regression guard.

### Why this approach (deep reasoning)
- **Mitigation before perfect diagnosis** minimizes user pain; a clean rollback or scale-out often restores service while I investigate calmly.
- **Symptom → cause funnel** avoids the classic junior mistake of randomly changing code. Each step *narrows* the search space using evidence.
- **Traces are the fastest localizer** in a distributed system — they answer "which hop is slow?" directly, instead of grepping logs blindly.
- **The latency-without-errors signal** steers me toward saturation/contention/GC rather than logic bugs — pattern recognition that comes from having the right metrics in place.
- This is why I **invest in observability before incidents**: correlation IDs, traces, RED/USE dashboards, and SLOs are what make this a 10-minute diagnosis instead of a 3-hour outage.

### Common culprits & their fixes (in detail)
- **Slow query / missing index** (a data-growth threshold crossed): add an index, fix the query, paginate.
- **Downstream dependency slow/timing out:** requests pile up and exhaust the event loop → add **timeouts + circuit breaker** so it fails fast and degrades gracefully.
- **Cache stampede after a flush/deploy:** many simultaneous misses hammer the DB → single-flight locks, jittered TTLs, warm hot keys.
- **Connection-pool exhaustion:** scale-out increased total connections past the DB limit → RDS Proxy / pool tuning.
- **GC pressure:** allocation churn or undersized heap → reduce allocations, tune `--max-old-space-size`.
- **Hot partition / noisy neighbor:** skewed keys throttling one partition → re-key / write-shard.

### Cost & scale (in detail)
- The relevant "cost" here is **observability cost vs incident cost**: a small ongoing spend on metrics/traces/logs (sampled, with sensible retention/cardinality) saves enormous time and revenue during incidents.
- **The knee:** the bottleneck resource the funnel reveals — frequently the database or a downstream service, *not* Node CPU.

### 30-second summary
"Mitigate first, root-cause second, always using data. I scope with dashboards (all routes or some? p50 or just the tail?), check recent deploys/flags and AWS Health, use **traces** to find the slow span, then correlate resources — event-loop lag, GC, DB connections/locks, cache hit rate, queue depth. Latency-without-errors usually means saturation or a slow dependency, so I'd reach for rollback, scale-out, or a circuit breaker to stabilize, then fix the root cause and add a guard."

---

## Scenario 14 — Securing secrets and credentials end to end

### The question & how to open
"How do you manage secrets — database passwords, API keys, encryption keys — across environments, securely and with rotation?"

Clarifying questions: *What kinds of secrets (DB creds, third-party API keys, signing keys)? Compliance requirements? How often must they rotate? Who/what needs access?* Compliance and rotation needs shape the choice of services.

### How I'd explain it (narrative)
"My guiding principles are: **no static long-lived credentials in code or environment**, **least privilege per workload**, **encrypt everything with managed keys**, and **rotate**. The single biggest AWS breach vector is a leaked access key, so I lean entirely on **IAM roles with temporary STS credentials** — the SDK picks these up automatically, and there's nothing to leak. For application secrets like DB passwords, I store them in **Secrets Manager** (which can rotate them automatically), fetch them at runtime via the workload's role, and never bake them into images or commit them. Then I separate **data access** from **key access** so one compromised role can't both read data and decrypt it."

### Recommended architecture (in detail)
1. **AWS credentials:** every workload (Lambda function, ECS task) has its **own IAM role** issuing **temporary STS credentials** — no static access keys anywhere. EKS uses **IRSA** (roles for service accounts) for per-pod identity.
2. **Application secrets:**
   - **Secrets Manager** for credentials needing **rotation** (native rotation for RDS) — DB passwords, third-party API keys.
   - **SSM Parameter Store (SecureString)** for config and simpler secrets (cheaper).
   - Both **KMS-encrypted**.
3. **Runtime access:** the app fetches secrets at startup (or via the Secrets Manager/SSM **Lambda extension / agent cache**) using its role, **caches in memory**, and **refreshes on rotation**. ECS injects secrets via the task definition `secrets` field (resolved at runtime, not baked into the image).
4. **Encryption keys:** **KMS** customer-managed keys with scoped **key policies**, rotation enabled, and all usage logged in **CloudTrail**. Sensitive fields use **envelope encryption** (KMS data keys).
5. **Guardrails:** **least-privilege IAM** scoped to each secret's ARN/path; **pre-commit secret scanning** (git-secrets/trufflehog) and CI scanning; **log redaction** so secrets never appear in logs.

### Why this design (deep reasoning)
- **Roles over static keys** removes the thing that gets leaked; temporary credentials auto-expire, so even a leak has a short blast window.
- **Secrets Manager for rotation** means a compromised credential is valid only until the next rotation; native RDS rotation makes this automatic.
- **Fetch at runtime, not bake into images:** secrets in an image or env var can leak via `docker inspect`, image layers, or logs; runtime fetch via role keeps them out of artifacts.
- **Separating data access from key access** (distinct IAM principals for reading data vs using the KMS key) means a single compromised role can't both exfiltrate and decrypt — defense in depth.
- **Least privilege per workload** limits blast radius: one role per Lambda/task, scoped to exact actions and resource ARNs, tightened iteratively using CloudTrail/Access Analyzer.

### Failure modes & mitigations (in detail)
- **Leaked secret/key:** rotate and revoke immediately; short-lived STS creds expire on their own; alert via GuardDuty/anomalous CloudTrail.
- **Secret in logs:** structured-log **redaction** of known secret fields; never log request bodies wholesale.
- **Secret in source control:** pre-commit + CI secret scanning; if committed, rotate the secret (rewriting history isn't enough — assume it's compromised).
- **Over-broad role:** scope to exact ARNs + conditions; use **IAM Access Analyzer** and CloudTrail to right-size; permission boundaries as guardrails.
- **Rotation breaks the app:** the app must handle credential refresh gracefully (retry on auth failure, re-fetch from Secrets Manager) so rotation is seamless.
- **Detection:** CloudTrail on KMS/secret access, GuardDuty findings, billing anomalies.

### Cost & scale (in detail)
- **SSM Parameter Store** (standard tier) is essentially free → use it for the bulk of config and simpler secrets.
- **Secrets Manager** is priced per secret + API calls → reserve for secrets that genuinely need rotation; **cache in memory** to minimize API calls (and latency).
- **The knee:** at scale, uncached secret fetches add latency and cost — caching + the agent/extension pattern keeps it efficient.

### 30-second summary
"No static keys — **IAM roles + temporary STS creds** everywhere (IRSA on EKS). App secrets in **Secrets Manager** (with rotation) or **SSM SecureString**, KMS-encrypted, fetched at runtime via the role and cached, never baked into images or logged. Least-privilege per workload, separate data-access from key-access, secret scanning in CI, and CloudTrail auditing. A leak is contained because credentials are short-lived and rotated."

---

## Scenario 15 — Cost spike investigation and optimization

### The question & how to open
"The AWS bill jumped 40% this month with no obvious feature launch. How do you investigate and bring it down without hurting reliability?"

Clarifying questions: *Which services/accounts spiked? Is spend tagged by team/service? Did traffic actually grow, or is this waste? Any recent infra changes?* Whether spend is tagged determines how fast I can attribute it.

### How I'd explain it (narrative)
"I treat cost as an engineering KPI, so I'd approach this like any other metric regression: **attribute it with data first**, then fix the biggest drivers, while protecting reliability. I'd use **Cost Explorer** broken down by service and by **cost-allocation tags** to find *what* grew and *who owns it*. There are usually a handful of usual suspects — idle or over-provisioned compute, NAT Gateway data processing, ballooning log volume, cross-AZ/egress data transfer, or per-request API Gateway costs at high volume. The biggest, safest wins are typically right-sizing, killing idle resources, Spot for fault-tolerant workloads, and caching to offload compute and the database."

### Recommended approach (in detail)
1. **Attribute the spend:** **Cost Explorer** grouped by service, then by **cost-allocation tags** (team/service/env) and usage type. **Cost Anomaly Detection** to pinpoint when/where it spiked. If untagged, that's finding #1 — enforce tagging in IaC.
2. **Identify the usual drivers:**
   - **Compute:** over-provisioned Fargate/RDS/EC2 (check **Compute Optimizer**); idle resources running 24/7.
   - **Data transfer:** **NAT Gateway** data processing (route AWS traffic via **VPC endpoints** to avoid it), **cross-AZ** chatter, and **egress** (CloudFront reduces origin egress).
   - **Logs/observability:** CloudWatch **log volume and metric cardinality** can quietly dominate — set retention tiers, sample debug logs, drop high-cardinality dimensions.
   - **Storage:** S3 without lifecycle policies; old snapshots; unattached EBS volumes.
   - **API Gateway** per-request cost at high volume.
3. **Optimize (data-driven):**
   - **Right-size** to actual utilization.
   - **Pricing models:** **Savings Plans/Reserved** for steady baseline; **Spot/Fargate Spot** for fault-tolerant workers (huge savings).
   - **Scale to demand:** autoscaling + scale-to-zero so you don't pay for idle.
   - **Cache** (CloudFront/ElastiCache) to cut compute and DB load; **compress** payloads (data transfer is a hidden cost).
   - **S3 lifecycle / Intelligent-Tiering**; clean up orphaned resources.
4. **Govern:** budgets + alarms, per-team cost dashboards, and a cost-review cadence.

### Why this approach (deep reasoning)
- **Attribution before action:** optimizing blindly risks cutting the wrong thing; tags + Cost Explorer tell me exactly where the money goes and who owns it.
- **Biggest, safest levers first:** right-sizing and killing idle capacity reduce cost with **zero** reliability impact; Spot for workers is huge savings *because* the work is queued/idempotent and interruption-tolerant.
- **Caching is a twofer:** it cuts compute *and* database cost while improving latency.
- **Protect reliability:** I'd explicitly keep multi-AZ and sensible headroom — over-aggressive cost cutting that removes redundancy is a false economy.
- **Culture, not one-off:** as a lead I'd make cost visible per service (tags + dashboards) so teams own their spend, rather than doing periodic firefighting cleanups.

### Failure modes & mitigations (in detail)
- **Cutting too aggressively hurts reliability:** keep multi-AZ, headroom, and autoscaling floors; treat reliability as a constraint on cost optimization.
- **Untagged spend (can't attribute):** enforce tagging policies in IaC; use AWS Organizations + Cost Categories.
- **Surprise bills recurring:** **budgets + Cost Anomaly Detection alarms** so the next spike is caught in days, not at month-end.
- **Spot interruptions:** only use Spot for interruption-tolerant, queued, idempotent workloads (workers/batch), never for stateful singletons.
- **Hidden transfer costs:** VPC endpoints for S3/DynamoDB/Secrets, CloudFront for egress, keep chatty services in the same AZ where sensible.

### Cost & scale (in detail)
- **Break-even thinking:** for serverless vs containers, model per-request Lambda cost vs warm Fargate hours — at sustained high RPS containers often win; at spiky/low volume Lambda wins. Many systems end up **hybrid** for exactly this reason.
- **The knee:** the optimization that matters most is usually whichever resource is both **large** and **under-utilized** — that's where right-sizing/Spot/caching pays off most.

### 30-second summary
"Treat cost like a metric regression: **attribute first** with Cost Explorer + cost-allocation tags + Anomaly Detection, then fix the biggest drivers — right-size (Compute Optimizer), kill idle resources, **Spot** for fault-tolerant workers, **Savings Plans** for baseline, **cache** to offload compute/DB, VPC endpoints to cut NAT/egress, and tame log volume/cardinality. Protect multi-AZ and headroom throughout, and make per-service cost visible so teams own it."

---

## Closing — the universal structure for any scenario

When you get *any* scenario you haven't rehearsed, fall back on this skeleton and you'll sound like a lead:

1. **Clarify requirements first** — traffic shape, latency SLO, consistency needs, durability, budget, compliance, team size. (Asking good questions *is* a senior signal.)
2. **State the core problem** in one sentence — what actually breaks or what the real constraint is.
3. **Propose the architecture** — component by component, following the data flow.
4. **Justify with trade-offs** — name the alternatives you rejected and *why*, and the trade-offs you accepted (e.g., eventual consistency for scale, double capacity for safe rollback).
5. **Walk the failure modes** — what breaks, how you detect it, how the system **degrades gracefully** rather than failing totally.
6. **Address cost & scale** — what drives cost, how each tier scales, where the knee is.
7. **Say how you'd evolve it** — and explicitly **resist over-engineering** day one.

**Recurring themes the interviewer is listening for:** statelessness & horizontal scaling · idempotency + retries (backoff/jitter) + DLQs · decoupling via queues/events (load leveling) · least privilege & defense in depth · observability built in from day one · graceful degradation (circuit breakers, load shedding, fallbacks) · cost as an engineering KPI · *measure before optimizing* · and matching complexity to the actual requirement.
