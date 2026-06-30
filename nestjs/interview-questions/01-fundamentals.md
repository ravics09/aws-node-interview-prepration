# NestJS Fundamentals — Interview Questions

[← Back to index](./README.md)

---

### Q1. What is NestJS and why would you choose it over plain Express?

**Answer.** NestJS is a progressive Node.js framework for building server-side applications, built with and fully supporting TypeScript. It's **opinionated and modular**, providing out-of-the-box architecture inspired by Angular: modules, controllers, providers, dependency injection, and decorators. It runs **on top of** Express by default (or Fastify), so you keep the underlying ecosystem.

**Why over plain Express:**
- **Structure & consistency:** Express is unopinionated — every team invents its own layout, which becomes inconsistent at scale. Nest enforces a clear, testable architecture.
- **Dependency Injection** built in → loose coupling and easy mocking.
- **First-class TypeScript**, decorators, and built-in support for validation, guards, interceptors, pipes, GraphQL, WebSockets, microservices, and testing.
- **Faster onboarding** on large teams thanks to conventions.

**Lead-level note:** For a single tiny Lambda or a trivial proxy, Express may be lighter. Choose Nest when the codebase/team is large enough that consistency and architecture pay off. *What's tested:* whether you choose tools by context, not dogma.

---

### Q2. Explain the core building blocks: Modules, Controllers, and Providers.

**Answer.**
- **Modules** (`@Module`) — organizational units that group related controllers and providers. Every app has a root module; features are their own modules. Modules define encapsulation boundaries.
- **Controllers** (`@Controller`) — handle incoming requests and return responses. They define routes via decorators (`@Get`, `@Post`) and delegate business logic to providers.
- **Providers** (`@Injectable`) — the workhorses (services, repositories, factories, helpers). They contain business logic and are injected via DI.

```ts
@Injectable()
export class UsersService {
  findOne(id: string) { return { id, name: 'Ada' }; }
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {} // injected
  @Get(':id') get(@Param('id') id: string) { return this.users.findOne(id); }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
```

**Lead-level note:** Controllers should be thin (HTTP concerns + delegation); business logic lives in providers. This separation keeps logic testable and reusable.

---

### Q3. How does NestJS relate to Express/Fastify? Can you swap the HTTP engine?

**Answer.** Nest is **platform-agnostic** via an HTTP adapter. By default it uses `@nestjs/platform-express`; you can switch to `@nestjs/platform-fastify` for higher throughput and lower overhead with minimal code change:

```ts
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
```

You still get the full Nest programming model (controllers, DI, guards, etc.); only the underlying HTTP server changes.

**Lead-level note:** Most code is adapter-agnostic, but if you use raw `req`/`res` (Express-specific APIs) you reduce portability. Fastify can meaningfully improve throughput for high-RPS services.

---

### Q4. What are decorators in NestJS and how are they used?

