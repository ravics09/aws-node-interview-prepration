# NestJS Advanced Topics — Interview Questions

[← Back to index](./README.md)

---

### Q1. How does NestJS support microservices, and what transports are available?

**Answer.** Nest has a dedicated microservices layer (`@nestjs/microservices`) where a service handles **messages** over a transport instead of HTTP. Built-in transports: **TCP, Redis, NATS, MQTT, RabbitMQ, Kafka, gRPC** (and you can build custom ones, e.g., SQS/SNS).

Two message patterns:
- **`@MessagePattern`** — request/response (RPC-style).
- **`@EventPattern`** — fire-and-forget events.

```ts
@Controller()
export class OrdersController {
  @MessagePattern({ cmd: 'get_order' })          // request/response
  getOrder(@Payload() id: string) { return this.svc.find(id); }

  @EventPattern('order_placed')                   // event (no response)
  handleOrderPlaced(@Payload() order: any) { this.svc.react(order); }
}
```

**Lead-level note:** On AWS, async/event-driven (SNS/SQS/EventBridge/Kafka-MSK) is usually preferable to sync RPC between services; use gRPC/HTTP for low-latency internal request/response. Don't jump to microservices prematurely — a modular monolith is often better first.

---

### Q2. How do you build GraphQL APIs in NestJS, and what's the N+1 concern?

**Answer.** Use `@nestjs/graphql` with either **code-first** (TypeScript classes + decorators generate the schema) or **schema-first** (SDL drives types). Resolvers (`@Resolver`, `@Query`, `@Mutation`, `@ResolveField`) replace controllers for GraphQL.

```ts
@Resolver(() => User)
export class UserResolver {
  @Query(() => User) user(@Args('id') id: string) { return this.users.findOne(id); }
  @ResolveField() orders(@Parent() user: User) { return this.orders.forUser(user.id); }
}
```

The **N+1 problem**: resolving a list of users and then each user's orders fires one query per user. Fix with **DataLoader** (batches + caches per request). Also add **query depth/complexity limits** to prevent abuse.

**Lead-level note:** N+1 + DataLoader is the classic GraphQL interview point. Mention complexity limits as a security/perf control.

---

### Q3. How do you implement WebSockets in NestJS, and how do they scale?

**Answer.** Use a **gateway** (`@WebSocketGateway`) with `@SubscribeMessage` handlers (Socket.IO or `ws`).

```ts
@WebSocketGateway()
export class ChatGateway {
  @WebSocketServer() server: Server;
  @SubscribeMessage('message')
  onMessage(@MessageBody() data: string) { this.server.emit('message', data); }
}
```

**Scaling concern:** WebSocket connections are **stateful and sticky** — a connection lives on one instance. With multiple instances, a message from a client on instance A must reach a client on instance B. Solve with a **Redis pub/sub adapter** (backplane) so any instance can broadcast to all, or offload to **API Gateway WebSocket APIs** at large scale.

**Lead-level note:** Stateful protocols fight stateless horizontal scaling — name the backplane requirement (`@socket.io/redis-adapter` + ElastiCache) and the managed alternative.

---

### Q4. How do you manage configuration and validate it at startup?

**Answer.** `@nestjs/config` with environment variables and a validation schema (Joi/zod), typically global, with typed access via `ConfigService`.

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({ DATABASE_URL: Joi.string().uri().required(), PORT: Joi.number().default(3000) }),
});
```

**Lead-level note:** Validate at boot → **fail fast** on misconfig. Pull secrets at runtime (Secrets Manager/SSM), never commit them; cache and refresh on rotation.

---

### Q5. Explain NestJS lifecycle hooks and graceful shutdown.

**Answer.** Hooks let you run code at init/shutdown:
- `onModuleInit`, `onApplicationBootstrap` (startup)
- `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown` (shutdown — require `app.enableShutdownHooks()`)

```ts
@Injectable()
export class Consumer implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    await this.stopPollingAndDrain(); // finish in-flight work on SIGTERM
  }
}
```

**Lead-level note:** On ECS/Lambda, SIGTERM triggers these hooks (with `enableShutdownHooks()`), enabling graceful shutdown: stop accepting work, drain in-flight, close pools — essential for zero-downtime deploys.

---

### Q6. How do you implement caching in NestJS?

**Answer.** Use `CacheModule` with a store (in-memory or **Redis** via `cache-manager-ioredis`). Apply via `CacheInterceptor` (auto-cache GET routes) or inject the cache manager for explicit control.

```ts
CacheModule.registerAsync({ isGlobal: true, useFactory: () => ({ store: redisStore, ttl: 60 }) });

@Injectable()
export class ProductService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}
  async get(id: string) {
    const hit = await this.cache.get(`p:${id}`);
    if (hit) return hit;
    const p = await this.repo.find(id);
    await this.cache.set(`p:${id}`, p, 60);
    return p;
  }
}
```

**Lead-level note:** Use **Redis** (shared) not in-memory for multi-instance consistency; always set TTL + invalidation; guard against **cache stampede** (jittered TTL, single-flight lock).

---

### Q7. How do you run background jobs and scheduled tasks?

**Answer.**
- **Scheduling:** `@nestjs/schedule` with `@Cron`, `@Interval`, `@Timeout`.
- **Queues:** `@nestjs/bull` / BullMQ (Redis-backed) for durable, retryable jobs with backoff and DLQs; workers scale independently.

```ts
@Injectable()
export class Tasks {
  @Cron('0 2 * * *') nightly() { /* runs at 02:00 */ }
}
```

**Lead-level note (critical):** In a **multi-instance** deployment, `@Cron` fires on **every instance** → duplicate execution. Use a single dedicated scheduler, a distributed lock, or **EventBridge Scheduler** → trigger. Separate **scheduling** from **execution**; make jobs idempotent.

---

### Q8. How do you do database access and transactions in NestJS?

**Answer.** Via an ORM module (TypeORM, Prisma, MikroORM, Sequelize). Keep data access in repositories/services; wrap multi-step writes in a transaction.

```ts
// TypeORM transaction
await this.dataSource.transaction(async (manager) => {
  await manager.save(order);
  await manager.decrement(Inventory, { sku }, 'qty', 1); // atomic, all-or-nothing
});
```

**Lead-level note:** Keep transaction boundaries at the **service layer** (one business op = one transaction). From Lambda, front RDS with **RDS Proxy** to avoid connection exhaustion. Across services, transactions don't span — use **sagas/outbox**.

---

### Q9. How do you generate API documentation?

**Answer.** `@nestjs/swagger` generates an OpenAPI spec from decorators/DTOs.

```ts
const config = new DocumentBuilder().setTitle('API').setVersion('1.0').addBearerAuth().build();
SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
// Decorate DTOs with @ApiProperty(); endpoints with @ApiOkResponse(), etc.
```

**Lead-level note:** Generated OpenAPI is a single source of truth → client SDK generation, contract tests, and feeding API Gateway. As a lead you enforce versioning and a deprecation policy.

---

### Q10. How do you implement rate limiting in NestJS?

**Answer.** `@nestjs/throttler`, backed by **Redis** for a shared limit across instances.

```ts
ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }); // 100 req/min
// @UseGuards(ThrottlerGuard) globally; @SkipThrottle()/@Throttle() to tune per route
```

**Lead-level note:** In-memory counters are per-instance and bypassable — use a Redis storage provider so limits are global. Combine with **edge throttling** (API Gateway/WAF) for defense in depth.
