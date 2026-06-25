# REST API Interview Questions — Basic to Advanced

REST API questions with **detailed answers and Node.js/Express code logic**, framed for a backend lead on AWS. Ramps from fundamentals to advanced production concerns.

| Level | Focus | File |
|-------|-------|------|
| **Basic** | REST constraints, methods, status codes, idempotency, statelessness, URI design | [01-basic.md](./01-basic.md) |
| **Intermediate** | Versioning, pagination, validation, error handling, auth, caching, content negotiation | [02-intermediate.md](./02-intermediate.md) |
| **Advanced** | Idempotency keys, rate limiting, HATEOAS, security, scaling, AWS deployment, resilience | [03-advanced.md](./03-advanced.md) |

## How to answer REST questions well (lead signal)
- State the **principle** (e.g., "PUT is idempotent") **and** show the **Express code** that honors it.
- Always mention **correct status codes** and a **consistent error contract**.
- Tie scaling answers to **statelessness** and AWS placement (API Gateway/ALB, Lambda/Fargate, CloudFront).
- Bring up **idempotency, validation (security), pagination, caching, versioning** proactively — they're the marks of production maturity.
