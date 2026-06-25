# Docker Interview Questions — Medium

[← Back to index](./README.md) · Context: **Node.js + AWS**

---

### Q1. What is a multi-stage build and why is it essential for Node apps?

**Answer.** A multi-stage build uses multiple `FROM` stages in one Dockerfile: a **build stage** with full toolchain (TypeScript compiler, devDependencies) and a **runtime stage** that copies only the compiled output + production dependencies. The final image is small and free of build tooling.

```dockerfile
# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci                      # includes devDeps (typescript, etc.)
COPY . .
RUN npm run build               # tsc -> dist/

# ---- runtime (small, clean) ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist   # only the compiled artifacts
USER node
CMD ["node", "dist/main.js"]
```

**Why it matters:** smaller images = faster ECR pulls, faster ECS/EKS scale-out, smaller attack surface, no dev tooling/source in production.

---

### Q2. How does build cache work and how do you optimize it for Node?

**Answer.** Docker caches each layer; a layer rebuilds only if its instruction or inputs change, and **all subsequent layers** rebuild too. So order instructions from least- to most-frequently-changing.

**Node optimization:** dependencies change rarely, source changes constantly → install deps first.

```dockerfile
COPY package*.json ./
RUN npm ci            # cached unless package.json/lock changes
COPY . .              # source changes don't bust the deps layer
RUN npm run build
```
With **BuildKit cache mounts** you can also cache the npm cache across builds:
```dockerfile
RUN --mount=type=cache,target=/root/.npm npm ci
```

---

### Q3. How do you reduce Node.js Docker image size?

**Answer.**
- **Multi-stage builds** (ship only `dist` + prod deps).
- **Smaller base image:** `node:20-slim`, Alpine, or **distroless** (`gcr.io/distroless/nodejs20`).
- **`npm ci --omit=dev`** (no devDependencies).
- **`.dockerignore`** to keep the build context lean.
- Combine `RUN` commands and clean caches in the same layer (`npm cache clean`, `rm -rf /var/lib/apt/lists/*`).
- Bundle with **esbuild/webpack** to ship fewer files (great for Lambda images too).

**Lead-level note:** Watch **Alpine + native modules** — musl libc can break native addons; `slim` (glibc) is often safer. Distroless gives the smallest secure footprint but no shell (harder to debug).

---

### Q4. Explain Docker networking modes.

**Answer.**
- **bridge** (default) — containers on a private virtual network on the host; published ports expose them.
- **host** — container shares the host's network stack (no isolation, highest perf).
- **none** — no networking.
- **user-defined bridge** — custom network where containers reach each other by **name** (DNS) — used by Compose.
- **overlay** — multi-host networking (Swarm/orchestrators).

```bash
docker network create app-net
docker run --network app-net --name db postgres
docker run --network app-net my-api   # can reach "db:5432" by name
```

**AWS note:** On ECS, tasks typically use **awsvpc** mode (each task gets its own ENI/IP in your VPC), and services talk via ALB / Cloud Map service discovery.

---

### Q5. What is Docker Compose and when do you use it?

**Answer.** Compose defines and runs **multi-container** apps via a YAML file — ideal for **local development** (app + Postgres + Redis + LocalStack) and integration tests.

```yaml
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment: { DATABASE_URL: postgres://user:pass@db:5432/app }
    depends_on: { db: { condition: service_healthy } }
  db:
    image: postgres:16
    environment: { POSTGRES_PASSWORD: pass }
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
```
```bash
docker compose up -d
```

**AWS note:** Compose is for **local/dev**; in production you use **ECS/EKS** (Compose maps conceptually to an ECS task/service but isn't the production runtime).

---

### Q6. How do you implement a HEALTHCHECK and why?

**Answer.** `HEALTHCHECK` tells Docker how to test if the container is healthy; orchestrators use it to route/restart.

```dockerfile
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
```

**AWS note:** On ECS you usually configure the health check in the **task definition** (container healthCheck) and the **ALB target group** points at `/health/ready`. Separate **liveness** (restart) from **readiness** (route) endpoints.

---

### Q7. How do you handle secrets and configuration in Docker?

**Answer.**
- **Never** bake secrets into images or `ENV` in the Dockerfile (they leak via image layers / `docker inspect`).
- Local: `--env-file`, Docker/Compose secrets.
- **AWS production:** inject at runtime via ECS task definition **`secrets`** from **Secrets Manager / SSM** (resolved when the task starts), and grant access via the **execution role**.

```jsonc
// ECS task definition snippet
"secrets": [{ "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:...:secret:prod/db" }]
```

**Lead-level note:** Build-time `ARG` is also visible in history — never pass secrets via `ARG`. Use BuildKit `--mount=type=secret` if a secret is truly needed at build time.

---

### Q8. How do you run a container as a non-root user, and why?

**Answer.** Running as root inside a container is a security risk (container escape → host impact). The official Node image provides a `node` user.

```dockerfile
# ensure files are owned correctly, then drop privileges
COPY --chown=node:node --from=build /app/dist ./dist
USER node
```

**Lead-level note:** Non-root is a baseline hardening step; combine with read-only root filesystem (`--read-only`), dropping Linux capabilities, and ECS task `readonlyRootFilesystem`.

---

### Q9. What are bind mounts vs named volumes vs tmpfs?

**Answer.**
- **Bind mount** — maps a host path into the container (great for **local dev** hot reload). Tightly coupled to host layout.
- **Named volume** — Docker-managed storage that persists independently (databases in dev).
- **tmpfs** — in-memory, never written to disk (sensitive/ephemeral data).

**AWS note:** On Fargate, persistent shared storage uses **EFS volumes** attached to tasks; for object data prefer **S3**. Containers themselves stay stateless.

---

### Q10. How do you set CPU/memory limits and why does it matter for Node?

**Answer.**
```bash
docker run --cpus=1 --memory=512m my-node-api
```
Limits prevent one container from starving others (the "noisy neighbor" problem).

**Node-specific:** V8's heap isn't automatically aware of the container memory limit — set `--max-old-space-size` to ~75–80% of the limit so V8 garbage-collects before the kernel OOM-kills the container.

```dockerfile
ENV NODE_OPTIONS=--max-old-space-size=384   # for a 512MB container
```

**AWS note:** On ECS you set `cpu`/`memory` at the task/container level; match `--max-old-space-size` to the task's memory.

---

### Q11. What's the difference between stopping, killing, and removing a container?

**Answer.**
- `docker stop` — sends **SIGTERM**, waits (default 10s), then **SIGKILL**. Allows graceful shutdown.
- `docker kill` — sends **SIGKILL** immediately (no cleanup).
- `docker rm` — removes a stopped container.

**Node + AWS angle:** Your Node app should trap **SIGTERM** to drain in-flight requests and close DB/queue connections. ECS sends SIGTERM on deploy/scale-in (with a configurable `stopTimeout`), so graceful shutdown = zero-downtime deploys.

---

### Q12. How do you debug a failing build or container?

**Answer.**
- **Build:** `docker build --progress=plain --no-cache .` to see full output; build up to a stage with `--target`; check `.dockerignore`.
- **Runtime:** `docker logs`, `docker exec -it <id> sh` to poke around, `docker inspect` for config, `docker stats` for resource pressure.
- A container that "exits immediately" usually means the main process crashed or finished — check `docker logs` and ensure `CMD` runs a long-lived process.

**AWS note:** On ECS, check the **CloudWatch log group** for the task and the **stopped task reason** (e.g., "OutOfMemory", "essential container exited") in the ECS console/API.
