# AWS + Node.js Interview Preparation

Interview preparation material for a **Lead / Senior Backend Developer** role.

**Stack:** Node.js · NestJS · Express.js · AWS

---

## Repository structure

```
.
├── guide/         # The full 100-question deep-dive guide (single file)
├── topics/        # The same 100 questions split by category (8 files) + index
├── rapid-fire/    # 50 quick-definition questions (Q101–Q150)
├── aws/           # AWS-focused pack: cheat sheet, quick review, comparisons, scenarios
├── practical-usecases/ # Per-service AWS+Node.js practical guides with SDK v3 code
├── microservices-nodejs/ # Microservice patterns with Node.js (diagrams, code, pros/cons)
├── nestjs/        # NestJS pack: detailed interview questions, cheat sheet, best practices
├── docker/        # Docker pack: Q&As (basic/medium/advanced), cheat sheet, Node+AWS use cases, rapid fire
├── rest-api/      # REST API pack: Q&As (basic→advanced), Express+AWS code, cheat sheet, rapid fire
├── code-examples/ # Runnable TypeScript reference implementations
└── cheatsheet/    # One-page condensed cheat sheet for last-minute revision
```

| Folder | What's inside | Best for |
|--------|---------------|----------|
| [`guide/`](./guide/AWS-NodeJS-Lead-Interview-100-Questions.md) | All 100 deep-dive Q&As in one document | Reading end-to-end |
| [`topics/`](./topics/README.md) | 100 questions split into 8 per-category files | Focused study by area |
| [`rapid-fire/`](./rapid-fire/AWS-NodeJS-Rapid-Fire-101-150.md) | 50 quick-definition Q&As (Q101–Q150) | Fast recall / warm-up |
| [`aws/`](./aws/README.md) | AWS cheat sheet, per-service quick review, service comparisons, real-time scenarios | AWS-specific & system-design rounds |
| [`practical-usecases/`](./practical-usecases/README.md) | Per-service practical guides: how each AWS service is used with Node.js, with runnable SDK v3 code | Hands-on "how do I use X with Node?" |
| [`microservices-nodejs/`](./microservices-nodejs/README.md) | 17 microservice patterns with Node.js — diagrams, code, pros/cons, real use cases | Architecture & microservices rounds |
| [`nestjs/`](./nestjs/README.md) | NestJS deep-dive: 60 detailed interview Q&As (by topic), cheat sheet, best practices | NestJS-focused rounds |
| [`docker/`](./docker/README.md) | Docker: basic/medium/advanced Q&As, cheat sheet, Node+AWS use cases with code, rapid fire | Docker & containerization rounds |
| [`rest-api/`](./rest-api/README.md) | REST API: basic→advanced Q&As (Express code), Express+AWS code examples, cheat sheet, rapid fire | REST API design rounds |
| [`code-examples/`](./code-examples/README.md) | Graceful shutdown, circuit breaker, retry, idempotency, NestJS guards, CDK | Seeing patterns in code |
| [`cheatsheet/`](./cheatsheet/CHEATSHEET.md) | Highest-yield points, condensed | Night-before revision |

---

## The 100-question guide (Q1–Q100)

A comprehensive guide of **100 questions with detailed answers**, real-time use cases, trade-offs, and lead-level insights. Each answer goes beyond definitions to explain *why*, *when not to use*, failure modes, and what an interviewer expects from someone who will own architecture and mentor a team.

Read it as [one document](./guide/AWS-NodeJS-Lead-Interview-100-Questions.md) or by category via the [topic index](./topics/README.md):

| # | Category | Questions | Topic file |
|---|----------|-----------|-----------|
| 1 | Core Node.js Runtime, Event Loop & Performance | Q1–Q15 | [01](./topics/01-nodejs-runtime-performance.md) |
| 2 | NestJS & Express.js Architecture | Q16–Q30 | [02](./topics/02-nestjs-expressjs.md) |
| 3 | AWS Compute & Serverless (Lambda, ECS, EC2, Fargate) | Q31–Q44 | [03](./topics/03-aws-compute-serverless.md) |
| 4 | Scaling, Load Handling & Resilience | Q45–Q58 | [04](./topics/04-scaling-load-resilience.md) |
| 5 | Databases & Caching (RDS, DynamoDB, ElastiCache) | Q59–Q71 | [05](./topics/05-databases-caching.md) |
| 6 | Security & Identity | Q72–Q83 | [06](./topics/06-security-identity.md) |
| 7 | Monitoring, Logging & Observability | Q84–Q93 | [07](./topics/07-monitoring-logging-observability.md) |
| 8 | System Design & Real-Time Use Cases | Q94–Q100 | [08](./topics/08-system-design-usecases.md) |

## Rapid-fire round (Q101–Q150)

A complementary set of **50 quick-definition questions** for fast recall — the crisp 1–3 sentence answers interviewers expect when firing questions in quick succession. See [rapid-fire/](./rapid-fire/AWS-NodeJS-Rapid-Fire-101-150.md).

| Group | Questions | Focus |
|-------|-----------|-------|
| Node.js & JavaScript Runtime | Q101–Q112 | ESM vs CJS, streams, promises, AbortController, AsyncLocalStorage |
| NestJS & Express.js | Q113–Q122 | Providers, scopes, guards vs middleware, DTOs, adapters |
| AWS Core Services | Q123–Q136 | S3/EBS/EFS, SQS/SNS, Kinesis, load balancers, ECS roles, API Gateway |
| Scaling, Resilience & Networking | Q137–Q143 | Scaling types, sticky sessions, cold starts, RTO/RPO |
| Security, Data & Observability | Q144–Q150 | AuthN vs AuthZ, least privilege, hashing vs encryption, consistency |

## AWS reference pack

A dedicated, AWS-focused knowledge pack for the cloud-heavy parts of the interview — see [aws/](./aws/README.md):

| Doc | Use |
|-----|-----|
| [aws-cheatsheet.md](./aws/aws-cheatsheet.md) | Dense recall of services, limits, and facts |
| [aws-services-quick-review.md](./aws/aws-services-quick-review.md) | Per-service review with Node.js tie-ins and gotchas |
| [aws-services-comparison.md](./aws/aws-services-comparison.md) | Head-to-head decision tables ("X vs Y, which and why?") |
| [aws-services-realtime-scenarios.md](./aws/aws-services-realtime-scenarios.md) | 15 real-world scenarios with architectures and reasoning |

## Code examples

Runnable TypeScript reference implementations of the key patterns — see [code-examples/](./code-examples/README.md): graceful shutdown, circuit breaker (`opossum`), retry with backoff + jitter, bounded concurrency, idempotency via DynamoDB, pre-signed S3 uploads, NestJS JWT/roles guards + exception filter + correlation IDs, and an AWS CDK Fargate service stack.

---

## How to Use

- Each question has a **short answer** (the headline) and a **detailed answer** (the reasoning a lead is expected to give).
- Many answers include a **Real-time use case** and **Lead-level insight / gotchas**.
- Categories are intentionally cross-cutting — a single AWS service often appears under performance, security, *and* cost.

## Recurring Lead-Level Themes

- Statelessness & horizontal scaling
- Idempotency + retries with backoff/jitter + DLQs
- Decoupling via queues/events (load leveling, resilience)
- Least privilege & defense in depth
- Observability built in from day one (logs/metrics/traces + correlation IDs + SLOs)
- Cost as an engineering KPI
- Graceful degradation over total failure (circuit breakers, load shedding, fallbacks)
- Measure before optimizing