**Answer.** Decorators are TypeScript/ES annotations that attach metadata to classes, methods, and parameters; Nest reads this metadata to wire things up. Common categories:
- **Class:** `@Module`, `@Controller`, `@Injectable`, `@Catch`.
- **Method/route:** `@Get`, `@Post`, `@UseGuards`, `@UseInterceptors`, `@UsePipes`.
- **Parameter:** `@Param`, `@Query`, `@Body`, `@Req`, `@Headers`.
- **Custom:** you can build your own (e.g., `@CurrentUser()`).

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator(
  (_data, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
// usage: @Get('me') me(@CurrentUser() user: User) { return user; }
```

**Lead-level note:** Custom decorators + the `Reflector` (reading metadata) are how you build clean, declarative cross-cutting features (e.g., `@Roles('admin')`).

---

### Q5. What is a DTO and how do you validate incoming data?

**Answer.** A **DTO (Data Transfer Object)** is a class that defines the shape of request/response data. Combined with `class-validator`/`class-transformer` and a global `ValidationPipe`, it gives automatic validation and transformation.

```ts
import { IsEmail, IsInt, Min } from 'class-validator';
export class CreateUserDto {
  @IsEmail() email: string;
  @IsInt() @Min(18) age: number;
}

// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,            // strip unknown properties
  forbidNonWhitelisted: true, // 400 on unexpected properties
  transform: true,            // convert payloads to DTO instances + coerce types
}));
```

**Lead-level note:** Validation is also a **security control** — `whitelist` prevents mass-assignment, and you should pair it with output serialization (`ClassSerializerInterceptor` + `@Exclude()`) so sensitive fields (e.g., `passwordHash`) never leak.

---

### Q6. What is the difference between a controller and a service, and why separate them?

**Answer.** A **controller** handles the HTTP layer — routing, extracting params/body, returning responses. A **service** (provider) holds **business logic** and data access. Separating them:
- Keeps controllers thin and focused on transport.
- Makes business logic **reusable** (callable from other services, queue consumers, GraphQL resolvers).
- Makes logic **testable in isolation** (unit-test the service without HTTP).

**Lead-level note:** A common smell is fat controllers with business logic inline — it couples logic to HTTP and hurts testability. *What's tested:* separation of concerns.

---

### Q7. How do you handle routing, route parameters, and nested routes?

**Answer.** Routing is declarative via decorators. The `@Controller('prefix')` sets a base path; method decorators add sub-paths.

```ts
@Controller('users')
export class UsersController {
  @Get() findAll(@Query('page') page = '1') {}        // GET /users?page=1
  @Get(':id') findOne(@Param('id') id: string) {}      // GET /users/:id
  @Post() create(@Body() dto: CreateUserDto) {}        // POST /users
  @Get(':id/orders') orders(@Param('id') id: string) {} // GET /users/:id/orders
}
```

API **versioning** is supported (URI/header/media-type): `app.enableVersioning({ type: VersioningType.URI })` → `@Controller({ path: 'users', version: '1' })`.

---

### Q8. What is the bootstrapping process of a NestJS application?

**Answer.** `NestFactory.create(AppModule)` builds the application:
1. Nest reads the **root module** and recursively resolves imported modules.
2. It instantiates **providers** in dependency order (the IoC container builds the graph).
3. Global pipes/guards/interceptors/filters are registered.
4. The HTTP adapter (Express/Fastify) starts listening.

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();        // enable lifecycle/graceful shutdown hooks
  await app.listen(3000);
}
bootstrap();
```

**Lead-level note:** `enableShutdownHooks()` is important on AWS (ECS/Lambda) so `onModuleDestroy`/`beforeApplicationShutdown` fire on SIGTERM for graceful shutdown.

---

### Q9. How does NestJS support TypeScript and what advantages does that bring?

**Answer.** Nest is built in TypeScript and leans on it heavily — decorators, generics, and metadata reflection (`reflect-metadata`) power DI and validation. Advantages: compile-time type safety, better IDE tooling/refactoring, self-documenting DTOs/interfaces, and decorator-driven metadata that the framework uses to wire DI and routing.

**Lead-level note:** DI relies on **emitted type metadata** (`emitDecoratorMetadata`), which is why interfaces (erased at runtime) need **injection tokens** rather than being injectable by type alone.

---

### Q10. What's the difference between `@nestjs/common`, `@nestjs/core`, and platform packages?

**Answer.**
- **`@nestjs/common`** — the decorators, pipes, guards, interceptors, exceptions, and utilities you use day to day.
- **`@nestjs/core`** — the framework runtime: the IoC container, `NestFactory`, the request execution engine, `Reflector`.
- **`@nestjs/platform-express` / `platform-fastify`** — the HTTP adapter implementations.
- Feature packages: `@nestjs/config`, `@nestjs/typeorm`, `@nestjs/graphql`, `@nestjs/microservices`, `@nestjs/throttler`, `@nestjs/terminus`, etc.

**Lead-level note:** The split is what enables platform-agnosticism (swap Express↔Fastify) and modular feature adoption.
