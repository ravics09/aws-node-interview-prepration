# 7. Monitoring, Logging & Observability (Q84–Q93)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Prev:** [← 6. Security & Identity](./06-security-identity.md) · **Next:** [8. System Design →](./08-system-design-usecases.md)

---

## 7. Monitoring, Logging & Observability

### Q84. What are the three pillars of observability, and how do they differ from monitoring?

**Short answer:** The pillars are **logs, metrics, and traces**. Monitoring tells you *whether* something is wrong (known questions/dashboards); observability lets you *ask new questions* to understand *why* — especially for novel failures.

**Detailed answer:**
- **Metrics:** numeric time-series (latency, error rate, throughput, CPU) — cheap, aggregatable, great for dashboards and alerts.
- **Logs:** discrete, detailed event records — rich context for a specific event/request.
- **Traces:** the path of a request across services/spans — show where latency/errors occur in a distributed flow.
- **Monitoring vs observability:** monitoring is pre-defined checks on known failure modes; observability is the property that you can explore your system's internal state from its outputs to debug *unknown-unknowns*.

**Lead-level insight:** A lead drives a culture where observability is built in from day one (structured logs + RED metrics + tracing + correlation IDs), not bolted on after an incident. Add a fourth concern: **events/profiling** and **continuous profiling** for deep performance work.

---

### Q85. How do you implement structured logging in a Node.js service, and why does it matter?

**Short answer:** Emit JSON logs with consistent fields (level, timestamp, correlation/trace ID, context) via a fast logger (pino), so logs are queryable, aggregatable, and correlatable across services.

**Detailed answer:**
- **Structured (JSON) logs** instead of free-text strings → machine-parseable, filterable in CloudWatch Logs Insights/OpenSearch, and aggregatable.
- **Logger choice:** `pino` (very fast, low overhead — important since logging is in the hot path) or Winston; in NestJS use a `LoggerService` integration.
- **Standard fields:** `level`, `timestamp`, `service`, `env`, `correlationId`/`traceId` (Q29 via AsyncLocalStorage), `userId` (if non-sensitive), `route`, `latencyMs`.
- **Levels:** use them deliberately (error/warn/info/debug) and make level configurable per environment.
- **Redaction:** strip PII/secrets (pino redact paths).

**Lead-level insight:** Structured + correlated logging is what makes distributed debugging tractable. Performance matters — synchronous/verbose logging can become a bottleneck; pino's async, low-overhead design and sensible levels keep logging from hurting throughput.

---

### Q86. How do CloudWatch Logs, Metrics, and Alarms work together for a Node.js/AWS stack?

**Short answer:** Logs collect application/platform output, Metrics track time-series (built-in + custom), Metric Filters turn log patterns into metrics, and Alarms trigger notifications/auto-actions when metrics breach thresholds.

**Detailed answer:**
- **Logs:** ECS `awslogs` driver / Lambda auto-logging send to CloudWatch Log Groups; query with **Logs Insights**.
- **Metrics:** AWS publishes service metrics (ALB latency/5xx, Lambda errors/duration/throttles, RDS CPU/connections). You publish **custom metrics** (e.g., event-loop lag, business KPIs) via the SDK or **Embedded Metric Format (EMF)** (emit metrics inside structured logs — efficient, no extra API calls).
- **Metric Filters:** extract metrics from log patterns (e.g., count `"level":"error"`).
- **Alarms:** threshold or anomaly-detection alarms → SNS (PagerDuty/Slack/email) or auto-actions (autoscaling, restart). **Composite alarms** combine conditions to reduce noise.

**Lead-level insight:** EMF is the lead-level detail — it lets you emit high-cardinality custom metrics cheaply from logs. Alarm on **symptoms users feel** (latency, error rate) plus **leading indicators** (queue depth, event-loop lag), and design alarms to minimize false positives.

---

### Q87. What is AWS X-Ray (and OpenTelemetry), and how do you use distributed tracing?

