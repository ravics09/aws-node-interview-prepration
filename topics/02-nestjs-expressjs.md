# 2. NestJS & Express.js Architecture (Q16–Q30)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Prev:** [← 1. Node.js Runtime](./01-nodejs-runtime-performance.md) · **Next:** [3. AWS Compute & Serverless →](./03-aws-compute-serverless.md)

---

## 2. NestJS & Express.js Architecture

### Q16. How does Dependency Injection work in NestJS, and why is it valuable at scale?

**Short answer:** NestJS has an IoC container that instantiates providers and injects them based on tokens/types, enabling loose coupling, testability, and swappable implementations.

**Detailed answer:**
You declare a class as `@Injectable()`, register it in a module's `providers`, and Nest resolves the dependency graph at bootstrap. Injection is by **token** — usually the class type, but you can use string/symbol tokens for interfaces and custom providers (`useClass`, `useValue`, `useFactory`, `useExisting`).

Benefits at scale:
- **Testability:** swap a real `PaymentService` for a mock in unit tests without touching consumers.
- **Decoupling:** depend on an abstraction (e.g., a `StorageService` token) and bind it to `S3StorageService` in prod, `LocalStorageService` in dev.
- **Lifecycle management:** Nest controls singleton/request/transient scope.

**Real-time use case:** A `NotificationService` interface bound to `SnsNotificationService` in production and an in-memory fake in tests; switching providers is a one-line module change.

**Lead-level insight:** Default scope is **singleton** — shared across requests. Be careful storing request state in singletons. Use `Scope.REQUEST` only when necessary (it has a performance cost because Nest re-instantiates the provider chain per request).

---

### Q17. Explain NestJS modules and how you structure a large application.

**Short answer:** Modules encapsulate related providers/controllers; structure by feature (domain) modules with a shared/core module, exposing only what's needed via `exports`.

**Detailed answer:**
- **Feature modules:** one per bounded context (Users, Orders, Billing), each with its controllers, services, and entities.
- **Shared module:** common providers/pipes used across features (re-exported).
- **Core module:** singletons that should exist once (config, logging, DB connection), imported only by the root module.
- **Encapsulation:** providers are private to their module unless `exports`ed. This enforces boundaries and prevents spaghetti dependencies.

**Lead-level insight:** This modular boundary is exactly what makes a future extraction into **microservices** feasible — a well-encapsulated feature module maps cleanly to a service. Mention dynamic modules (`forRoot`/`forRootAsync`) for configurable, reusable modules (e.g., a `DatabaseModule.forRootAsync()`).

---

### Q18. Compare NestJS interceptors, guards, pipes, middleware, and exception filters. When do you use each?

**Short answer:** They're ordered cross-cutting concerns: middleware (raw req/res) → guards (authz) → pipes (validation/transform) → handler → interceptors (wrap response/timing) → exception filters (error mapping).

**Detailed answer:**
- **Middleware:** runs before the route handler, has access to raw `req/res`; good for logging, request-id, body parsing, helmet.
- **Guards:** return boolean to allow/deny; ideal for **authentication/authorization** (e.g., JWT/role checks via `CanActivate`).
- **Pipes:** transform and **validate** input (`ValidationPipe` + class-validator DTOs); throw on invalid.
- **Interceptors:** wrap the handler — transform responses, add caching, measure latency, map RxJS streams.
- **Exception filters:** catch thrown exceptions and produce consistent error responses + logging.

**Lead-level insight:** Knowing the *execution order* and choosing the right primitive shows architectural maturity. E.g., auth belongs in a guard (not middleware) so it integrates with Nest's metadata/`@Roles()` decorators and runs after route matching.

---

### Q19. How do you validate and transform incoming data robustly in NestJS?

**Short answer:** DTOs + `class-validator`/`class-transformer` with a global `ValidationPipe` configured to whitelist, forbid unknown fields, and transform types.

