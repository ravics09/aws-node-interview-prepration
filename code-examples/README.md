# Code Examples

Runnable, lead-level reference implementations of the patterns discussed in the [interview guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). Each file is heavily commented to explain *why*, not just *how*.

> These are illustrative reference snippets (TypeScript). They assume Node.js 18+ and the relevant packages installed (see each file's header). They are written to be copy-paste adaptable, not as a single buildable project.

## Index

| File | Pattern | Related questions |
|------|---------|-------------------|
| [graceful-shutdown.ts](./graceful-shutdown.ts) | SIGTERM-driven graceful shutdown / connection draining | Q9 |
| [circuit-breaker-opossum.ts](./circuit-breaker-opossum.ts) | Circuit breaker + fallback with `opossum` | Q50 |
| [retry-with-backoff-jitter.ts](./retry-with-backoff-jitter.ts) | Exponential backoff + full jitter retry | Q48 |
| [concurrency-limit.ts](./concurrency-limit.ts) | Bounded concurrency for fan-out work | Q14 |
| [idempotency-dynamodb.ts](./idempotency-dynamodb.ts) | Idempotency keys via DynamoDB conditional writes | Q49 |
| [presigned-s3-upload.ts](./presigned-s3-upload.ts) | Direct-to-S3 uploads via pre-signed URLs | Q43 |
| [nestjs/jwt-auth.guard.ts](./nestjs/jwt-auth.guard.ts) | JWT verification guard (Cognito JWKS) | Q22, Q78 |
| [nestjs/roles.guard.ts](./nestjs/roles.guard.ts) | Role-based authorization guard | Q22 |
| [nestjs/roles.decorator.ts](./nestjs/roles.decorator.ts) | `@Roles()` metadata decorator | Q18, Q22 |
| [nestjs/all-exceptions.filter.ts](./nestjs/all-exceptions.filter.ts) | Centralized exception filter with correlation IDs | Q13, Q30 |
| [nestjs/correlation-id.middleware.ts](./nestjs/correlation-id.middleware.ts) | Request correlation via `AsyncLocalStorage` | Q29 |
| [cdk/fargate-service-stack.ts](./cdk/fargate-service-stack.ts) | ECS Fargate service + ALB + autoscaling (AWS CDK) | Q40, Q44, Q46 |
