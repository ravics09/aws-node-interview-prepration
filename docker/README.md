# Docker — Lead Interview Prep (Node.js + AWS)

Everything Docker for a **Lead / Senior Backend** interview, focused on how containers are actually built and run for **Node.js services on AWS** (ECR, ECS Fargate, EKS, Lambda container images).

## Categories

| Folder | What's inside |
|--------|---------------|
| [`interview-questions/`](./interview-questions/README.md) | Basic / Medium / Advanced questions with **detailed answers + code** (Node + AWS) |
| [`cheatsheet/`](./cheatsheet/docker-cheatsheet.md) | Dense, high-recall Docker command & Dockerfile reference |
| [`usecases-node-aws/`](./usecases-node-aws/README.md) | Real Node + AWS use cases **with code** (dockerize, compose, ECR, Fargate, CI/CD, Lambda images) |
| [`rapid-fire/`](./rapid-fire/docker-rapid-fire.md) | Quick one-line Q&A definitions for fast recall |

## The 10 things a lead must nail about Docker
1. **Image vs container**, layers, and **layer caching** (copy `package*.json` before source).
2. **Multi-stage builds** to produce small production images.
3. **Small, secure base images** (slim/distroless), **non-root user**, pinned versions.
4. **`.dockerignore`** (exclude `node_modules`, `.git`, `.env`).
5. **Signal handling / PID 1** so SIGTERM reaches Node for **graceful shutdown** (use `tini`/exec form).
6. **Stateless containers** — state in S3/RDS/DynamoDB, not the container filesystem.
7. **Log to stdout/stderr** → CloudWatch via the `awslogs` driver.
8. **ECR** for registry + image scanning; **task role vs execution role** on ECS.
9. **HEALTHCHECK** / readiness wired to the ALB target group.
10. **One process per container**; let the orchestrator (ECS/EKS) scale tasks.

## Related material in this repo
- AWS ECS/Fargate practical guide: [../practical-usecases/02-amazon-ecs-fargate.md](../practical-usecases/02-amazon-ecs-fargate.md)
- AWS reference pack: [../aws/README.md](../aws/README.md)
- Main 100-question guide (Q15, Q40 cover images/deploys): [../guide/AWS-NodeJS-Lead-Interview-100-Questions.md](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md)