**Detailed answer:**
```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,            // strip unknown props
  forbidNonWhitelisted: true, // 400 on unknown props
  transform: true,            // auto-convert payloads to DTO instances
  transformOptions: { enableImplicitConversion: true },
}));
```
DTOs use decorators (`@IsEmail()`, `@IsInt()`, `@Min()`, nested `@ValidateNested()` + `@Type()`). This centralizes validation, gives consistent 400s, and prevents mass-assignment by whitelisting.

**Lead-level insight:** Validation is also a **security control** (input sanitization, mass-assignment prevention). Pair with output serialization (`ClassSerializerInterceptor` + `@Exclude()`) so you never leak fields like `passwordHash`.

---

### Q20. How would you build a microservices architecture with NestJS, and what transports would you use?

**Short answer:** Use Nest's microservices layer with a message transport (SQS/SNS, Kafka, NATS, RabbitMQ, gRPC), keep services independently deployable, and communicate async where possible.

**Detailed answer:**
NestJS supports a microservices model where a service is a message handler over a transport. On AWS:
- **Async/event-driven:** SNS+SQS for pub/sub + durable queues, or EventBridge for event routing, or Kafka (MSK) for high-throughput streams.
- **Sync request/response:** gRPC or HTTP for low-latency internal calls; API Gateway/ALB at the edge.

Patterns: API gateway service for the edge, domain services behind it, a shared contracts/events package, and a saga/outbox pattern for distributed transactions.

**Lead-level insight:** Don't jump to microservices prematurely. A **modular monolith** in NestJS (Q17) often serves better until scale/team boundaries justify the operational cost of distributed systems (network failures, eventual consistency, distributed tracing). Mention the outbox pattern to avoid dual-write inconsistency between DB and message bus.

---

### Q21. Express vs NestJS — when would you choose one over the other as a lead?

**Short answer:** Express for tiny/edge services and maximum flexibility; NestJS for larger teams/apps needing structure, DI, TypeScript-first patterns, and built-in support for testing, validation, and microservices.

**Detailed answer:**
- **Express:** minimal, unopinionated, huge ecosystem. Great for a Lambda handler, a small proxy, or when you want full control. Downside: every team invents its own structure → inconsistency at scale.
- **NestJS:** opinionated, modular, DI, decorators, first-class TypeScript, built-in support for guards/pipes/interceptors, GraphQL, WebSockets, microservices, and testing. It runs *on top of* Express (or Fastify) so you keep the ecosystem.

**Lead-level insight:** As a lead, consistency and onboarding speed matter. NestJS's conventions reduce bikeshedding and make a 20-person codebase navigable. For a single Lambda, NestJS may be overkill — choose per context, not dogma. You can also switch Nest's HTTP adapter to **Fastify** for higher throughput.

---

### Q22. How do you implement authentication and authorization in NestJS?

**Short answer:** Authentication via Passport strategies (JWT/OAuth) wired into guards; authorization via role/permission guards and decorators, ideally backed by a central identity provider like Amazon Cognito.

**Detailed answer:**
- **AuthN:** `@nestjs/passport` with a `JwtStrategy` validating tokens (e.g., Cognito-issued JWTs verified against the JWKS endpoint). An `AuthGuard('jwt')` protects routes.
- **AuthZ:** `@Roles('admin')` decorator + a `RolesGuard` reading metadata via `Reflector`; for fine-grained, use a permissions/ABAC model (e.g., CASL).
- **Token handling:** short-lived access tokens + refresh tokens; validate signature, issuer, audience, expiry.

**Real-time use case:** Cognito issues JWTs; the NestJS guard verifies them and maps Cognito groups to roles. API Gateway can also do a first-line JWT/Cognito authorizer before traffic even reaches the app.

**Lead-level insight:** Push coarse auth to the edge (API Gateway/ALB + Cognito/WAF) and keep fine-grained, resource-level checks in the app. Never trust client-side role claims without server verification.

---

### Q23. How do you structure testing in a NestJS application?

