# Docker Interview Questions — Advanced

[← Back to index](./README.md) · Context: **Node.js + AWS**

---

### Q1. Explain the PID 1 / signal-handling problem in Node containers.

**Answer.** The process started by `CMD` runs as **PID 1** in the container. PID 1 has special responsibilities: it must forward signals and reap zombie (orphaned) child processes. Two issues arise:
- **Shell form** `CMD node app.js` runs Node under `/bin/sh -c`, so the shell is PID 1 and **doesn't forward SIGTERM** to Node → `docker stop` waits then SIGKILLs → dropped requests.
- Node as PID 1 doesn't reap zombies if it spawns children.

**Fixes:**
- Use **exec form**: `CMD ["node", "dist/main.js"]` so Node is PID 1 and receives signals.
- Add a lightweight init like **`tini`** (`docker run --init`, or `ENTRYPOINT ["/sbin/tini","--"]`) to forward signals and reap zombies.

```dockerfile
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
```

**AWS note:** Correct signal handling is what makes ECS **graceful shutdown** (SIGTERM on deploy/scale-in/Spot reclaim) actually work — combined with the Node app trapping SIGTERM to drain.

---

### Q2. How does Docker achieve isolation (namespaces & cgroups)?

**Answer.** Containers aren't VMs — they're isolated processes on the shared host kernel:
- **Namespaces** isolate *what a process can see*: PID (process tree), NET (network), MNT (filesystem), UTS (hostname), IPC, USER (UID mapping).
- **cgroups (control groups)** limit *what a process can use*: CPU, memory, I/O.
- **Union filesystems** (overlay2) provide layered images + a writable layer.

**Lead-level note:** This is why containers are lightweight (no guest OS) but share a kernel (weaker isolation than VMs). **Fargate** runs each task in a micro-VM (Firecracker) to add VM-level isolation — relevant for multi-tenant security.

---

### Q3. What is distroless, and what are the trade-offs vs Alpine/slim?

**Answer.** **Distroless** images (`gcr.io/distroless/nodejs20`) contain only your app + the Node runtime — **no shell, no package manager, minimal OS**. Smallest attack surface and size.

Trade-offs:
- **+** Minimal CVEs, smallest footprint, secure by default (no shell to exploit).
- **−** Hard to debug (no `sh`/`exec` into it), no package manager. Use the `:debug` variant when troubleshooting.

| Base | Size | Debuggability | Native module risk |
|------|------|---------------|--------------------|
| `node:20` | large | easy | low |
| `node:20-slim` | medium | easy | low (glibc) |
| `node:20-alpine` | small | ok | **higher** (musl libc) |
| distroless | smallest | hard (no shell) | low (glibc) |

**Lead-level note:** Alpine's musl libc can break native addons and cause subtle issues; for Node, **slim** or **distroless** (glibc) is often safer than Alpine.

---

### Q4. What is BuildKit and what advanced features does it enable?

**Answer.** BuildKit is Docker's modern build engine (default in recent versions). Features:
- **Parallel** stage builds and better caching.
- **Cache mounts:** `RUN --mount=type=cache,target=/root/.npm npm ci` — persist npm cache across builds.
- **Build secrets:** `RUN --mount=type=secret,id=npmrc ...` — use a secret at build time without baking it into a layer.
- **Multi-platform builds:** `docker buildx build --platform linux/amd64,linux/arm64` — build for Graviton (ARM) + x86.

**AWS note:** Multi-platform matters for **Graviton (ARM64)** ECS/Fargate, which is cheaper/more efficient — build `linux/arm64` images with `buildx`.

---

### Q5. How do you secure a Docker image and the supply chain?

**Answer.**
- **Minimal base** (slim/distroless), **pin by digest** (`node:20-slim@sha256:...`) for reproducibility.
- **Non-root user**, read-only root filesystem, drop Linux capabilities.
- **Scan images** — ECR scanning, Trivy/Grype in CI; fail builds on critical CVEs.
- **No secrets in layers/ARG**; multi-stage to exclude build tooling/source.
- **Sign images** (Docker Content Trust / cosign) and generate an **SBOM**.
- Keep dependencies patched (`npm audit`, Dependabot).

**Lead-level note:** Supply-chain attacks (malicious npm packages, poisoned base images) are a top modern threat — institutionalize scanning gates + SBOMs, don't rely on ad-hoc checks.

---

### Q6. How does Docker fit into AWS orchestration (ECR → ECS/EKS)?

