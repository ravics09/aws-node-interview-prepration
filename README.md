# AWS + Node.js Interview Preparation

Interview preparation material for a **Lead / Senior Backend Developer** role.

**Stack:** Node.js · NestJS · Express.js · AWS

---

## Contents

### [Top 100 Interview Questions (Lead Level)](./AWS-NodeJS-Lead-Interview-100-Questions.md)

A comprehensive guide of **100 questions with detailed answers**, real-time use cases, trade-offs, and lead-level insights. Each answer goes beyond definitions to explain *why*, *when not to use*, failure modes, and what an interviewer expects from someone who will own architecture and mentor a team.

The questions are organized into 8 cross-cutting categories:

| # | Category | Questions | Focus |
|---|----------|-----------|-------|
| 1 | Core Node.js Runtime, Event Loop & Performance | Q1–Q15 | Event loop, memory leaks, GC, CPU-bound work, performance |
| 2 | NestJS & Express.js Architecture | Q16–Q30 | DI, modules, guards/pipes/interceptors, caching, jobs, tracing |
| 3 | AWS Compute & Serverless (Lambda, ECS, EC2, Fargate) | Q31–Q44 | Service selection, cold starts, deployments, IAM, Step Functions |
| 4 | Scaling, Load Handling & Resilience | Q45–Q58 | Autoscaling, queues, retries, circuit breakers, cost optimization |
| 5 | Databases & Caching (RDS, DynamoDB, ElastiCache) | Q59–Q71 | Data modeling, replicas, connection pooling, hot partitions |
| 6 | Security & Identity | Q72–Q83 | IAM, Cognito, KMS, VPC, WAF, OWASP, JWT |
| 7 | Monitoring, Logging & Observability | Q84–Q93 | CloudWatch, X-Ray, SLOs, alerting, RED/USE, structured logging |
| 8 | System Design & Real-Time Use Cases | Q94–Q100 | End-to-end designs: APIs, notifications, pipelines, multi-tenant SaaS |

### [Rapid-Fire Round (Q101–Q150)](./rapid-fire/AWS-NodeJS-Rapid-Fire-101-150.md)

A complementary set of **50 quick-definition questions** for fast recall and last-minute revision. These are the crisp 1–3 sentence answers interviewers expect when firing questions in quick succession.

| Group | Questions | Focus |
|-------|-----------|-------|
| Node.js & JavaScript Runtime | Q101–Q112 | ESM vs CJS, streams, promises, AbortController, AsyncLocalStorage |
| NestJS & Express.js | Q113–Q122 | Providers, scopes, guards vs middleware, DTOs, adapters |
| AWS Core Services | Q123–Q136 | S3/EBS/EFS, SQS/SNS, Kinesis, load balancers, ECS roles, API Gateway |
| Scaling, Resilience & Networking | Q137–Q143 | Scaling types, sticky sessions, cold starts, RTO/RPO |
| Security, Data & Observability | Q144–Q150 | AuthN vs AuthZ, least privilege, hashing vs encryption, consistency |

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