**Short answer:** Unit tests with the Nest `TestingModule` and mocked providers, integration tests against real modules + test DB, and e2e tests via `supertest` against the HTTP layer.

**Detailed answer:**
- **Unit:** `Test.createTestingModule({...})` with `overrideProvider` to inject mocks; test services/guards in isolation.
- **Integration:** spin up real repositories against a disposable DB (Testcontainers / local Postgres) to catch query/mapping bugs.
- **E2E:** bootstrap the app with `supertest` to hit endpoints, validating pipes/guards/serialization end to end.

**Lead-level insight:** As a lead, define the **testing pyramid** and CI gates (coverage thresholds, no flaky e2e in the critical path). DI (Q16) is what makes mocking clean — emphasize that good architecture *enables* testing. Mention contract testing (Pact) for microservices.

---

### Q24. How do you handle database access and transactions in NestJS (TypeORM/Prisma)?

**Short answer:** Use a repository/ORM layer (TypeORM, Prisma, Drizzle), keep data access in providers, and manage transactions explicitly with a query runner / `$transaction`, ensuring atomicity across multiple writes.

**Detailed answer:**
- **ORM choice:** Prisma (type-safe, great DX), TypeORM (mature, decorator entities), or query builders (Drizzle/Knex) for control.
- **Transactions:** wrap multi-step writes in a transaction so partial failures roll back. With TypeORM, use a `QueryRunner` or `dataSource.transaction()`; with Prisma, `$transaction([...])` or interactive transactions.
- **Connection pooling:** configure pool size to match DB max connections / instance count (critical with Lambda + RDS — see Q63 RDS Proxy).

**Lead-level insight:** Keep transaction boundaries at the service layer (one business operation = one transaction). For cross-service consistency, transactions don't span services — use sagas/outbox. Watch connection-pool exhaustion when many containers each hold a pool against one RDS instance.

---

### Q25. How do you implement caching in NestJS for performance?

**Short answer:** Use the Nest `CacheModule` with a Redis (ElastiCache) store, cache at the right layer (per-request, per-resource, or computed results), and always set TTLs + an invalidation strategy.

**Detailed answer:**
- **CacheModule + cache-manager** with `ioredis`/Redis store for a shared cache across instances.
- **What to cache:** expensive reads, third-party API responses, computed aggregates, session/feature flags.
- **Patterns:** cache-aside (read-through with manual population), `@CacheInterceptor` for GET endpoints, or explicit `cache.get/set`.
- **Invalidation:** TTL-based + event-driven busting on writes. The hard problem is consistency — choose TTL length by how stale data can be.

**Lead-level insight:** Local in-memory cache is per-instance (inconsistent across a fleet); use Redis for shared state. Beware **cache stampede** — use locks, jittered TTLs, or request coalescing. Articulate the cache invalidation strategy, since that's the real interview signal.

---

### Q26. How do you build GraphQL or WebSocket features in NestJS, and what are the scaling concerns?

**Short answer:** NestJS has first-class `@nestjs/graphql` (code-first/schema-first) and WebSocket gateways; the scaling concern is stateful connections and N+1 queries.

**Detailed answer:**
- **GraphQL:** code-first with decorators or schema-first. Watch the **N+1 problem** — use DataLoader for batching. Add query complexity/depth limits to prevent abuse.
- **WebSockets:** `@WebSocketGateway` (Socket.IO/ws). Connections are **stateful and sticky**, which complicates horizontal scaling — you need a shared backplane (Redis adapter) so messages reach clients on any instance, and sticky sessions / `IP hash` at the LB or a connection-aware design.

**Real-time use case:** A live dashboard: WebSocket gateway with a Redis pub/sub adapter so any ECS task can broadcast to all connected clients regardless of which task holds the socket. For massive scale, consider **API Gateway WebSocket APIs** + Lambda to offload connection management.

