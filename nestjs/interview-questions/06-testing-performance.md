# NestJS Testing, Performance & Deployment — Interview Questions

[← Back to index](./README.md)

---

### Q1. How do you unit test a NestJS provider?

**Answer.** Use the `Test.createTestingModule` utility and override dependencies with mocks (DI makes this clean).

```ts
const moduleRef = await Test.createTestingModule({
  providers: [
    OrdersService,
    { provide: PaymentsService, useValue: { charge: jest.fn().mockResolvedValue({ id: 'p1' }) } },
  ],
}).compile();

const service = moduleRef.get(OrdersService);
// test service in isolation; PaymentsService is mocked
```

**Lead-level note:** The payoff of DI — fast, isolated tests with no real network/DB. Use `overrideProvider(X).useValue(mock)` to swap deps in larger modules.

---

### Q2. How do you write end-to-end (e2e) tests?

**Answer.** Bootstrap the full app (or module) and hit it with `supertest`, validating the whole pipeline (pipes/guards/serialization).

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = moduleRef.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
await app.init();

await request(app.getHttpServer())
  .post('/users')
  .send({ email: 'a@b.com', age: 30 })
  .expect(201);

await app.close();
```

**Lead-level note:** e2e tests catch wiring/validation/serialization bugs unit tests miss. Use a disposable DB (Testcontainers/local) for integration-level coverage.

---

### Q3. What's your testing strategy/pyramid for a NestJS service?

**Answer.**
- **Unit (most):** services/guards/pipes in isolation with mocked deps — fast.
- **Integration (some):** real repositories against a disposable DB to catch query/mapping bugs.
- **E2E (few):** HTTP-level via supertest for critical flows.

**Lead-level note:** As a lead you define CI gates (coverage thresholds, no flaky e2e in the critical path) and emphasize **contract tests** (Pact) between microservices. DI is what makes the pyramid practical.

---

### Q4. How do you override guards/dependencies in tests?

**Answer.** Use the testing module's override methods:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }) // bypass auth in tests
  .overrideProvider(MailService).useValue({ send: jest.fn() })
  .compile();
```

**Lead-level note:** Overriding the auth guard lets you e2e-test protected routes without real tokens; overriding side-effecting providers (mail/payments) keeps tests deterministic.

---

### Q5. How do you improve NestJS application performance?

**Answer.**
- **Use the Fastify adapter** for higher throughput where appropriate.
- **Caching** (Redis) for hot reads; CDN for cacheable responses.
- **Avoid `Scope.REQUEST`** unless necessary (it re-instantiates the provider tree per request).
- **Connection pooling** (DB) and reusing HTTP/AWS SDK clients.
- **Stream** large payloads; paginate; avoid N+1 (DataLoader for GraphQL).
- **Compression** and keep-alive.
- **Profile** before optimizing (clinic.js, flamegraphs).

**Lead-level note:** The biggest Nest-specific footgun is overusing request-scoped providers — they add per-request instantiation cost and "bubble" the scope up the dependency chain.

---

### Q6. What's the performance impact of request-scoped providers?

**Answer.** A `Scope.REQUEST` provider (and anything that depends on it) is **re-instantiated on every request**, adding CPU/GC overhead and preventing some optimizations. The whole injection sub-tree above it becomes request-scoped too ("scope bubbling").

**Lead-level note:** Prefer **`AsyncLocalStorage`** for per-request context (correlation ID, tenant) instead of request-scoped providers — same benefit without the performance penalty.

---

### Q7. How do you deploy a NestJS app to AWS, and what are the options?

**Answer.**
- **Containers (common):** build a small multi-stage Docker image → **ECR** → run on **ECS Fargate** behind an ALB with autoscaling; or EKS.
- **Serverless:** wrap the Nest app with a Lambda adapter (`@codegenie/serverless-express`/`aws-lambda-fastify`) behind API Gateway — good for spiky/low traffic (mind cold starts + RDS connections).

```ts
// Lambda entry (cached across warm invocations)
let cachedServer: Handler;
export const handler = async (event, context) => {
  if (!cachedServer) {
    const app = await NestFactory.create(AppModule);
    await app.init();
    cachedServer = serverlessExpress({ app: app.getHttpAdapter().getInstance() });
  }
  return cachedServer(event, context);
};
```

**Lead-level note:** Fargate for steady/long-running APIs and WebSockets; Lambda for spiky/event-driven. With Lambda + relational DB use **RDS Proxy**.

---

### Q8. How do you implement graceful shutdown for zero-downtime deploys?

**Answer.** Enable shutdown hooks and drain on SIGTERM.

```ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();   // lifecycle hooks fire on SIGTERM/SIGINT
await app.listen(3000);

@Injectable()
export class Db implements OnApplicationShutdown {
  async onApplicationShutdown() { await this.pool.end(); } // close connections
}
```
Pair with ALB **deregistration delay** + a readiness probe that flips to 503 on shutdown.

**Lead-level note:** Graceful shutdown + connection draining + backward-compatible (expand/contract) DB migrations = zero-downtime deploys.

---

### Q9. How do you add observability (logging, metrics, tracing) to NestJS?

**Answer.**
- **Logging:** replace the default logger with **pino** (`nestjs-pino`) for fast structured JSON logs; include a correlation ID via middleware + `AsyncLocalStorage`.
- **Metrics:** custom metrics to CloudWatch (EMF) or Prometheus; expose RED metrics.
- **Tracing:** OpenTelemetry auto-instrumentation → X-Ray/Jaeger; a logging interceptor for request timing.
- **Health:** `@nestjs/terminus` for liveness/readiness probes.

**Lead-level note:** Build observability in from day one — structured logs + correlation IDs + tracing + health checks are what make production debugging tractable.

---

### Q10. How do you handle errors and ensure resilience in a NestJS service?

**Answer.**
- **Exception filters** for consistent error responses + logging (don't leak internals on 5xx).
- **Validation pipe** to reject bad input early.
- **Timeouts + retries (backoff/jitter) + circuit breaker** (opossum) on outbound calls.
- **Idempotency** for unsafe operations (idempotency key).
- Treat `unhandledRejection`/`uncaughtException` as fatal → log, then graceful shutdown + restart.

**Lead-level note:** Resilience is a system property — pair Nest's filters/pipes with the resilience triad (timeout/retry/circuit-breaker) and idempotency, plus DLQs for queue consumers.
