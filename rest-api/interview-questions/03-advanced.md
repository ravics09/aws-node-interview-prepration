# REST API Interview Questions — Advanced

[← Back to index](./README.md) · Context: **Node.js · Express.js · AWS**

---

### Q1. How do you make a non-idempotent endpoint (POST) safe to retry?

**Answer.** Use an **idempotency key**: the client sends a unique key per logical operation; the server records the key + result and returns the original result on duplicates.

```js
app.post('/payments', authenticate, async (req, res, next) => {
  const key = req.header('Idempotency-Key');
  if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
  try {
    // Conditional create in DynamoDB: fails if key already exists
    try {
      await ddb.send(new PutCommand({
        TableName: 'idempotency', Item: { pk: key, status: 'IN_PROGRESS', ttl: ttl() },
        ConditionExpression: 'attribute_not_exists(pk)',
      }));
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') {
        const prior = await ddb.send(new GetCommand({ TableName: 'idempotency', Key: { pk: key } }));
        if (prior.Item?.status === 'COMPLETED') return res.status(200).json(prior.Item.result);
        return res.status(409).json({ error: 'in_progress' });
      }
      throw e;
    }
    const result = await payments.charge(req.body);     // the real side effect
    await ddb.send(new UpdateCommand({ TableName: 'idempotency', Key: { pk: key }, UpdateExpression: 'SET #s=:c, #r=:res', ExpressionAttributeNames: { '#s': 'status', '#r': 'result' }, ExpressionAttributeValues: { ':c': 'COMPLETED', ':res': result } }));
    res.status(201).json(result);
  } catch (e) { next(e); }
});
```

**Lead-level note:** At-least-once delivery and client retries guarantee duplicates. Idempotency keys (conditional write + TTL) are the standard fix — non-negotiable for payments/orders.

---

### Q2. How do you implement rate limiting across a scaled fleet?

**Answer.** A **Redis-backed** limiter so the count is shared across all instances (in-memory counters are per-instance and bypassable). Return **429 + `Retry-After`**.

```js
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

app.use(rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  handler: (req, res) => res.status(429).set('Retry-After', '60').json({ error: 'rate_limited' }),
  keyGenerator: (req) => req.user?.sub || req.ip,   // per-user or per-IP
}));
```

**Lead-level note:** Defense in depth — edge throttling (API Gateway usage plans / WAF rate rules) protects infrastructure/cost; app-level (Redis) enforces business/fair-use limits. Per-tenant quotas for multi-tenant APIs.

---

### Q3. What is HATEOAS and is it worth implementing?

**Answer.** HATEOAS (Hypermedia As The Engine Of Application State) means responses include **links** to related resources/actions, so clients discover navigation dynamically rather than hard-coding URLs.

```js
res.json({
  id: order.id, status: 'pending',
  _links: {
    self:   { href: `/orders/${order.id}` },
    cancel: { href: `/orders/${order.id}/cancel`, method: 'POST' },
    items:  { href: `/orders/${order.id}/items` },
  },
});
```

**Lead-level note:** It's the highest REST maturity level (Richardson Level 3) but rarely fully adopted — most teams find the coupling/cost not worth it for internal/first-party clients. Worth knowing and discussing the trade-off; implement selectively (e.g., next-action links in workflows).

---

### Q4. How do you secure a REST API end to end?

**Answer.** Layered controls:
- **HTTPS/TLS** everywhere; HSTS.
- **AuthN** (JWT/OAuth, verified signature/iss/aud/exp) + **AuthZ** (roles + object-level checks → no IDOR).
- **Input validation** (schema) + output encoding; parameterized queries (no injection).
- **Security headers** via `helmet`; strict **CORS** allow-list.
- **Rate limiting** + request size limits (DoS).
- **Secrets** in Secrets Manager/SSM; **WAF/Shield** at the edge.

```js
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ /* redis */ }));
// + authenticate + authorize + validate on routes
```

**Lead-level note:** Map controls to the **OWASP API Top 10** (broken object-level auth, broken authentication, excessive data exposure, etc.). Bake security into shared middleware + CI scanning, not per-developer effort.

---

### Q5. How do you scale a REST API on AWS?

**Answer.** Keep it **stateless**, then scale horizontally:
- **Compute:** Express on **ECS Fargate** (autoscaled on requests-per-target) for steady traffic, or **Lambda** behind API Gateway for spiky.
- **Edge:** **CloudFront** (cache cacheable GETs) + **WAF**.
- **State:** sessions → JWT/ElastiCache; data → RDS (RDS Proxy)/DynamoDB; files → S3.
- **Async:** offload slow work to **SQS** + workers (202 Accepted).

```
Client -> CloudFront(+WAF) -> ALB -> [Fargate Express x N]  ->  RDS/DynamoDB/ElastiCache
                                                            ->  SQS -> workers (async jobs)
```

**Lead-level note:** Statelessness is the prerequisite for horizontal scaling. Choose Lambda vs Fargate by traffic shape; with Lambda + relational DB use **RDS Proxy**.

---

### Q6. How do you make a REST API resilient (timeouts, retries, circuit breakers)?

