# NestJS Dependency Injection & Providers — Interview Questions

[← Back to index](./README.md)

---

### Q1. How does Dependency Injection work in NestJS?

**Answer.** Nest has an **IoC (Inversion of Control) container** that instantiates classes and injects their dependencies automatically. You mark a class `@Injectable()`, register it in a module's `providers`, and Nest resolves the dependency graph at bootstrap. Injection is by **token** — usually the class type (read from TypeScript metadata), but it can be a string/symbol for abstractions.

```ts
@Injectable()
export class OrdersService {
  constructor(private readonly payments: PaymentsService) {} // resolved by type token
}
```

**Benefits:** loose coupling, testability (swap real for mock), centralized lifecycle management.

**Lead-level note:** DI is *the* reason Nest code is testable — you inject a mock `PaymentsService` in tests without touching consumers. *What's tested:* do you understand why DI matters, not just that it exists.

---

### Q2. What are provider scopes (singleton, request, transient)? What are the trade-offs?

**Answer.**
- **`Scope.DEFAULT` (singleton)** — one shared instance for the whole app (the default). Most performant.
- **`Scope.REQUEST`** — a new instance per incoming request. Useful for request-specific state (e.g., per-request tenant context), but **costs performance** because Nest re-instantiates the provider (and its dependency sub-tree) per request.
- **`Scope.TRANSIENT`** — a new instance for each consumer that injects it.

```ts
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService { /* per-request state */ }
```

**Lead-level note:** Default to **singleton**; never store per-request state in a singleton (it leaks across requests). Use `REQUEST` scope sparingly — prefer **`AsyncLocalStorage`** for request context to avoid the scope's performance penalty and "scope bubbling" up the chain.

---

### Q3. What are custom providers (`useClass`, `useValue`, `useFactory`, `useExisting`)?

**Answer.** Ways to control *how* a token is resolved:

```ts
@Module({
  providers: [
    // useClass: bind a token to a concrete class (swap by environment)
    { provide: StorageService, useClass: process.env.NODE_ENV === 'prod' ? S3StorageService : LocalStorageService },

    // useValue: provide a constant/mock
    { provide: 'CONFIG', useValue: { region: 'us-east-1' } },

    // useFactory: build dynamically, with injected deps
    {
      provide: 'DB_CONNECTION',
      useFactory: (config: ConfigService) => createPool(config.get('DB_URL')),
      inject: [ConfigService],
    },

    // useExisting: create an alias to another provider
    { provide: 'LOGGER_ALIAS', useExisting: LoggerService },
  ],
})
export class AppModule {}
```

**Lead-level note:** `useFactory` (with `inject`) is the workhorse for async/configurable resources (DB pools, SDK clients). `useClass` enables binding an **interface token** to different implementations per environment — the core of testable, swappable design.

---

### Q4. How do you inject an interface (which doesn't exist at runtime)?

**Answer.** TypeScript interfaces are erased at runtime, so Nest can't use them as injection tokens. Use a **string/symbol token** + `@Inject()`:

```ts
export interface StorageService { put(key: string, body: Buffer): Promise<void>; }
export const STORAGE = Symbol('STORAGE');

@Module({ providers: [{ provide: STORAGE, useClass: S3StorageService }] })
export class StorageModule {}

@Injectable()
export class UploadService {
  constructor(@Inject(STORAGE) private readonly storage: StorageService) {}
}
```

**Lead-level note:** This is how you program to an **abstraction**, binding the concrete implementation in the module — clean for testing and swapping (e.g., S3 in prod, in-memory in tests).

---

### Q5. How does Nest handle circular dependencies?

**Answer.** When two providers (or modules) depend on each other, use **`forwardRef()`** on both sides:

```ts
@Injectable()
export class AService {
  constructor(@Inject(forwardRef(() => BService)) private b: BService) {}
}
@Injectable()
export class BService {
  constructor(@Inject(forwardRef(() => AService)) private a: AService) {}
}
```
For modules, `imports: [forwardRef(() => OtherModule)]`.

**Lead-level note:** Circular deps are usually a **design smell** — they often signal that responsibilities are split wrong. `forwardRef` is the escape hatch, but the better fix is often to extract a shared provider or use events to decouple. *What's tested:* do you treat it as a code smell, not just know the API.

---

### Q6. What are dynamic modules and `forRoot`/`forRootAsync`?

**Answer.** Dynamic modules let a module be **configured** when imported, returning a module definition at runtime. The `forRoot`/`forRootAsync` convention is used by configurable, reusable modules (ConfigModule, TypeOrmModule).

```ts
@Module({})
export class DatabaseModule {
  static forRootAsync(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [ConfigModule],
      providers: [{
        provide: 'DB',
        useFactory: (config: ConfigService) => createPool(config.get('DB_URL')),
        inject: [ConfigService],
      }],
      exports: ['DB'],
    };
  }
}
// usage: imports: [DatabaseModule.forRootAsync()]
```

**Lead-level note:** `forRootAsync` is for when configuration must be resolved **asynchronously / via DI** (e.g., reading secrets from ConfigService). It's the standard pattern for shareable infra modules.

---

### Q7. What is the `Reflector` and when do you use it?

**Answer.** `Reflector` reads **custom metadata** set by decorators (via `SetMetadata` or custom decorators) at runtime. It's most used in guards/interceptors to make decisions based on route metadata.

```ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return required.some((r) => user?.roles?.includes(r));
  }
}
```

**Lead-level note:** `getAllAndOverride` merges method-level and class-level metadata (method wins) — the idiomatic way to support both `@Roles()` on a controller and an action.

---

### Q8. What is a global module and when should you use one?

**Answer.** A module marked `@Global()` makes its exported providers available everywhere without re-importing it in each consuming module.

```ts
@Global()
@Module({ providers: [ConfigService], exports: [ConfigService] })
export class ConfigModule {}
```

**Lead-level note:** Use sparingly — globals reduce explicitness and can hide coupling. Good for truly cross-cutting singletons (config, logging); avoid for feature providers. *What's tested:* judgment about when globals help vs hurt maintainability.

---

### Q9. How do you provide async configuration to a provider (e.g., a DB pool needing secrets)?

**Answer.** Use `useFactory` with `inject`, often via `forRootAsync`, so the factory can `await` and pull from `ConfigService`/Secrets Manager:

```ts
{
  provide: 'REDIS',
  useFactory: async (config: ConfigService) => {
    const url = await config.getSecret('REDIS_URL'); // could fetch from Secrets Manager
    return new Redis(url);
  },
  inject: [ConfigService],
}
```

**Lead-level note:** This keeps secrets out of the image and resolves them at runtime — aligns with the AWS Secrets Manager pattern.

---

### Q10. How does DI make NestJS applications testable?

**Answer.** Because dependencies are injected (not `new`-ed inside classes), tests can replace any provider with a mock using the `TestingModule`:

```ts
const moduleRef = await Test.createTestingModule({
  providers: [OrdersService, { provide: PaymentsService, useValue: mockPayments }],
}).compile();
const orders = moduleRef.get(OrdersService); // uses the mock PaymentsService
```

**Lead-level note:** This is the practical payoff of DI — fast, isolated unit tests with no real network/DB. Tie your "why DI" answer to this concrete benefit.
