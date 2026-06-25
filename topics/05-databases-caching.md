# 5. Databases & Caching — RDS, DynamoDB, ElastiCache (Q59–Q71)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Prev:** [← 4. Scaling & Resilience](./04-scaling-load-resilience.md) · **Next:** [6. Security & Identity →](./06-security-identity.md)

---

## 5. Databases & Caching (RDS, DynamoDB, ElastiCache)

### Q59. How do you choose between a relational database (RDS/Aurora) and DynamoDB?

**Short answer:** Use relational when you need complex queries, joins, ad-hoc reporting, and strong transactional integrity over a moderate scale; use DynamoDB when you need predictable single-digit-ms performance at massive scale with known access patterns and a serverless, connectionless model.

**Detailed answer:**
- **RDS/Aurora (SQL):** rich querying (joins, aggregations), ACID transactions, flexible ad-hoc queries, mature tooling. Scales vertically + read replicas; writes are harder to scale. Connection-based (pooling concerns, Q33).
- **DynamoDB (NoSQL):** virtually unlimited horizontal scale, consistent low latency, pay-per-use/auto-scaling, no connection management (HTTP API — perfect for Lambda). But you must **model around access patterns** up front; ad-hoc queries and joins are painful/expensive.

**Decision drivers:** access-pattern predictability, scale, query complexity, team familiarity, serverless fit.

**Real-time use case:** A high-traffic shopping cart / session store / IoT telemetry → DynamoDB. A financial ledger with complex reporting and joins → Aurora PostgreSQL.

**Lead-level insight:** "Relational by default for complex domains; DynamoDB when access patterns are known and scale/serverless demands it." Many systems use **both** (polyglot persistence). The classic mistake is forcing relational thinking onto DynamoDB (or vice versa).

---

### Q60. How do you model data in DynamoDB? Explain partition keys, sort keys, and single-table design.

**Short answer:** Model around access patterns first; choose a partition key with high cardinality for even distribution, use sort keys for ranges/hierarchies, and consider single-table design with GSIs to satisfy multiple query patterns.

**Detailed answer:**
- **Partition key (PK):** determines the physical partition; must be high-cardinality and evenly accessed to avoid hot partitions (Q71).
- **Sort key (SK):** enables range queries and one-to-many relationships within a partition (e.g., `USER#123` PK with `ORDER#2024...` SKs).
- **Composite keys + overloading:** encode multiple entity types and relationships using prefixed keys.
- **GSIs (Global Secondary Indexes):** alternative key schemas to support additional access patterns; **LSIs** share the PK with a different SK.
- **Single-table design:** store multiple entity types in one table to fetch related items in a single query — fewer round trips, better performance, but a steeper learning curve.

**Lead-level insight:** "List your access patterns, then design keys to serve them" — the opposite of relational normalization. Mention sparse indexes, write sharding for hot keys, and that single-table design optimizes performance at the cost of readability/flexibility (a real trade-off, not always worth it).

---

### Q61. How do RDS Read Replicas and Multi-AZ differ, and how do you scale reads?

**Short answer:** Multi-AZ is for **high availability** (synchronous standby, automatic failover, not for read scaling); Read Replicas are for **scaling reads** (asynchronous copies you can query), with replica lag to manage.

**Detailed answer:**
- **Multi-AZ:** a synchronous standby in another AZ; on primary failure, AWS fails over (DNS endpoint swings) with minimal data loss. The standby is *not* readable (for classic RDS). Purpose: availability/durability.
- **Read Replicas:** asynchronous copies serving read traffic; offload reporting/read-heavy queries from the primary. **Replication lag** means replicas can be slightly stale (eventual consistency for reads).
- **Aurora:** combines both — up to 15 low-lag replicas that are also failover targets, with a shared storage layer.

**Scaling reads:** route reads to replicas (reader endpoint), cache hot reads in ElastiCache, and keep writes on the primary. Writes scale via bigger instances, sharding, or Aurora.

**Lead-level insight:** Don't read-after-write from a replica expecting fresh data (lag). Aurora's reader endpoint + Auto Scaling of replicas is the cleaner modern approach. For write scaling, mention sharding or moving hot entities to DynamoDB.

---

### Q62. What causes slow database queries and how do you diagnose and fix them?

**Short answer:** Usually missing/poor indexes, N+1 queries, full table scans, lock contention, or bad query plans. Diagnose with slow query logs + `EXPLAIN`, fix with indexing, query rewrites, and caching.

**Detailed answer:**
- **Diagnose:** enable slow query log / Performance Insights; run `EXPLAIN (ANALYZE)` to see the plan (seq scan vs index scan), rows examined, and join strategy.
- **Common fixes:**
  - **Indexes:** add on filter/join/sort columns; composite indexes matching query order; avoid over-indexing (slows writes).
  - **N+1:** batch with joins or `IN`/DataLoader; eager-load in the ORM where appropriate.
  - **Pagination:** keyset/cursor pagination instead of large `OFFSET`.
  - **Avoid `SELECT *`**, fetch needed columns.
  - **Caching:** ElastiCache for hot reads.
