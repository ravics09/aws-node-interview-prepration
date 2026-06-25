# NestJS Interview Questions — Top Rated, In Detail

The most commonly asked (and most revealing) NestJS interview questions, with **detailed answers and code**. Organized by topic so you can drill the area you're weak on. Written at **lead level** — answers include trade-offs, gotchas, and "what the interviewer is really testing."

| # | Topic | Covers | File |
|---|-------|--------|------|
| 1 | **Fundamentals** | What/why NestJS, architecture, controllers, providers, modules, Express/Fastify, DTOs | [01-fundamentals.md](./01-fundamentals.md) |
| 2 | **Dependency Injection & Providers** | IoC container, scopes, custom providers, tokens, circular deps, dynamic modules | [02-dependency-injection.md](./02-dependency-injection.md) |
| 3 | **Request Lifecycle** | Middleware, guards, pipes, interceptors, exception filters, execution order | [03-request-lifecycle.md](./03-request-lifecycle.md) |
| 4 | **Modules & Architecture** | Encapsulation, global/shared/core modules, feature structure, scaling | [04-modules-architecture.md](./04-modules-architecture.md) |
| 5 | **Advanced Topics** | Microservices, GraphQL, WebSockets, ConfigModule, lifecycle hooks, caching, queues | [05-advanced-topics.md](./05-advanced-topics.md) |
| 6 | **Testing, Performance & Deployment** | Unit/e2e testing, Fastify, performance, graceful shutdown, production | [06-testing-performance.md](./06-testing-performance.md) |

## How to answer NestJS questions well (lead signal)
1. **Name the primitive AND why it's the right one** — e.g., "auth goes in a *guard*, not middleware, because guards run after route matching and integrate with `@Roles()` metadata."
2. **Mention scope/lifecycle implications** — singletons, request scope cost, lifecycle hooks.
3. **Tie it to testability** — DI is what makes mocking clean; say so.
4. **Production angle** — validation as security, graceful shutdown, observability, where it runs on AWS.