**Short answer:** X-Ray (and the vendor-neutral OpenTelemetry standard) captures end-to-end request traces across services as spans, revealing latency breakdowns, errors, and service dependencies (service map).

**Detailed answer:**
- **Instrumentation:** the X-Ray SDK or **OpenTelemetry** (recommended, vendor-neutral) auto-instruments HTTP, AWS SDK, and DB calls in Node; you add custom spans for key operations.
- **Traces & spans:** each request gets a trace ID; spans represent operations (API → DB → downstream). The **service map** visualizes dependencies and where latency/errors concentrate.
- **Propagation:** trace context flows via headers (`traceparent`) and into SQS/SNS message attributes so async hops stay connected.
- **Sampling:** sample a fraction of requests to control cost/volume while keeping representative data.

**Lead-level insight:** Prefer OpenTelemetry (with AWS Distro for OpenTelemetry) for portability across X-Ray/Datadog/Jaeger. Tracing answers "which hop is slow?" in microservices — pair it with correlation IDs in logs (Q29) so you can jump from a trace to the relevant logs.

---

### Q88. How do you define SLIs, SLOs, and error budgets, and how do they guide engineering decisions?

**Short answer:** SLIs are measured indicators (e.g., p99 latency, success rate); SLOs are targets for them (e.g., 99.9% success); the error budget is the allowed shortfall, which governs the balance between shipping features and improving reliability.

**Detailed answer:**
- **SLI (Indicator):** a quantitative measure of service health — request success rate, latency percentile, availability.
- **SLO (Objective):** the target, e.g., "99.9% of requests succeed within 300ms over 30 days."
- **Error budget:** `100% − SLO` = how much unreliability is acceptable. If you're burning the budget fast, freeze risky changes and invest in reliability; if there's budget to spare, ship faster.
- **Alerting on burn rate:** alert when you're consuming the error budget too quickly, rather than on every blip (reduces noise).

**Lead-level insight:** SLOs turn reliability into a shared, data-driven conversation with the business and align dev/ops incentives. As a lead you define meaningful **user-centric** SLIs (not vanity CPU metrics) and use error budgets to make objective ship-vs-stabilize decisions.

---

### Q89. How do you set up effective alerting that avoids both missed incidents and alert fatigue?

**Short answer:** Alert on user-facing symptoms and SLO burn rate (not every metric), make alerts actionable with runbooks, use severities/routing, and continuously prune noisy alerts.

**Detailed answer:**
- **Alert on symptoms:** error rate, latency, availability (what users feel) — plus a few leading indicators (queue age, event-loop lag, DB connection saturation).
- **Burn-rate alerts:** multi-window (fast + slow) error-budget burn alerts catch both sudden and slow degradations with fewer false positives.
- **Actionable + routed:** every alert links to a runbook, has a clear owner, and a severity (page vs ticket). Route via SNS → PagerDuty/Opsgenie/Slack.
- **Reduce noise:** composite alarms, deduplication, suppression during deploys/maintenance, and regular review of which alerts fired and were actionable.

**Lead-level insight:** Alert fatigue is dangerous — people start ignoring pages. The lead principle: *if an alert isn't actionable, it shouldn't page someone.* Track alert quality (signal-to-noise) as a metric and prune relentlessly.

---

### Q90. How do you manage log aggregation, retention, and cost at scale?

**Short answer:** Centralize logs, set retention per log type/compliance need, tier/archive cold logs to cheap storage, sample/limit high-volume debug logs, and control cardinality to manage cost.

**Detailed answer:**
- **Centralize:** all services → CloudWatch Logs (or OpenSearch/Datadog) for unified search; correlation IDs tie them together.
- **Retention:** set per Log Group (e.g., 7–30 days hot for ops, longer for audit). Export to **S3** (cheap, lifecycle to Glacier) for long-term/compliance; query archived logs with Athena.
- **Cost control:** logging volume can dominate observability cost — drop noisy debug logs in prod, sample verbose logs, avoid logging large payloads, and watch metric **cardinality** (high-cardinality dimensions explode cost).
- **Data retention policy:** align with legal/compliance (and PII deletion requirements).