- **Monitor:** RDS Performance Insights shows top SQL by load and wait events.

**Lead-level insight:** Lead with *measurement* (Performance Insights / `EXPLAIN`), not guessing. Watch for write-amplification from too many indexes, and understand that the ORM can hide expensive queries — review generated SQL.

---

### Q63. Why is RDS Proxy important, and how does it help Node.js apps?

**Short answer:** RDS Proxy pools and shares database connections, preventing connection exhaustion from many app instances/Lambdas, improving failover speed, and enabling IAM auth.

**Detailed answer:**
- **Connection pooling/multiplexing:** many client connections share a smaller pool of DB connections, so a fleet of containers or a burst of Lambdas doesn't exceed RDS `max_connections` (Q33).
- **Faster failover:** Proxy holds connections and reroutes during failover, reducing failover-induced errors and downtime.
- **Security:** enforces IAM authentication and pulls credentials from Secrets Manager — no DB passwords in app config.

**Real-time use case:** A Lambda-backed API scaling to 800 concurrent executions would open 800 connections; RDS Proxy multiplexes them onto, say, 50 actual DB connections.

**Lead-level insight:** Essential for serverless + relational and for spiky container fleets. Note the small latency overhead and that pinning (from session state/transactions) can reduce multiplexing benefits — keep transactions short and avoid session-level state.

---

### Q64. Compare ElastiCache Redis vs Memcached. When do you use each and for what patterns?

**Short answer:** Redis for rich data structures, persistence, pub/sub, replication, sorting, and atomic ops; Memcached for simple, multi-threaded, horizontally-sharded volatile caching. Redis is the default for most use cases.

**Detailed answer:**
- **Redis:** data structures (lists, sets, sorted sets, hashes, streams), persistence/snapshots, replication + automatic failover, pub/sub, Lua scripting, geospatial, TTLs, atomic increments. Use for sessions, leaderboards (sorted sets), rate limiting, distributed locks, queues, and as a WebSocket backplane.
- **Memcached:** simple key-value, multi-threaded (uses multiple cores well), easy horizontal scaling by adding nodes. Use for simple, large, ephemeral caches where you don't need persistence or rich types.

**Caching patterns:** cache-aside (lazy), write-through, write-behind; always TTL + invalidation strategy (Q25, Q56).

**Lead-level insight:** In practice, Redis covers ~90% of needs and adds replication/HA. Mention cluster mode for sharding large datasets, and that Redis being single-threaded per shard means a slow command (`KEYS *`) blocks it — avoid blocking commands in production.

---

### Q65. How do you ensure data consistency in distributed systems (eventual consistency, transactions, sagas)?

**Short answer:** Pick the consistency model per use case — strong where required (financial), eventual where acceptable (feeds/counts) — and use transactions within a service, sagas/outbox across services.

**Detailed answer:**
- **Within one DB:** ACID transactions guarantee atomicity/consistency.
- **DynamoDB:** offers strongly consistent reads (vs default eventually consistent) and `TransactWriteItems` for multi-item ACID within DynamoDB.
- **Across services:** no distributed ACID — use the **Saga pattern** (a sequence of local transactions with compensating actions on failure), orchestrated (Step Functions) or choreographed (events).
- **Outbox pattern:** write the DB change and the event to publish in the same transaction (to an outbox table), then a relay publishes to the bus — avoids the dual-write inconsistency between DB and message broker.
- **Idempotency** (Q49) underpins all of this.

**Lead-level insight:** "Strong consistency where correctness demands it; eventual where you can tolerate it for scale/availability" (CAP/PACELC trade-off). Naming the outbox + saga patterns shows you understand distributed data integrity beyond textbook ACID.

---

### Q66. How do you manage database schema migrations safely in production?

**Short answer:** Use a migration tool, make changes backward-compatible (expand/contract), run migrations in CI/CD with care for locks, and decouple deploys from destructive changes.

**Detailed answer:**
- **Tooling:** TypeORM/Prisma migrations, Knex, Flyway — versioned, reviewed, in source control, applied automatically in the pipeline.
- **Expand/contract (parallel change):** 1) **expand** — add new column/table (nullable, backward-compatible); 2) deploy code that writes both/reads new; 3) backfill data; 4) **contract** — remove old column after all instances use the new schema. This enables zero-downtime deploys (old + new code run together during rollout).
- **Avoid long locks:** adding an index or column on a huge table can lock it; use online/concurrent index builds (`CREATE INDEX CONCURRENTLY` in Postgres), batched backfills.
- **Safety:** test migrations on a prod-like dataset, take snapshots/backups, and have a rollback plan.

**Lead-level insight:** Destructive migrations (drop column) must lag the code change by at least one deploy. As a lead you enforce backward-compatible migrations and review them like code — a careless `ALTER TABLE` can cause an outage.

---

### Q67. How do you handle connection pooling correctly across many app instances?

