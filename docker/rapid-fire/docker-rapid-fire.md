# Docker Rapid Fire (Node.js + AWS)

Quick one- to two-line answers for fast recall. For depth, see the [interview questions](../interview-questions/README.md).

---

## Fundamentals
1. **Image vs container?** Image = immutable template; container = a running instance of it.
2. **Container vs VM?** Container shares the host kernel (lightweight, ms startup); VM runs a full guest OS (heavy).
3. **What isolates containers?** Linux **namespaces** (what it sees) + **cgroups** (what it can use).
4. **What is a layer?** One filesystem diff per Dockerfile instruction; cached and shared.
5. **`CMD` vs `ENTRYPOINT`?** ENTRYPOINT = fixed executable; CMD = default/overridable args.
6. **`COPY` vs `ADD`?** Use COPY; ADD also extracts tars and fetches URLs (avoid unless needed).
7. **`EXPOSE` vs `-p`?** EXPOSE documents the port; `-p`/task def actually publishes it.
8. **What is `.dockerignore`?** Excludes files from build context (exclude `node_modules`, `.git`, `.env`).
9. **Where do container logs go?** stdout/stderr → `docker logs` → CloudWatch via `awslogs` on ECS.
10. **What is a registry / ECR?** Stores images; ECR is AWS's private registry with IAM + scanning.

## Dockerfile & builds
11. **Multi-stage build?** Build in one stage, copy only artifacts to a small runtime stage.
12. **Best Node layer-caching trick?** Copy `package*.json` and `npm ci` before copying source.
13. **`npm ci` vs `npm install` in builds?** `ci` is clean, reproducible from the lockfile — use it.
14. **Shrink a Node image?** Multi-stage + slim/distroless + `--omit=dev` + `.dockerignore`.
15. **Exec vs shell form CMD?** Exec form `["node","app.js"]` so signals reach Node (shell form breaks SIGTERM).
16. **BuildKit cache mount?** `RUN --mount=type=cache,target=/root/.npm npm ci` persists npm cache.
17. **Multi-arch builds?** `docker buildx --platform linux/amd64,linux/arm64` (for Graviton/ARM).
18. **Pin base images?** By digest (`node:20-slim@sha256:...`) for reproducibility.

## Runtime & ops
19. **`docker stop` vs `kill`?** stop = SIGTERM then SIGKILL (graceful); kill = SIGKILL now.
20. **PID 1 problem?** PID 1 must forward signals/reap zombies — use exec form + `tini`/`--init`.
21. **Set memory limit?** `--memory=512m`; set Node `--max-old-space-size` ~75–80% of it.
22. **Volume vs bind mount?** Volume = Docker-managed persistence; bind mount = host path (dev).
23. **tmpfs?** In-memory mount, never hits disk (ephemeral/sensitive data).
24. **HEALTHCHECK purpose?** Lets Docker/orchestrator know if the container is healthy → route/restart.
25. **Why one process per container?** Simpler lifecycle/logs/scaling; orchestrator scales tasks.

## Networking
26. **Default network mode?** bridge.
27. **Reach another container by name?** Use a user-defined bridge / Compose network (DNS).
28. **host network mode?** Shares host network stack — no isolation, highest perf.
29. **ECS network mode?** `awsvpc` — each task gets its own ENI/IP in your VPC.

## Security
30. **Run as root?** No — use a non-root user (`USER node`).
31. **Secrets in images?** Never — inject at runtime via Secrets Manager/SSM (ECS task `secrets`).
32. **Secrets via ARG?** No — visible in build history; use BuildKit `--mount=type=secret`.
33. **Scan images?** ECR scanning / Trivy in CI; fail on critical CVEs.
34. **Smallest attack surface base?** Distroless (no shell, no package manager).
35. **Alpine caveat for Node?** musl libc can break native modules — prefer `slim` (glibc).
36. **Read-only filesystem?** `--read-only` / ECS `readonlyRootFilesystem` to harden.

## AWS integration
37. **Build → run on AWS flow?** Build → push to **ECR** → ECS/EKS pulls and runs tasks/pods.
38. **Task role vs execution role?** Task role = app's runtime perms; execution role = pull image + read secrets + logs.
39. **Where are ports/env/secrets set on ECS?** In the **task definition**, not `docker run`.
40. **Zero-downtime deploy ingredients?** Graceful SIGTERM shutdown + ALB connection draining + rolling/blue-green + backward-compatible migrations.
41. **Container state on Fargate?** Keep stateless — state in S3/RDS/DynamoDB; EFS for shared files.
42. **Lambda container images?** Supported up to 10 GB; use `public.ecr.aws/lambda/nodejs` base.
43. **Graviton benefit?** ARM64 Fargate/EC2 ~20% cheaper — build arm64 images with buildx.
44. **`:latest` in prod?** No — pin immutable tags/digests for reproducible deploys + rollback.
45. **"Works locally, fails on ECS" — first checks?** IAM (task/exec role), memory/OOM, networking/SGs, health-check path, CPU arch mismatch.

## Compose & local dev
46. **What is Compose for?** Multi-container **local dev**/tests (app + Postgres + Redis + LocalStack).
47. **Is Compose the prod runtime?** No — ECS/EKS are; Compose is dev/CI.
48. **`docker compose down -v`?** Stops and removes volumes (wipes local data).
49. **Wait for a dependency?** `depends_on` + a `healthcheck` (condition: service_healthy).
50. **Hot reload in dev?** Bind-mount source + run a watcher (`nest start --watch`).
