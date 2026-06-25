# Amazon CloudWatch + Node.js

## What it is
AWS's observability service: **Logs** (aggregation + query), **Metrics** (time-series, built-in + custom), **Alarms** (notify/auto-act on thresholds), plus dashboards and Synthetics. It's how you see what your Node.js services are doing in real time.

## How we use it with Node.js
- **Logs:** on Lambda, anything written to stdout/`console`/a logger goes to CloudWatch automatically; on ECS, the `awslogs` driver ships container stdout. Use a structured logger (**pino**) for JSON logs you can query.
- **Metrics:** publish custom metrics with `PutMetricData`, or (preferred) the **Embedded Metric Format (EMF)** — emit metrics inside structured logs, no extra API calls.
- **Alarms:** configured (console/CDK) on metrics → SNS → PagerDuty/Slack, or auto-actions (autoscaling).

## For what purpose (real use cases)
- **Centralized structured logging** with correlation IDs for distributed debugging.
- **Custom business + technical metrics** (orders/sec, event-loop lag, queue depth).
- **Alerting** on user-facing symptoms (error rate, latency) and leading indicators.
- **Dashboards** for RED/USE metrics and SLOs.

## Code

### 1. Structured logging with pino (JSON, queryable in Logs Insights)
```ts
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'password'], // never log secrets
});

logger.info({ correlationId, route: '/checkout', latencyMs: 42 }, 'request completed');
logger.error({ correlationId, err }, 'payment failed');
```

### 2. Custom metric via EMF (metric embedded in a log line — efficient)
```ts
// Emit a metric without a separate API call; CloudWatch extracts it from the log.
function emitMetric(name: string, value: number, unit = 'Count', dims: Record<string, string> = {}) {
  console.log(JSON.stringify({
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: 'MyApp',
        Dimensions: [Object.keys(dims)],
        Metrics: [{ Name: name, Unit: unit }],
      }],
    },
    ...dims,
    [name]: value,
  }));
}
emitMetric('OrdersProcessed', 1, 'Count', { service: 'checkout', env: 'prod' });
```

### 3. Custom metric via the SDK (when not in a log context)
```ts
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
const cw = new CloudWatchClient({});

await cw.send(new PutMetricDataCommand({
  Namespace: 'MyApp',
  MetricData: [{
    MetricName: 'QueueDepth',
    Value: depth,
    Unit: 'Count',
    Dimensions: [{ Name: 'Queue', Value: 'emails' }],
  }],
}));
```

### 4. Publishing Node event-loop lag (a key health metric)
```ts
import { monitorEventLoopDelay } from 'perf_hooks';
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  emitMetric('EventLoopLagP99Ms', h.percentile(99) / 1e6, 'Milliseconds', { service: 'api' });
  h.reset();
}, 60_000);
```

### 5. Querying logs (CloudWatch Logs Insights)
```
fields @timestamp, correlationId, latencyMs, @message
| filter route = "/checkout" and latencyMs > 500
| sort latencyMs desc
| limit 50
```

## Lead-level notes & gotchas
- **Structured JSON logs** (pino — fast, low overhead) make logs queryable and correlatable; include a **correlationId** (via `AsyncLocalStorage`) on every line.
- **EMF** is the lead-level trick: emit custom/high-cardinality metrics cheaply from logs, no extra `PutMetricData` calls.
- **Alarm on symptoms** (error rate, p99 latency) + leading indicators (event-loop lag, queue depth); use **composite alarms** and **anomaly detection** to cut noise; alert on **SLO burn rate**, not every blip.
- **Use percentiles**, not averages (averages hide tail latency).
- **Cost control:** logging volume + metric **cardinality** can dominate cost — set retention tiers, sample debug logs, drop high-cardinality dimensions, archive to S3 for long-term.
- For tracing across services, pair CloudWatch with **X-Ray / OpenTelemetry (ADOT)**.
