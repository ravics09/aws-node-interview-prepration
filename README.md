# AWS + Node.js Interview Preparation

Interview preparation material for a **Lead / Senior Backend Developer** role.

**Stack:** Node.js · NestJS · Express.js · AWS

---

## Repository structure

```
.
├── aws-with-node/                 # Core prep: 100-Q deep-dive guide + per-category split + rapid-fire + cheat sheet
├── aws/                           # AWS reference pack (cheat sheet, quick review, comparisons, scenarios) + per-service practical use cases
├── nestjs/                        # NestJS pack: interview Q&As, cheat sheet, best practices, runnable code examples
├── nodejs-microservices-pattern/  # 17 microservice patterns with Node.js (diagrams, code, pros/cons, real use cases)
├── docker/                        # Docker pack: Q&As (basic/medium/advanced), cheat sheet, Node+AWS use cases, rapid fire
└── rest-api/                      # REST API pack: Q&As, Express+AWS code, cheat sheet, rapid fire, SSO implementations
```

| Folder | What's inside | Best for |
|--------|---------------|----------|
| [`aws-with-node/`](./aws-with-node/) | The full 100-question deep-dive guide, the same 100 split into 8 per-category files, the 50-question rapid-fire round, and a condensed cheat sheet | Core end-to-end study |
| [`aws/`](./aws/README.md) | AWS cheat sheet, per-service quick review, service comparisons, real-time scenarios, plus per-service practical use cases with Node.js SDK v3 code | AWS-specific & system-design rounds |
| [`nestjs/`](./nestjs/README.md) | NestJS deep-dive: detailed interview Q&As (by topic), cheat sheet, best practices, and runnable TypeScript code examples | NestJS-focused rounds |
| [`nodejs-microservices-pattern/`](./nodejs-microservices-pattern/README.md) | 17 microservice patterns with Node.js — diagrams, code, pros/cons, real use cases | Architecture & microservices rounds |
| [`docker/`](./docker/README.md) | Docker: basic/medium/advanced Q&As, cheat sheet, Node+AWS use cases with code, rapid fire | Docker & containerization rounds |
| [`rest-api/`](./rest-api/README.md) | REST API: basic→advanced Q&As (Express code), Express+AWS code examples, cheat sheet, rapid fire, and SSO implementations | REST API design rounds |

---

## Core pack — `aws-with-node/`

The main preparation material lives in [`aws-with-node/`](./aws-with-node/):

| File | What's inside | Best for |
|------|---------------|----------|
| [aws-node-Lead-Interview-100-Questions.md](./aws-with-node/aws-node-Lead-Interview-100-Questions.md) | All 100 deep-dive Q&As in one document | Reading end-to-end |
| `01`–`08` category files (below) | The same 100 questions split into 8 per-category files | Focused study by area |
| [aws-node-Rapid-Fire-101-150.md](./aws-with-node/aws-node-Rapid-Fire-101-150.md) | 50 quick-definition Q&As (Q101–Q150) | Fast recall / warm-up |
| [aws+node cheetsheet.md](./aws-with-node/aws+node%20cheetsheet.md) | Highest-yield points, condensed | Night-before revision |

### The 100-question guide (Q1–Q100)

A comprehensive guide of **100 questions with detailed answers**, real-time use cases, trade-offs, and lead-level insights. Each answer goes beyond definitions to explain *why*, *when not to use*, failure modes, and what an interviewer expects from someone who will own architecture and mentor a team.

Read it as [one document](./aws-with-node/aws-node-Lead-Interview-100-Questions.md) or by category:

