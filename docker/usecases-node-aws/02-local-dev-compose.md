# Use Case 2 — Local Dev with Docker Compose (Node + Postgres + Redis + LocalStack)

[← Back to index](./README.md)

**Goal:** a one-command local environment that mirrors production dependencies — Postgres, Redis, and **LocalStack** (local AWS: S3, SQS, DynamoDB) — with hot reload for the Node app.

## docker-compose.yml

```yaml
services:
  api:
    build:
      context: .
      target: build              # use the build stage for dev (has devDeps)
    command: npm run start:dev     # nest start --watch (hot reload)
    ports: ["3000:3000"]
    volumes:
      - .:/app                     # bind-mount source for live reload
      - /app/node_modules          # keep container's node_modules
    environment:
      NODE_ENV: development
      DATABASE_URL: postgres://app:pass@db:5432/app
      REDIS_URL: redis://cache:6379
      AWS_ENDPOINT: http://localstack:4566   # point AWS SDK at LocalStack
      AWS_REGION: us-east-1
      AWS_ACCESS_KEY_ID: test
      AWS_SECRET_ACCESS_KEY: test
    depends_on:
      db: { condition: service_healthy }
      cache: { condition: service_started }
      localstack: { condition: service_started }

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: app
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5

  cache:
    image: redis:7
    ports: ["6379:6379"]

  localstack:
    image: localstack/localstack
    ports: ["4566:4566"]
    environment:
      SERVICES: s3,sqs,dynamodb
    volumes: ["./localstack-init:/etc/localstack/init/ready.d"]  # bootstrap scripts

volumes:
  pgdata:
```

## Point the AWS SDK v3 at LocalStack

```ts
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  // only set endpoint locally; in prod leave it undefined to hit real AWS
  endpoint: process.env.AWS_ENDPOINT || undefined,
  forcePathStyle: !!process.env.AWS_ENDPOINT,   // required for LocalStack S3
});
```

## Bootstrap LocalStack resources (localstack-init/ready.d/init.sh)

```bash
#!/bin/bash
awslocal s3 mb s3://uploads
awslocal sqs create-queue --queue-name jobs
awslocal dynamodb create-table --table-name items \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## Run it

```bash
docker compose up --build       # start everything
docker compose logs -f api      # watch the app
docker compose exec db psql -U app   # poke the DB
docker compose down -v          # stop + wipe volumes
```

## Why this matters
- **Parity:** dev mirrors prod dependencies (Postgres/Redis/AWS), catching integration bugs early.
- **LocalStack** lets you develop S3/SQS/DynamoDB code **offline** with no AWS cost; the SDK only needs an `endpoint` override locally.
- **Bind mount + watch** gives hot reload; the anonymous `node_modules` volume prevents the host overwriting container deps.
- **healthcheck + depends_on** ensures the app waits for the DB to be ready.