**Answer.** For every downstream call: **timeout + retry (backoff/jitter) + circuit breaker**, plus idempotency and graceful degradation.

```js
const CircuitBreaker = require('opossum');
const callPricing = (id) => fetch(`${PRICING}/p/${id}`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
const breaker = new CircuitBreaker(callPricing, { timeout: 3000, errorThresholdPercentage: 50, resetTimeout: 10_000 });
breaker.fallback(() => ({ price: null, degraded: true }));   // serve degraded data

app.get('/products/:id', async (req, res, next) => {
  try { res.json({ ...await svc.find(req.params.id), pricing: await breaker.fire(req.params.id) }); }
  catch (e) { next(e); }
});
```

**Lead-level note:** A slow downstream can exhaust the event loop and cascade — fail fast and degrade. Pair with health checks, DLQs (for async), and graceful shutdown.

---

### Q7. How do you handle partial responses / field selection to reduce payload size?

**Answer.** Support a `fields` (sparse fieldset) and/or `expand` query param so clients fetch only what they need.

```js
app.get('/users/:id', async (req, res) => {
  const user = await svc.find(req.params.id);
  if (req.query.fields) {
    const keep = req.query.fields.split(',');
    return res.json(Object.fromEntries(Object.entries(user).filter(([k]) => keep.includes(k))));
  }
  res.json(user);
});
```

**Lead-level note:** This mitigates REST's over-fetching for bandwidth-sensitive (mobile) clients without going full GraphQL. Combine with a **BFF** when client needs diverge significantly.

---

### Q8. How do you deploy an Express REST API to AWS (Lambda vs Fargate)?

**Answer.** Two common paths:

```js
// Lambda (spiky/low-baseline): wrap Express, cache across warm invocations
const serverlessExpress = require('@codegenie/serverless-express');
let server;
exports.handler = (event, context) => {
  server = server || serverlessExpress({ app });   // built once, reused warm
  return server(event, context);
};
```
- **Lambda + API Gateway:** scales to zero, pay-per-use; mind cold starts + **RDS Proxy** for relational DBs.
- **Fargate + ALB:** steady/long-running; container image, autoscaling, graceful shutdown.

**Lead-level note:** Choose by **traffic shape**: spiky/event-driven → Lambda; steady/high-RPS or WebSockets → Fargate. Front both with CloudFront + WAF.

---

### Q9. How do you ensure backward compatibility when evolving an API?

**Answer.** Evolve **additively** within a version: add optional fields/endpoints, never remove/rename or change types in place. Use versioning for breaking changes + a deprecation policy.

- ✅ Add a new optional field, a new endpoint, a new enum value (if clients tolerate unknowns).
- ❌ Remove/rename a field, change a type, make an optional field required, change status-code semantics.

**Lead-level note:** Pair with **consumer-driven contract tests** (Pact) to catch breaking changes in CI before they hit clients. Communicate deprecations with timelines and `Deprecation`/`Sunset` headers.

---

### Q10. How do you observe and monitor a REST API in production?

**Answer.**
- **Structured logging** (pino) with a **correlation/request id** per request (via `AsyncLocalStorage`).
- **Metrics:** RED (Rate, Errors, Duration) — track latency **percentiles** (p95/p99), error rate, throughput → CloudWatch (EMF).
- **Tracing:** OpenTelemetry → X-Ray to see cross-service latency.
- **Alerts** on SLO burn (error rate / p99 latency), not every blip.

```js
const pinoHttp = require('pino-http');
app.use(pinoHttp({ genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID() }));
```

**Lead-level note:** Build observability in from day one. p99 latency + error rate are the user-facing SLIs; correlation ids tie logs/traces together for fast incident diagnosis.

---

### Q11. REST vs GraphQL vs gRPC — when would you choose each?

**Answer.**
- **REST** — resource CRUD, broad client support, cache-friendly (HTTP caching/CDN), public APIs. Downsides: over/under-fetching, many round trips.
- **GraphQL** — clients need flexible, exact data shapes; aggregates many resources in one query (great for varied frontends/BFF). Downsides: caching is harder, N+1, query-cost control.
- **gRPC** — high-performance **internal** service-to-service (binary protobuf over HTTP/2, streaming). Downsides: not browser-native, less human-readable.

**Lead-level note:** Often **hybrid**: REST/GraphQL at the edge for clients, gRPC between internal services. Choose by consumer (public vs internal), data-shape variability, performance, and caching needs.

---

### Q12. How do you test a REST API?

**Answer.** Pyramid: unit (services/handlers with mocks), integration (against a test DB), and **e2e/API tests** with `supertest`.

```js
const request = require('supertest');
describe('POST /users', () => {
  it('creates a user', async () => {
    const res = await request(app).post('/users').send({ email: 'a@b.com', age: 30 }).expect(201);
    expect(res.body).toHaveProperty('id');
  });
  it('rejects invalid input', () => request(app).post('/users').send({ email: 'nope' }).expect(422));
});
```

**Lead-level note:** Add **contract tests** between services, test error paths + status codes (not just happy path), and gate CI on coverage. e2e validates the whole middleware pipeline (auth/validation/serialization).
