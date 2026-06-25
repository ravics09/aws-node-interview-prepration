# NestJS — Lead Interview Prep

Everything NestJS for a **Lead / Senior Backend** interview, organized by category. NestJS is a core part of the target stack (Node.js · **NestJS** · Express.js · AWS), so these go deep on architecture, DI, the request lifecycle, and production concerns — not just definitions.

## Categories

| Folder | What's inside |
|--------|---------------|
| [`interview-questions/`](./interview-questions/README.md) | Top-rated NestJS interview questions with **detailed** answers + code, split by topic |
| [`cheatsheet/`](./cheatsheet/nestjs-cheatsheet.md) | Dense, high-recall NestJS reference (decorators, CLI, lifecycle, patterns) |
| [`best-practices/`](./best-practices/nestjs-best-practices.md) | Production best practices a lead is expected to enforce |

## Interview questions at a glance

| # | Topic | File |
|---|-------|------|
| 1 | Fundamentals (architecture, controllers, providers, modules) | [01-fundamentals.md](./interview-questions/01-fundamentals.md) |
| 2 | Dependency Injection & Providers | [02-dependency-injection.md](./interview-questions/02-dependency-injection.md) |
| 3 | Request Lifecycle (middleware, guards, pipes, interceptors, filters) | [03-request-lifecycle.md](./interview-questions/03-request-lifecycle.md) |
| 4 | Modules & Architecture | [04-modules-architecture.md](./interview-questions/04-modules-architecture.md) |
| 5 | Advanced (microservices, GraphQL, WebSockets, config, lifecycle) | [05-advanced-topics.md](./interview-questions/05-advanced-topics.md) |
| 6 | Testing, Performance & Deployment | [06-testing-performance.md](./interview-questions/06-testing-performance.md) |

## Why interviewers care about NestJS knowledge
- It exposes whether you understand **architecture and DI** (testability, decoupling) vs just wiring routes.
- The **request lifecycle** (middleware → guards → pipes → handler → interceptors → filters) is a favorite question — it shows you know *where* to put cross-cutting concerns.
- Lead candidates are expected to talk about **module boundaries, scaling, microservices, and production hardening**, not just CRUD.

## Related material in this repo
- Main 100-question guide (NestJS section Q16–Q30): [../guide/AWS-NodeJS-Lead-Interview-100-Questions.md](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md)
- Microservice patterns: [../microservices-nodejs/README.md](../microservices-nodejs/README.md)
- AWS + Node practical usage: [../practical-usecases/README.md](../practical-usecases/README.md)
