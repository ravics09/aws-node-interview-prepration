# Use Case 1 — Dockerize a Node / NestJS App for Production

[← Back to index](./README.md)

**Goal:** produce a small, secure, AWS-ready image for a NestJS/Express app, with correct signal handling for graceful shutdown.

## Multi-stage Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# ---- 1) build stage: compile TS, install ALL deps ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci   # BuildKit cache for faster rebuilds
COPY . .
RUN npm run build                                  # tsc -> dist/

# ---- 2) deps stage: production-only node_modules ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- 3) runtime stage: minimal, non-root ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=384   # ~75-80% of a 512MB task
WORKDIR /app
# tini for proper PID 1 signal forwarding + zombie reaping
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=deps  /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist         ./dist
COPY --chown=node:node package*.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","dist/main.js"]     # exec form -> SIGTERM reaches Node
```

## .dockerignore

```
node_modules
dist
.git
.env
coverage
test
*.md
Dockerfile
docker-compose*.yml
```

## Graceful shutdown in the app (NestJS)

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();            // lifecycle hooks fire on SIGTERM
  await app.listen(3000);
}
bootstrap();

// A provider drains on shutdown:
@Injectable()
export class Db implements OnApplicationShutdown {
  async onApplicationShutdown() { await this.pool.end(); }  // close connections
}
```
For Express, trap SIGTERM and `server.close()` to drain in-flight requests before exit.

## Build & run locally

```bash
DOCKER_BUILDKIT=1 docker build -t my-api:1.0 .
docker run --rm -p 3000:3000 -e NODE_ENV=production --init my-api:1.0
docker run --rm my-api:1.0 node -v        # sanity check
```

## Why this is production-ready
- **Multi-stage** → final image has no TypeScript/devDeps/source, just `dist` + prod `node_modules`.
- **`node:20-slim`** (glibc) avoids Alpine/musl native-module pitfalls.
- **Non-root (`USER node`)** + `--chown` for least privilege.
- **`tini` + exec-form CMD** → SIGTERM reaches Node for **graceful shutdown** (zero-downtime on ECS).
- **HEALTHCHECK** wired to a readiness endpoint the ALB can also use.
- **`--max-old-space-size`** matched to the container memory limit to avoid OOM kills.
