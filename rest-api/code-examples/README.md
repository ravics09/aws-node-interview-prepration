# REST API Code Examples (Node.js · Express.js · AWS)

Practical, copy-adaptable code for building production REST APIs with Express on AWS. Each file is focused and commented.

> Node.js 18+, Express 4/5, **AWS SDK for JavaScript v3**. Install only the clients you use.

| # | Example | File |
|---|---------|------|
| 1 | **CRUD REST API** with layered structure + central error handling | [01-express-crud-api.md](./01-express-crud-api.md) |
| 2 | **Validation & error handling** (zod, consistent error contract, 404/422) | [02-validation-error-handling.md](./02-validation-error-handling.md) |
| 3 | **Auth: JWT** authentication + role/ownership authorization | [03-auth-jwt.md](./03-auth-jwt.md) |
| 4 | **Pagination, filtering, sorting** (offset + cursor) | [04-pagination-filtering-sorting.md](./04-pagination-filtering-sorting.md) |
| 5 | **AWS integration:** DynamoDB CRUD + S3 pre-signed uploads + SQS async | [05-aws-integration.md](./05-aws-integration.md) |
| 6 | **Deploy:** Express on Lambda + API Gateway (and Fargate note) | [06-deploy-lambda-apigateway.md](./06-deploy-lambda-apigateway.md) |

## Principles applied
- **Thin controllers, logic in services**; async/await with `next(err)`.
- **Validate input** (security) and return a **consistent error shape**.
- **Correct status codes** and a **correlation id** on every request.
- **Stateless** (JWT) → horizontally scalable.
- **Don't proxy big files** — S3 pre-signed URLs; **offload slow work** to SQS (202 Accepted).
