# Amazon ECS + AWS Fargate + Node.js

## What it is
ECS is a container orchestrator; **Fargate** is the serverless compute engine that runs your containers without you managing EC2 hosts. You package your Node.js app as a Docker image and ECS runs it as **tasks** behind a load balancer.

## How we use it with Node.js
You containerize a long-running Node app (Express/NestJS), push the image to **ECR**, define a **task definition** (image, CPU/memory, env, secrets, IAM roles, logging), and run it as an ECS **service** behind an **ALB** with autoscaling.

## For what purpose (real use cases)
- **Long-running APIs / NestJS services** with steady or autoscaled traffic.
- **WebSocket servers** and stateful connections (with a Redis backplane).
- **Background worker fleets** consuming SQS/Kinesis.
- Workloads that don't fit Lambda (>15 min, large memory, persistent connections).

## Code

### 1. Production Dockerfile (multi-stage, small, non-root)
```dockerfile
# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build            # compiles TS -> dist

# ---- runtime stage ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node                    # run as non-root
EXPOSE 3000
# tini ensures SIGTERM reaches Node for graceful shutdown
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
```

### 2. Graceful shutdown (critical on ECS — SIGTERM on deploy/scale-in)
```ts
import express from 'express';
const app = express();
let shuttingDown = false;

app.get('/health/ready', (_req, res) =>
  res.status(shuttingDown ? 503 : 200).json({ status: shuttingDown ? 'draining' : 'ok' }),
);

const server = app.listen(3000);

process.on('SIGTERM', () => {
  shuttingDown = true;               // ALB health check fails -> stop new traffic
  server.close(async () => {
    await closePools();              // drain DB/queue connections
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25_000); // hard cap < ECS stopTimeout
});
```

### 3. Reading config/secrets injected by ECS
```ts
// In the task definition, secrets are injected as env vars from Secrets Manager:
//   "secrets": [{ "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:...:secret:prod/db" }]
const dbPassword = process.env.DB_PASSWORD!;   // resolved at runtime, not baked in image
const dbHost = process.env.DB_HOST!;
```

### 4. Consuming SQS in a long-running worker container
```ts
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
const sqs = new SQSClient({});
const QUEUE = process.env.QUEUE_URL!;

async function poll() {
  while (!shuttingDown) {
    const { Messages } = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: QUEUE, MaxNumberOfMessages: 10, WaitTimeSeconds: 20, // long polling
    }));
    for (const m of Messages ?? []) {
      try {
        await handle(JSON.parse(m.Body!));
        await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE, ReceiptHandle: m.ReceiptHandle! }));
      } catch (e) { /* leave message -> visibility timeout -> retry -> DLQ */ }
    }
  }
}
poll();
```

## Lead-level notes & gotchas
- **One Node process per container**; let ECS scale **tasks** (don't run the `cluster` module inside an autoscaled container).
- **Autoscale on ALB requests-per-target** (Node is often I/O-bound, so CPU is a poor signal alone).
- **Graceful shutdown + ALB deregistration delay** = zero-downtime deploys.
- **Task role** (app permissions) ≠ **execution role** (pull image, read secrets).
- Set `--max-old-space-size` to ~75–80% of the task memory limit to avoid OOM kills.
- **Fargate Spot** for stateless/queue-driven workers to cut cost.
- Pricier than EC2 at very high steady utilization — consider ECS-on-EC2/Spot then.
