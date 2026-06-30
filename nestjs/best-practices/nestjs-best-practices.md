# NestJS Best Practices (Lead Level)

Production practices a lead is expected to enforce. Grouped by concern. These are the "what good looks like" answers that separate seniors from juniors.

---

## Architecture & structure
- **Organize by feature/domain**, not technical layer. Each feature module owns its controllers, services, DTOs, and entities.
- **Keep controllers thin** — HTTP concerns + delegation only. Business logic lives in services.
- **Encapsulate** with modules; export only what other modules need. Tight `exports` keep boundaries clean and enable future microservice extraction.
- **Start with a modular monolith.** Split into microservices only when team size/scaling/independent deployability justify the operational cost.
- **Program to abstractions** — inject interface tokens (`@Inject(TOKEN)`) so implementations are swappable (S3 in prod, fake in tests).
- Avoid **circular dependencies** — they signal wrong boundaries; fix the design rather than leaning on `forwardRef`.

## Dependency Injection
- **Default to singleton scope.** Never store per-request state in a singleton.
- **Avoid `Scope.REQUEST`** unless truly needed — use **`AsyncLocalStorage`** for request context (correlation/tenant) instead (no per-request instantiation cost).
- Use **`useFactory` + `inject`** for async/configurable resources (DB pools, SDK clients); resolve secrets at runtime.
- Register **global** cross-cutting providers via `APP_GUARD`/`APP_PIPE`/`APP_INTERCEPTOR`/`APP_FILTER` tokens so they can use DI.

## Validation & serialization
- Enable a **global `ValidationPipe`** with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- Treat validation as a **security control** (whitelist prevents mass-assignment).
- Use `ClassSerializerInterceptor` + `@Exclude()` so sensitive fields (`passwordHash`, tokens) never leak in responses.
- Validate **config at boot** (Joi/zod schema) and fail fast.

## Request lifecycle usage
- **Auth → guards** (so they run after route matching and read `@Roles()` metadata), not middleware.
- **Validation/transformation → pipes.**
- **Response shaping, caching, timing → interceptors.**
- **Consistent error handling → a global exception filter** (never leak stack traces/internal messages on 5xx).
- **Correlation ID → middleware + AsyncLocalStorage**, included on every log line and propagated downstream.

## Security
- Offload **coarse auth at the edge** (API Gateway/Cognito/ALB + WAF); keep fine-grained, resource-level checks in guards.
- **Verify JWTs** properly (RS256 via JWKS, check iss/aud/exp, reject `alg:none`); short-lived access tokens + refresh.
- Use **helmet**, CORS config, and rate limiting (`@nestjs/throttler` with Redis).
- **Secrets** in Secrets Manager/SSM, fetched at runtime via IAM role — never committed or baked into images.
- Enforce **object-level authorization** (prevent IDOR) — don't trust IDs from the client.

## Data & transactions
- Keep **transaction boundaries at the service layer** (one business operation = one transaction).
- From **Lambda**, front RDS with **RDS Proxy** to avoid connection exhaustion.
- Across services, transactions don't span — use **sagas + transactional outbox** and accept eventual consistency.
- Use **migrations** (expand/contract, backward-compatible) so old and new versions coexist during deploys.

## Performance
- Use the **Fastify adapter** for high-throughput services where Express features aren't needed.
- **Cache** hot reads in Redis (shared across the fleet); guard against cache stampede (jittered TTL, single-flight lock).
- Reuse **connection pools** and **AWS SDK clients** (instantiate once).
- Fix **N+1** in GraphQL with DataLoader; add query depth/complexity limits.
- **Stream** large payloads; paginate; compress; profile before optimizing.

## Background work & scheduling
- **Never run `@Cron` across a multi-instance fleet** without coordination — it fires on every instance. Use a single dedicated scheduler, a distributed lock, or **EventBridge Scheduler**.
- Use **queues (BullMQ/SQS)** for durable, retryable jobs; make handlers **idempotent**; add **DLQs**.

## Resilience
- Apply the triad on outbound calls: **timeout + retry (backoff + jitter) + circuit breaker** (opossum).
- **Idempotency keys** for unsafe/retryable operations.
- Treat `unhandledRejection`/`uncaughtException` as **fatal** → log, then graceful shutdown + restart (don't continue in an unknown state).

## Observability
- **Structured JSON logging** (pino / `nestjs-pino`) with correlation IDs; redact secrets; deliberate log levels.
- **Metrics** (RED for services + USE for resources; Node event-loop lag, GC) via CloudWatch EMF or Prometheus.
- **Distributed tracing** with OpenTelemetry → X-Ray/APM; propagate trace context into SQS attributes.
- **Health checks** via `@nestjs/terminus` — separate liveness (restart) from readiness (route), keep dependency checks tolerant.

## Deployment & lifecycle
- **`app.enableShutdownHooks()`** + graceful shutdown (drain, close pools) for **zero-downtime deploys**, paired with ALB deregistration delay + readiness probe.
- **Small multi-stage Docker images**, non-root user, `npm ci --omit=dev`, image scanning; `--max-old-space-size` ~75–80% of container memory.
- **Fargate** for steady/long-running APIs and WebSockets; **Lambda** for spiky/event-driven (mind cold starts + RDS Proxy).
- **IaC** (CDK in TypeScript pairs naturally with a Nest/TS team); no click-ops in prod.

## Testing
- Follow the **pyramid:** many unit tests (mock deps via DI), some integration (disposable DB), few e2e (supertest).
- Use `overrideProvider`/`overrideGuard` to isolate; **contract tests** (Pact) between microservices.
- Enforce **CI gates** (coverage thresholds, no flaky e2e in the critical path).

## API design
- **Version** the API (URI/header) and keep backward compatibility; deprecate with a timeline.
- Generate **OpenAPI** with `@nestjs/swagger` (single source of truth → client SDKs, contract tests).
- Consistent **error shape**, pagination conventions, and **idempotency keys** for unsafe operations.
