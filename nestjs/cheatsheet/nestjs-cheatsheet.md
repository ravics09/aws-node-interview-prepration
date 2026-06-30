# NestJS Cheat Sheet

Dense, high-recall reference for NestJS. For detailed explanations see [../interview-questions/](../interview-questions/README.md).

---

## Core building blocks

| Concept | Decorator | Role |
|---------|-----------|------|
| Module | `@Module({ imports, controllers, providers, exports })` | Organizes & encapsulates a feature |
| Controller | `@Controller('path')` | Handles routes, returns responses (thin) |
| Provider/Service | `@Injectable()` | Business logic, injected via DI |
| DTO | (plain class + `class-validator`) | Shape + validation of data |

## Route & param decorators

```
@Get() @Post() @Put() @Patch() @Delete()      // HTTP methods
@Param('id') @Query('q') @Body() @Headers()    // extract request parts
@Req() @Res()                                  // raw req/res (avoid; reduces portability)
@HttpCode(204) @Header('Cache-Control','no-store')
```

## Request lifecycle (ORDER — memorize)

```
Request → Middleware → Guards → Interceptors(pre) → Pipes → Handler
        → Interceptors(post) → (Exception Filter on throw) → Response
```

| Primitive | Decorator/Interface | Use for |
|-----------|--------------------|---------|
| Middleware | `NestMiddleware` / `configure()` | logging, correlation id, helmet, raw req/res |
| Guard | `CanActivate` + `@UseGuards()` | **auth / authorization** |
| Pipe | `PipeTransform` + `@UsePipes()` | **validation / transformation** |
| Interceptor | `NestInterceptor` + `@UseInterceptors()` | response transform, cache, timing, timeout |
| Exception filter | `ExceptionFilter` + `@Catch()` | consistent error responses |

## Dependency Injection

```ts
// Scopes
@Injectable()                       // DEFAULT = singleton (prefer this)
@Injectable({ scope: Scope.REQUEST })   // per request (costly; prefer AsyncLocalStorage)
@Injectable({ scope: Scope.TRANSIENT }) // per consumer

// Custom providers
{ provide: TOKEN, useClass: Impl }
{ provide: TOKEN, useValue: { ... } }
{ provide: TOKEN, useFactory: (dep) => ..., inject: [Dep] }
{ provide: TOKEN, useExisting: Other }

// Inject by token (interfaces need a token)
constructor(@Inject('TOKEN') private dep: Iface) {}
@Optional() @Inject('X') private x?: X;

// Circular deps
@Inject(forwardRef(() => OtherService))
```

## Global cross-cutting (DI-enabled) via tokens

```ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_PIPE, useClass: ValidationPipe },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
]
```

## Validation (global ValidationPipe)

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,            // strip unknown props (anti mass-assignment)
  forbidNonWhitelisted: true, // 400 on unexpected props
  transform: true,            // payload -> DTO instance + coerce types
}));
```
Common validators: `@IsString @IsInt @IsEmail @IsOptional @Min @Max @Length @IsEnum @ValidateNested @Type(() => Dto)`

## Dynamic modules

```ts
SomeModule.forRoot(opts)          // sync config
SomeModule.forRootAsync({ useFactory, inject })  // async/DI config (secrets, etc.)
SomeModule.register(opts)         // per-import config (non-global)
```

## Lifecycle hooks

```
onModuleInit → onApplicationBootstrap → (running) → onModuleDestroy
→ beforeApplicationShutdown → onApplicationShutdown
```
`app.enableShutdownHooks();`  // required for shutdown hooks (SIGTERM)

## Custom decorators

```ts
export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest().user);
export const Roles = (...r: string[]) => SetMetadata('roles', r);
// Reflector to read: reflector.getAllAndOverride('roles', [ctx.getHandler(), ctx.getClass()])
```

## Microservices

```ts
@MessagePattern({ cmd: 'x' })   // request/response (RPC)
@EventPattern('event')          // fire-and-forget
// transports: TCP, Redis, NATS, MQTT, RabbitMQ, Kafka, gRPC
```

## GraphQL / WebSockets

```ts
// GraphQL
@Resolver(() => User) @Query() @Mutation() @ResolveField() @Args() @Parent()
// fix N+1 with DataLoader; add depth/complexity limits

// WebSockets
@WebSocketGateway() @WebSocketServer() @SubscribeMessage('msg')
// scale-out -> Redis adapter (backplane) or API Gateway WebSockets
```

## Config / cache / throttle / schedule / queues / health

```ts
ConfigModule.forRoot({ isGlobal: true, validationSchema })   // @nestjs/config
CacheModule.registerAsync({ ... })                            // Redis store for fleets
ThrottlerModule.forRoot({ throttlers: [{ ttl, limit }] })     // Redis-backed for fleets
@Cron('0 2 * * *')                                            // @nestjs/schedule (beware multi-instance!)
BullModule.registerQueue({ name: 'jobs' })                    // @nestjs/bull (Redis)
TerminusModule + @HealthCheck()                               // liveness/readiness
```

## Testing

```ts
const ref = await Test.createTestingModule({ providers/imports })
  .overrideProvider(X).useValue(mock)
  .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
  .compile();
ref.get(Service);                          // unit
ref.createNestApplication();               // + supertest for e2e
```

## CLI quick reference

```
nest new app
nest g module users          nest g controller users
nest g service users         nest g resource users   # full CRUD scaffold
nest g guard auth            nest g interceptor logging
nest g pipe validation       nest g filter http-exception
nest build                   nest start --watch
```

## Bootstrap (production-ish)

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
app.useGlobalFilters(new AllExceptionsFilter());
app.enableShutdownHooks();
app.enableCors();
await app.listen(process.env.PORT ?? 3000);
```

## Quick gotchas
- Default provider scope is **singleton** — don't store per-request state in it.
- **Auth → guard**, **validation → pipe**, **response shape → interceptor**, **errors → filter**.
- Interfaces need **injection tokens** (erased at runtime).
- `@Cron` fires on **every instance** in a fleet → use a single scheduler / EventBridge.
- In-memory cache/throttle counters are **per-instance** → use Redis across a fleet.
- Use `AsyncLocalStorage` for request context, not `Scope.REQUEST` (perf).
- Globals that need DI → register via `APP_*` tokens, not `new X()`.
