# Docker with Node.js + AWS — Use Cases (with code)

End-to-end, practical Docker workflows for running Node.js on AWS — each with copy-adaptable code. Goes from "dockerize the app" to "deploy on Fargate" to "ship via CI/CD."

| # | Use case | File |
|---|----------|------|
| 1 | **Dockerize a Node/NestJS app** (production multi-stage image + graceful shutdown) | [01-dockerize-node-app.md](./01-dockerize-node-app.md) |
| 2 | **Local dev with Docker Compose** (app + Postgres + Redis + LocalStack for AWS) | [02-local-dev-compose.md](./02-local-dev-compose.md) |
| 3 | **Build & push to Amazon ECR** | [03-build-push-ecr.md](./03-build-push-ecr.md) |
| 4 | **Deploy to ECS Fargate** (task definition, roles, logs, health checks) | [04-deploy-ecs-fargate.md](./04-deploy-ecs-fargate.md) |
| 5 | **CI/CD + Lambda container images** (GitHub Actions build/push/deploy; Lambda images) | [05-cicd-and-lambda-images.md](./05-cicd-and-lambda-images.md) |

## The mental model
```
Code -> Dockerfile -> image -> ECR -> ECS Fargate / EKS / Lambda (container) -> CloudWatch logs
        (multi-stage)         (registry)   (orchestrator runs tasks behind ALB)
```

## Principles applied throughout
- **Small, secure images** (multi-stage, slim/distroless, non-root).
- **Stateless containers** — state in S3/RDS/DynamoDB.
- **Secrets at runtime** from Secrets Manager/SSM (never baked in).
- **Graceful shutdown** (SIGTERM) for zero-downtime deploys.
- **Logs to stdout/stderr** → CloudWatch.