| # | Category | Questions | Topic file |
|---|----------|-----------|-----------|
| 1 | Core Node.js Runtime, Event Loop & Performance | Q1–Q15 | [01](./aws-with-node/01-nodejs-runtime-performance.md) |
| 2 | NestJS & Express.js Architecture | Q16–Q30 | [02](./aws-with-node/02-nestjs-expressjs.md) |
| 3 | AWS Compute & Serverless (Lambda, ECS, EC2, Fargate) | Q31–Q44 | [03](./aws-with-node/03-aws-compute-serverless.md) |
| 4 | Scaling, Load Handling & Resilience | Q45–Q58 | [04](./aws-with-node/04-scaling-load-resilience.md) |
| 5 | Databases & Caching (RDS, DynamoDB, ElastiCache) | Q59–Q71 | [05](./aws-with-node/05-databases-caching.md) |
| 6 | Security & Identity | Q72–Q83 | [06](./aws-with-node/06-security-identity.md) |
| 7 | Monitoring, Logging & Observability | Q84–Q93 | [07](./aws-with-node/07-monitoring-logging-observability.md) |
| 8 | System Design & Real-Time Use Cases | Q94–Q100 | [08](./aws-with-node/08-system-design-usecases.md) |

### Rapid-fire round (Q101–Q150)

A complementary set of **50 quick-definition questions** for fast recall — the crisp 1–3 sentence answers interviewers expect when firing questions in quick succession. See [aws-node-Rapid-Fire-101-150.md](./aws-with-node/aws-node-Rapid-Fire-101-150.md).

| Group | Questions | Focus |
|-------|-----------|-------|
| Node.js & JavaScript Runtime | Q101–Q112 | ESM vs CJS, streams, promises, AbortController, AsyncLocalStorage |
| NestJS & Express.js | Q113–Q122 | Providers, scopes, guards vs middleware, DTOs, adapters |
| AWS Core Services | Q123–Q136 | S3/EBS/EFS, SQS/SNS, Kinesis, load balancers, ECS roles, API Gateway |
| Scaling, Resilience & Networking | Q137–Q143 | Scaling types, sticky sessions, cold starts, RTO/RPO |
| Security, Data & Observability | Q144–Q150 | AuthN vs AuthZ, least privilege, hashing vs encryption, consistency |

---

## AWS reference pack — `aws/`

A dedicated, AWS-focused knowledge pack for the cloud-heavy parts of the interview — see [aws/](./aws/README.md):

| Doc | Use |
|-----|-----|
| [aws-cheatsheet.md](./aws/aws-cheatsheet.md) | Dense recall of services, limits, and facts |
| [aws-services-quick-review.md](./aws/aws-services-quick-review.md) | Per-service review with Node.js tie-ins and gotchas |
| [aws-services-comparison.md](./aws/aws-services-comparison.md) | Head-to-head decision tables ("X vs Y, which and why?") |
| [aws-services-realtime-scenarios.md](./aws/aws-services-realtime-scenarios.md) | Real-world scenarios with architectures and reasoning |
| [aws-services-realtime-scenarios-detailed.md](./aws/aws-services-realtime-scenarios-detailed.md) | Expanded, detailed versions of the real-time scenarios |
| [practical-usecases/](./aws/practical-usecases/README.md) | Per-service practical guides: how each AWS service is used with Node.js, with runnable SDK v3 code |

---

## NestJS pack — `nestjs/`

NestJS deep-dive plus the runnable code examples — see [nestjs/](./nestjs/README.md):

- **interview-questions/** — detailed Q&As by topic (fundamentals, dependency injection, request lifecycle, modules & architecture, advanced topics, testing & performance)
- **best-practices/** — NestJS best practices
- **cheatsheet/** — NestJS cheat sheet
- **[code-examples/](./nestjs/code-examples/README.md)** — runnable TypeScript reference implementations: graceful shutdown, circuit breaker (`opossum`), retry with backoff + jitter, bounded concurrency, idempotency via DynamoDB, pre-signed S3 uploads, NestJS JWT/roles guards + exception filter + correlation IDs, and an AWS CDK Fargate service stack

---

## REST API pack — `rest-api/`

REST API design and implementation prep — see [rest-api/](./rest-api/README.md):

- **interview-questions/** — basic → advanced Q&As
- **code-examples/** — Express CRUD API, validation & error handling, JWT auth, pagination/filtering/sorting, AWS integration, deploy to Lambda + API Gateway
- **cheatsheet/** — REST API cheat sheet
- **rapid-fire/** — quick-recall REST API questions
- **[sso/](./rest-api/sso/README.md)** — full Node + Express SSO implementations (Google, AWS Cognito, Azure Entra ID, Facebook)

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