**Answer.** Docker builds the image; AWS runs it:
1. **Build** image (CI) → **push to ECR**.
2. **ECS/EKS** pulls the image and runs **tasks/pods** behind an ALB with autoscaling.
3. **ECS task role** = your app's runtime AWS permissions; **execution role** = ECS pulling the image + reading secrets + writing logs.
4. Logs → CloudWatch via `awslogs` driver; health checks → ALB target group.

```bash
aws ecr get-login-password | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
docker build -t <acct>.dkr.ecr.us-east-1.amazonaws.com/api:1.0 .
docker push <acct>.dkr.ecr.us-east-1.amazonaws.com/api:1.0
```

**Lead-level note:** The **task role vs execution role** distinction is a frequent interview probe — know it cold.

---

### Q7. How do you achieve zero-downtime deploys with containers?

**Answer.** Combine three things:
1. **Graceful shutdown** — Node traps SIGTERM, stops accepting new requests, drains in-flight, closes pools (within the orchestrator grace period).
2. **Connection draining** — ALB deregistration delay so the LB stops routing before the task exits; readiness probe flips to 503.
3. **Rolling or blue/green deploy** — new tasks pass health checks before old ones drain; CodeDeploy blue/green adds canary shifting + alarm-based auto-rollback.

Plus **backward-compatible (expand/contract) DB migrations** so old and new image versions run simultaneously during rollout.

---

### Q8. Why should containers be stateless, and how do you handle state?

**Answer.** Containers are **ephemeral** — any task can be killed/replaced at any time (deploys, scale-in, Spot reclaim, failures). If state lives in the container's filesystem, it's lost and the service can't scale horizontally.

**Handle state externally:**
- Sessions/cache → **ElastiCache (Redis)**.
- Files/uploads → **S3**.
- Relational/transactional → **RDS/Aurora** (via RDS Proxy).
- Key-value/high-scale → **DynamoDB**.
- Shared filesystem (if truly needed) → **EFS** volume.

**Lead-level note:** Statelessness is what enables horizontal scaling, rolling deploys, and resilience — call it out as a first-class design principle.

---

### Q9. How do you optimize containers for AWS Lambda (container image support)?

**Answer.** Lambda supports container images up to **10 GB**. Use the AWS base images (or implement the Runtime Interface) and keep the image lean to reduce cold starts.

```dockerfile
FROM public.ecr.aws/lambda/nodejs:20
COPY dist/ ${LAMBDA_TASK_ROOT}/
COPY node_modules/ ${LAMBDA_TASK_ROOT}/node_modules/
CMD ["index.handler"]   # the exported handler
```

**Lead-level note:** Container images suit large dependencies/custom runtimes that exceed the 250 MB zip limit; otherwise zip + esbuild bundling usually gives faster cold starts. Bundle aggressively either way.

---

### Q10. How do you handle multi-architecture (Graviton/ARM) builds?

**Answer.** Use `docker buildx` to build and push multi-arch images so the same tag works on x86 and ARM (Graviton) hosts.

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t <acct>.dkr.ecr.us-east-1.amazonaws.com/api:1.0 --push .
```

**AWS note:** **Graviton (ARM64)** Fargate/EC2 is typically ~20% cheaper and more power-efficient — building ARM images can cut compute cost meaningfully. Watch for native modules that need ARM-compatible binaries.

---

### Q11. What are common container anti-patterns?

**Answer.**
- **Fat images** (full base, devDeps, source) → use multi-stage + slim/distroless.
- **Running as root** → use a non-root user.
- **Secrets baked into images/ARG** → inject at runtime (Secrets Manager).
- **Shell-form CMD** → breaks signal handling → use exec form + tini.
- **Stateful containers** (writing important data to the local FS) → externalize state.
- **Multiple processes per container** → one process per container; let the orchestrator scale.
- **`latest` tag in production** → pin immutable versions/digests for reproducible, rollback-able deploys.
- **Logging to files** → log to stdout/stderr for CloudWatch.

---

### Q12. How do you debug a container that works locally but fails on ECS/Fargate?

**Answer.** Systematic checks:
1. **CloudWatch logs** for the task + the **stopped-task reason** (OOM, essential container exited, image pull failure).
2. **Memory:** OOM kill → raise task memory or tune `--max-old-space-size`.
3. **IAM:** missing **task role** permissions (app can't reach S3/DynamoDB) or **execution role** (can't pull image/read secrets).
4. **Networking:** security groups, subnets, NAT/VPC endpoints (egress to AWS APIs), ALB health-check path/port mismatch.
5. **Architecture mismatch:** image built for arm64 running on x86 (or vice versa).
6. **Health check:** readiness path returns non-200 → ECS kills the task in a loop.

**Lead-level note:** "Works locally, fails on ECS" is almost always **IAM, memory, networking, health-check, or architecture** — enumerate them methodically rather than guessing.
