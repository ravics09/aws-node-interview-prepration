# Docker Cheat Sheet (Node.js + AWS)

Dense, high-recall reference. For detailed explanations see [../interview-questions/](../interview-questions/README.md).

---

## Images

```bash
docker build -t app:1.0 .                 # build from ./Dockerfile
docker build -t app:1.0 --target build .  # build up to a specific stage
docker build --no-cache --progress=plain .# full output, no cache (debug)
docker images                             # list images
docker rmi app:1.0                        # remove image
docker tag app:1.0 <acct>.dkr.ecr.us-east-1.amazonaws.com/app:1.0
docker history app:1.0                    # inspect layers/size
docker image prune -a                     # remove unused images
```

## Containers

```bash
docker run -d -p 8080:3000 --name api \
  -e NODE_ENV=production --env-file .env \
  --cpus=1 --memory=512m --init app:1.0
docker ps [-a]            # running [all] containers
docker logs -f api        # stream logs
docker exec -it api sh    # shell in
docker stop api           # SIGTERM then SIGKILL (graceful)
docker kill api           # SIGKILL now
docker rm api             # remove stopped container
docker inspect api        # full JSON
docker stats              # live resource usage
docker cp api:/app/x .    # copy file out
```

## Dockerfile instructions

```dockerfile
FROM node:20-slim AS build   # base / stage name
WORKDIR /app                 # cwd
ARG VERSION                  # build-time variable (NOT for secrets)
ENV NODE_ENV=production       # runtime env var
COPY package*.json ./         # copy (prefer over ADD)
RUN npm ci --omit=dev         # build-time command (a layer)
COPY --chown=node:node . .    # copy with ownership
EXPOSE 3000                   # document port (doesn't publish)
USER node                     # drop root
HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["node"]           # fixed executable (exec form!)
CMD ["dist/main.js"]          # default args / command
```
- **Exec form** `["node","app.js"]` → signals reach the process (use this).
- **Shell form** `node app.js` → runs under `/bin/sh`, breaks SIGTERM.

## Node multi-stage Dockerfile (production)

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=384
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","dist/main.js"]
```

## .dockerignore (Node)

```
node_modules
dist
.git
.env
npm-debug.log
coverage
test
*.md
```

## Volumes & networks

```bash
docker volume create pgdata
docker run -v pgdata:/var/lib/postgresql/data postgres   # named volume
docker run -v $(pwd):/app node:20                         # bind mount (dev)
docker network create app-net
docker run --network app-net --name db postgres           # reachable as "db"
docker network ls
```

## Docker Compose

```bash
docker compose up -d        # start (detached)
docker compose up --build   # rebuild + start
docker compose logs -f api  # logs for a service
docker compose ps           # status
docker compose down [-v]    # stop [+ remove volumes]
docker compose exec api sh  # shell into a service
```

## BuildKit (advanced)

```bash
DOCKER_BUILDKIT=1 docker build .
# cache mount (persist npm cache):  RUN --mount=type=cache,target=/root/.npm npm ci
# build secret:                     RUN --mount=type=secret,id=npmrc ...
docker buildx build --platform linux/amd64,linux/arm64 -t app:1.0 --push .  # multi-arch (Graviton)
```

## AWS ECR (push/pull)

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
docker build -t <acct>.dkr.ecr.us-east-1.amazonaws.com/api:1.0 .
docker push <acct>.dkr.ecr.us-east-1.amazonaws.com/api:1.0
aws ecr create-repository --repository-name api
```

## Cleanup

```bash
docker system df            # disk usage
docker system prune -a      # remove unused images/containers/networks
docker volume prune         # remove unused volumes
docker builder prune        # clear build cache
```

## Base image quick pick (Node)

| Base | Use |
|------|-----|
| `node:20` | dev / simplicity (large) |
| `node:20-slim` | **production default** (glibc, small, safe with native modules) |
| `node:20-alpine` | smallest official, but **musl** can break native addons |
| `gcr.io/distroless/nodejs20` | most secure/minimal, **no shell** (hard to debug) |
| `public.ecr.aws/lambda/nodejs:20` | Lambda container images |

## Production gotchas (memorize)
- **Exec-form CMD + `tini`** so SIGTERM reaches Node → graceful shutdown.
- **Multi-stage + slim/distroless + non-root** for small, secure images.
- **Copy `package*.json` before source** for layer caching.
- **No secrets in image/ARG/ENV** — inject at runtime (Secrets Manager).
- **Stateless containers** — state in S3/RDS/DynamoDB.
- **Log to stdout/stderr** → CloudWatch `awslogs`.
- **`--max-old-space-size`** ≈ 75–80% of container memory.
- **Pin versions/digests**, never deploy `:latest` to prod.
- **One process per container**; orchestrator scales tasks.
- **ECS: task role (app) ≠ execution role (pull image/secrets).**
