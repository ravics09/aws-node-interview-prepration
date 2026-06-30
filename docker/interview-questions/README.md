# Docker Interview Questions — Basic / Medium / Advanced

Docker interview questions with **detailed explanations and code**, framed for a **Node.js + AWS** backend lead. Split by difficulty so you can ramp up.

| Level | Focus | File |
|-------|-------|------|
| **Basic** | Images vs containers, Dockerfile, layers, volumes, registries, ports/env | [01-basic.md](./01-basic.md) |
| **Medium** | Multi-stage builds, caching, networking, compose, healthchecks, image size/security | [02-medium.md](./02-medium.md) |
| **Advanced** | Signals/PID 1, orchestration (ECS/EKS), distroless, BuildKit, security hardening, debugging | [03-advanced.md](./03-advanced.md) |

## How to answer Docker questions well (lead signal)
- Tie answers to **production on AWS** (ECR, ECS Fargate, task definitions, CloudWatch logs).
- Emphasize **small images, layer caching, non-root, multi-stage builds, and signal handling** — these are what separate a hobbyist from someone who ships containers at scale.
- Mention **statelessness** (state in S3/RDS/DynamoDB, not the container) and **graceful shutdown** (SIGTERM) repeatedly — they recur across questions.

## Related
- Cheat sheet: [../cheatsheet/docker-cheatsheet.md](../cheatsheet/docker-cheatsheet.md)
- Node + AWS use cases with code: [../usecases-node-aws/README.md](../usecases-node-aws/README.md)
- Rapid fire: [../rapid-fire/docker-rapid-fire.md](../rapid-fire/docker-rapid-fire.md)