**Short answer:** Size each pool so `pool_size × instance_count ≤ DB max_connections` with headroom; use RDS Proxy when instances/Lambdas are numerous or dynamic.

**Detailed answer:**
- Each app process keeps a pool (e.g., pg `Pool`). If 40 containers each hold 20 connections, that's 800 connections — which can exceed a smaller RDS instance's limit and cause `too many connections` errors.
- **Rules:** compute total connections across the fleet at max scale; leave headroom for admin/replication/migrations; tune pool min/max, idle timeout, and acquisition timeout.
- **Lambda:** pools don't help much (one execution = one environment); use RDS Proxy (Q63).
- **Monitor:** connection count, pool wait time, and DB `max_connections` utilization.

**Lead-level insight:** Connection exhaustion is a top cause of cascading DB outages during scale-out events. The lead move is to model the math at peak scale and put RDS Proxy in front of dynamic/serverless fleets.

---

### Q68. What are DynamoDB Streams and how do you use them in event-driven designs?

**Short answer:** DynamoDB Streams capture an ordered, time-ordered log of item-level changes (insert/modify/remove), consumable by Lambda for downstream reactions, materialized views, replication, and CDC.

**Detailed answer:**
- A stream emits change records (with old/new images as configured); a Lambda trigger processes them in near-real-time, ordered per partition.
- **Uses:** maintain aggregated/materialized views, fan out events (analytics, search index sync to OpenSearch), cross-region replication, audit logs, and the outbox-style event publishing.
- **Reliability:** stream consumers must be idempotent; failures retry on the shard (poison-pill considerations, Q39) — use bisect/failure destinations.

**Real-time use case:** Order table changes stream to a Lambda that updates a per-customer summary item and pushes an event to EventBridge for notifications — decoupled and reactive.

**Lead-level insight:** Streams enable CDC without polling. Note 24-hour retention and ordering only within a shard; for longer retention/replay or higher fan-out, consider Kinesis. Global Tables use streams under the hood for multi-region replication.

---

### Q69. How do you implement full-text search and analytics on top of an operational database?

**Short answer:** Don't overload the OLTP DB — replicate data into a purpose-built store: OpenSearch for full-text search, and Athena/Redshift for analytics, fed via streams/CDC/ETL.

**Detailed answer:**
- **Search:** sync data to **OpenSearch** (via DynamoDB Streams/CDC or app dual-write through an outbox) for fuzzy/full-text/faceted search — far better than SQL `LIKE` scans.
- **Analytics:** offload heavy aggregation from the operational DB. Stream/export data to **S3 (data lake)** and query with **Athena**, or load into **Redshift** for BI. This protects OLTP performance.
- **Pipelines:** Kinesis Firehose → S3, Glue for ETL, scheduled exports.

**Lead-level insight:** The principle is **separation of operational and analytical workloads** (OLTP vs OLAP). Running big analytics queries on the production DB degrades user-facing latency — a common scaling mistake. Keep the source of truth operational and project read-optimized views elsewhere.

---

### Q70. How do you handle backups, point-in-time recovery, and disaster recovery for databases?

**Short answer:** Use automated backups + point-in-time recovery, cross-region snapshot copies for DR, test restores regularly, and align retention with RPO/RTO and compliance.

**Detailed answer:**
- **RDS/Aurora:** automated daily backups + transaction logs enable **PITR** to any second within the retention window; manual snapshots for long-term; copy snapshots cross-region for DR.
- **DynamoDB:** PITR (continuous backups, restore to any second in last 35 days) + on-demand backups; Global Tables for active-active multi-region.
- **Test restores:** a backup you've never restored is a hope, not a plan — periodically restore to validate.
- **Encryption:** backups encrypted with KMS.

**Lead-level insight:** Define RPO/RTO with the business and design backups/replication to meet them. Cross-region snapshot copies + IaC let you rebuild in a DR region. The lead-level point: *rehearse* DR (game days), don't just configure it.

---

### Q71. What is a hot partition / hot key, and how do you prevent it in DynamoDB?

**Short answer:** A hot partition occurs when traffic concentrates on one partition key, exceeding its throughput and causing throttling; prevent it with high-cardinality keys, write sharding, and caching.

**Detailed answer:**
DynamoDB distributes data by partition key hash; each partition has throughput limits. If one key (e.g., a celebrity user, "today's date", a single tenant) gets disproportionate traffic, that partition throttles even if overall table capacity is fine.

**Prevention:**
- **High-cardinality keys:** choose keys that spread load (user ID over status/date).
- **Write sharding:** append a random/calculated suffix to the key (`EVENT#2024-01-01#7`) to spread a hot key across N logical partitions; aggregate on read.
- **Caching:** put hot reads behind DAX or ElastiCache.
- **Adaptive capacity** helps automatically but isn't a substitute for good key design.

**Lead-level insight:** This is the DynamoDB analog of skewed data. Mention **DAX** (DynamoDB Accelerator) for read-heavy hot keys and that the same skew concept applies to Kinesis shards and SQL sharding — uneven distribution is a universal scaling enemy.

---


