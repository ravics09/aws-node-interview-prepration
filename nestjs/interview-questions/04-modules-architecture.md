# NestJS Modules & Architecture — Interview Questions

[← Back to index](./README.md)

---

### Q1. How do modules enforce encapsulation in NestJS?

**Answer.** A module's providers are **private** to that module unless explicitly listed in `exports`. Other modules must `import` the module to use its exported providers. This creates clear boundaries and prevents a tangle of cross-dependencies.

```ts
@Module({
  providers: [UsersService, UsersRepository], // both private...
  exports: [UsersService],                     // ...only UsersService is public
})
export class UsersModule {}

@Module({ imports: [UsersModule] })            // OrdersModule can now inject UsersService
export class OrdersModule {}
```

**Lead-level note:** This encapsulation is exactly what makes a future **microservice extraction** feasible — a well-bounded module maps cleanly to a service.

---

### Q2. How do you structure a large NestJS application?

**Answer.** By **feature (domain) modules**, plus shared and core modules:
- **Feature modules:** one per bounded context (Users, Orders, Billing) with their own controllers/services/entities.
- **Shared module:** common reusable providers/pipes (re-exported) used across features.
- **Core module:** app-wide singletons that should exist once (config, logging, DB connection) — imported only by the root module.

```
src/
  app.module.ts
  core/        (config, logging, db — singletons)
  shared/      (reusable utils, common pipes)
  users/       (users.module.ts, controller, service, dto, entities)
  orders/
  billing/
```

**Lead-level note:** Organize by **feature, not by technical layer** (avoid global `controllers/`, `services/` folders). Feature cohesion scales better and maps to teams and future services.

---

### Q3. What's the difference between importing and providing? And `exports`?

**Answer.**
- **`providers`** — classes this module instantiates and can inject internally.
- **`exports`** — which of its providers are visible to modules that import it.
- **`imports`** — other modules whose **exported** providers this module wants to use.
- **`controllers`** — request handlers belonging to this module.

A provider not exported can't be injected elsewhere even if the module is imported.

---

### Q4. When should a module be `@Global()`?

**Answer.** When its exported providers are needed almost everywhere and re-importing the module in every feature would be noise (e.g., `ConfigService`, a logger). `@Global()` registers exports once for the whole app.

```ts
@Global()
@Module({ providers: [ConfigService], exports: [ConfigService] })
export class ConfigModule {}
```

**Lead-level note:** Use sparingly — globals hide dependencies and reduce explicitness. Good for true cross-cutting singletons; bad for feature providers.

---

### Q5. What are dynamic modules and why are they important for reusable libraries?

**Answer.** Dynamic modules return their configuration at runtime (via `forRoot`/`forRootAsync`/`register`), letting a single module be reused with different config.

```ts
@Module({})
export class CacheModule {
  static register(opts: CacheOptions): DynamicModule {
    return { module: CacheModule, providers: [{ provide: 'CACHE_OPTS', useValue: opts }, CacheService], exports: [CacheService] };
  }
}
// imports: [CacheModule.register({ ttl: 60 })]
```

**Lead-level note:** This is the pattern behind `TypeOrmModule.forRoot()`, `ConfigModule.forRoot()`, etc. `forRootAsync` is used when configuration must be resolved via DI/async (e.g., secrets).

---

### Q6. How does NestJS architecture help you migrate to microservices later?

**Answer.** Because feature modules are **encapsulated bounded contexts**, you can extract one into its own deployable service with minimal churn: the module's public surface (`exports`) becomes the service's API/events, and its internals move wholesale. Nest also supports a **microservices transport layer** so a module can become a message-based service.

**Lead-level note:** A **modular monolith** in NestJS is often the right first step — you get clean boundaries without the operational cost of distributed systems, and you split only when scale/team boundaries justify it (Strangler Fig). *What's tested:* you don't jump to microservices prematurely.

---

### Q7. How do you manage configuration across environments?

**Answer.** Use `@nestjs/config` (`ConfigModule`) with environment files and **schema validation** so the app fails fast on bad config.

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production').required(),
    DATABASE_URL: Joi.string().uri().required(),
    PORT: Joi.number().default(3000),
  }),
});
// inject ConfigService and read typed values
```

**Lead-level note:** Validate at boot (fail fast); pull secrets at runtime from Secrets Manager/SSM (not committed); the config module is a good candidate for `@Global()`.

---

### Q8. How do you handle shared code without creating tight coupling?

**Answer.** Put genuinely reusable, stateless helpers/pipes/decorators in a **SharedModule** and re-export them. For cross-feature behavior, prefer **events** (EventEmitter/message bus) over direct service-to-service calls to keep features decoupled.

**Lead-level note:** Beware the shared module becoming a dumping ground. If feature A directly imports feature B's service frequently, question the boundary — maybe they should communicate via events, or the boundary is drawn wrong.

---

### Q9. How do you avoid circular dependencies between modules?

**Answer.** `forwardRef()` resolves them technically, but the real fix is architectural: extract the shared piece into its own module, or decouple via events so neither module imports the other.

**Lead-level note:** Circular module dependencies are a **design smell** signaling unclear boundaries. As a lead you'd treat `forwardRef` as a temporary patch and address the underlying coupling.

---

### Q10. What lifecycle hooks do modules/providers have?

**Answer.** Nest emits lifecycle events you can hook into:
- `onModuleInit()` — after the host module's dependencies are resolved.
- `onApplicationBootstrap()` — after all modules are initialized.
- `onModuleDestroy()`, `beforeApplicationShutdown()`, `onApplicationShutdown()` — during shutdown (require `app.enableShutdownHooks()`).

```ts
@Injectable()
export class QueueConsumer implements OnModuleInit, OnApplicationShutdown {
  onModuleInit() { this.start(); }
  async onApplicationShutdown() { await this.drainAndStop(); } // graceful shutdown
}
```

**Lead-level note:** On AWS (ECS/Lambda), wire graceful shutdown to these hooks + `enableShutdownHooks()` so SIGTERM drains in-flight work and closes pools — essential for zero-downtime deploys.