**Lead-level insight:** Logs are deceptively expensive at scale. A lead sets retention tiers, separates audit (long, immutable) from operational (short) logs, and treats log volume/cardinality as a cost lever — without losing the data needed to debug incidents.

---

### Q91. How do you debug a production incident where latency suddenly spiked, with no obvious error?

**Short answer:** Work from symptoms to cause using the observability stack: confirm scope via dashboards, check recent changes/deploys, drill into traces to find the slow hop, correlate with resource saturation, and form/test hypotheses.

**Detailed answer:**
1. **Scope it:** which endpoints/regions/customers? Is it p50 or only p99 (tail)? Check the SLO dashboard.
2. **Recent changes:** deploys, config/feature-flag flips, traffic changes, dependency incidents (AWS Health).
3. **Trace it:** distributed traces (X-Ray/OTel) to localize the slow span — app, DB, downstream, or queue.
4. **Correlate resources:** event-loop lag, GC pauses (Q11), CPU/memory, DB connections/locks, cache hit rate, queue depth.
5. **Common culprits:** slow query/missing index, downstream timeout (→ circuit breaker), cache stampede after a flush (Q56), connection-pool exhaustion (Q67), GC pressure, or a noisy-neighbor/hot partition.
6. **Mitigate then fix:** roll back, scale out, shed load, or open a circuit; then root-cause and prevent.

**Lead-level insight:** Lead with a structured method (symptom → narrow → hypothesis → verify) and prioritize **mitigation before perfect diagnosis**. The presence of correlation IDs + traces + dashboards is what makes this fast — which is why you invest in observability *before* the incident.

---

### Q92. What metrics matter most for a Node.js backend, and what frameworks (RED/USE) guide you?

**Short answer:** Use **RED** for request-driven services (Rate, Errors, Duration) and **USE** for resources (Utilization, Saturation, Errors); for Node specifically also watch event-loop lag, GC, and heap.

**Detailed answer:**
- **RED (services):** **Rate** (requests/sec), **Errors** (error %), **Duration** (latency percentiles). The core of user-facing health.
- **USE (resources):** **Utilization**, **Saturation** (queue/wait), **Errors** for CPU, memory, disk, DB connections, network.
- **Node-specific:** **event-loop lag** (Q4), **GC pause time/frequency** (Q11), heap used/RSS (leak detection, Q3), active handles/requests.
- **Downstream:** DB query latency, cache hit ratio, queue depth/age, external API latency/error.
- **Business KPIs:** signups, orders/sec, payment success rate — tie tech health to business impact.

**Lead-level insight:** Combine RED (symptoms) + USE (causes): RED tells you users are hurting; USE/Node metrics tell you why (saturated resource). Always track latency **percentiles**, never just averages.

---

### Q93. How do you implement health checks and readiness/liveness probes correctly?

**Short answer:** Separate **liveness** (is the process alive? restart if not) from **readiness** (can it serve traffic now? include dependency checks), keep them lightweight, and wire them to the load balancer/orchestrator.

**Detailed answer:**
- **Liveness:** a cheap endpoint proving the process/event loop responds; failure → orchestrator restarts the task. Don't check dependencies here (a DB blip shouldn't kill every pod).
- **Readiness:** reflects ability to serve — checks critical dependencies (DB reachable, caches, warm-up complete). Failure → LB stops routing to this instance until healthy, without restarting it.
- **Wire-up:** ALB target group health check → readiness; ECS/Kubernetes liveness/readiness probes; align with graceful shutdown (Q9) so draining instances report not-ready.
- **Keep them fast & cheap** to avoid false negatives under load and avoid expensive dependency calls on every probe (cache the result briefly).

**Lead-level insight:** A subtle but classic failure: an over-aggressive readiness check that depends on a shared DB can take down the *entire* fleet during a transient DB hiccup (all instances go unready at once). Make dependency checks tolerant (degraded vs unhealthy) to avoid correlated failure.

---