**Lead-level insight:** Stateful protocols fight stateless scaling. Name the backplane requirement and the option to push connection state to a managed service (API Gateway WebSockets / AppSync subscriptions).

---

### Q27. How do you implement rate limiting and throttling in a NestJS/Express API?

**Short answer:** Use `@nestjs/throttler` (or express-rate-limit) backed by Redis for a shared counter across instances, plus edge throttling at API Gateway/WAF.

**Detailed answer:**
- **App level:** `ThrottlerModule` with a Redis storage provider so limits are enforced across the whole fleet (in-memory counters are per-instance and easily bypassed). Configure per-route limits and key by user/IP/API key.
- **Edge level:** API Gateway usage plans + throttling, or AWS WAF rate-based rules, stop abuse before it hits your compute.
- **Algorithms:** token bucket / sliding window. Return `429` with `Retry-After`.

**Lead-level insight:** Defense in depth — edge throttling protects infrastructure and cost; app throttling enforces business/fair-use limits. Mention distinguishing per-tenant quotas in multi-tenant systems.

---

### Q28. How do you handle background jobs and scheduled tasks in NestJS?

**Short answer:** Use `@nestjs/schedule` for cron in-process for simple cases, and a queue (BullMQ/Redis or SQS) with dedicated worker processes for real workloads; on AWS, EventBridge Scheduler + Lambda/ECS for reliability.

**Detailed answer:**
- **In-process cron** (`@Cron`) is fine for a singleton task — but in a multi-instance fleet, *every* instance fires the cron → duplicate execution. Use a leader-election lock (Redis) or run schedulers as a single dedicated task.
- **Queues:** BullMQ (Redis) or SQS for durable, retryable jobs with backoff and DLQs. Workers scale independently.
- **AWS-native:** EventBridge Scheduler triggers Lambda/ECS tasks; serverless and no duplicate-cron problem.

**Real-time use case:** Nightly report generation: EventBridge cron → SQS → ECS worker service that scales to process the batch, then scales back to zero/min.

**Lead-level insight:** The duplicate-cron-in-a-fleet trap is a classic lead question. Always separate *scheduling* from *execution* and make jobs **idempotent** with retries + DLQ.

---

### Q29. How do you implement distributed tracing and request correlation in NestJS?

**Short answer:** Generate/propagate a correlation ID via middleware, attach it to logs and downstream calls, and integrate OpenTelemetry / AWS X-Ray for end-to-end traces.

**Detailed answer:**
- **Correlation ID:** middleware reads `X-Request-Id` (or generates one) and stores it in `AsyncLocalStorage` so every log line and outbound call includes it without threading it through every function.
- **Tracing:** OpenTelemetry SDK auto-instruments HTTP/DB/AWS SDK; export to X-Ray, Jaeger, or an APM. Spans show where latency lives across services.
- **Propagation:** pass trace headers (`traceparent`) to downstream services and into SQS message attributes.

**Lead-level insight:** `AsyncLocalStorage` is the modern, clean way to do context propagation in Node without DI gymnastics. End-to-end tracing is essential once you have microservices — it's how you answer "which hop is slow?"

---

### Q30. How do you ensure consistent API design, versioning, and documentation in a NestJS service?

**Short answer:** Enforce REST conventions, version the API (URI/header), auto-generate OpenAPI/Swagger from decorators, and treat the contract as a first-class artifact.

**Detailed answer:**
- **Versioning:** NestJS supports URI (`/v1`), header, or media-type versioning. Pick one and keep backward compatibility; deprecate with timelines.
- **Docs:** `@nestjs/swagger` generates OpenAPI from DTOs/decorators — single source of truth, usable for client generation and contract tests.
- **Consistency:** standard error shape, pagination conventions, naming, idempotency keys for unsafe operations.

**Lead-level insight:** As a lead, you own the contract discipline: backward-compatible changes, additive evolution, and a deprecation policy. Generated OpenAPI feeding into API Gateway and SDK generation keeps clients and server in sync.

---


