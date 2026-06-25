# Example 6 — Deploy Express on Lambda + API Gateway (and Fargate)

[← Back to index](./README.md)

Two production paths for an Express REST API on AWS: **serverless (Lambda + API Gateway)** for spiky traffic, and **containers (Fargate + ALB)** for steady traffic.

## Path A — Express on AWS Lambda (behind API Gateway)

Wrap the existing Express `app` with an adapter; cache it across warm invocations.

```js
// lambda.js
const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./app');   // your existing Express app (example 1)

let cachedHandler;
exports.handler = (event, context) => {
  // Built once per execution environment, reused on warm invocations (faster).
  cachedHandler = cachedHandler || serverlessExpress({ app });
  return cachedHandler(event, context);
};
```

### SAM template (API Gateway + Lambda)

```yaml
# template.yaml
Transform: AWS::Serverless-2016-10-31
Resources:
  ApiFn:
    Type: AWS::Serverless::Function
    Properties:
      Handler: lambda.handler
      Runtime: nodejs20.x
      MemorySize: 512
      Timeout: 29                 # API Gateway max integration timeout
      Architectures: [arm64]      # Graviton — cheaper
      Environment:
        Variables: { NODE_ENV: production, TABLE: !Ref Table }
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref Table }   # least-privilege
      Events:
        Api:
          Type: HttpApi           # HTTP API (cheaper/faster than REST API)
          Properties: { Path: /{proxy+}, Method: ANY }
  Table:
    Type: AWS::Serverless::SimpleTable
```

```bash
sam build && sam deploy --guided
```

**When to use Lambda:** spiky/low-baseline traffic, scale-to-zero, minimal ops. Watch **cold starts** (bundle with esbuild, init clients outside the handler) and use **RDS Proxy** if you use a relational DB.

## Path B — Express on ECS Fargate (behind an ALB)

For steady/high-RPS or WebSocket workloads. Build a small image (see `../../docker/usecases-node-aws/01-dockerize-node-app.md`), push to ECR, run as a Fargate service behind an ALB with autoscaling.

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./ && RUN npm ci
COPY . . && RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./ && RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
```

Autoscale on **ALB requests-per-target**; health check → `/health/ready`; graceful shutdown on SIGTERM.

## Choosing Lambda vs Fargate

| Factor | Lambda + API Gateway | Fargate + ALB |
|--------|----------------------|---------------|
| Traffic | spiky / low baseline | steady / high RPS |
| Scaling | instant, to zero | autoscale (warm-up lag) |
| Cost | per-request (cheap when idle) | per running task (cheaper when busy) |
| Cold starts | yes (mitigate) | none |
| WebSockets | API GW WebSocket API | native on ALB |
| Long requests | ≤ 29s (API GW) / 15min Lambda | unlimited |

## Edge & security (both paths)
- Front with **CloudFront + WAF** (rate rules, SQLi/XSS, bot control).
- Auth at the edge (**API Gateway Cognito/JWT authorizer**) + fine-grained checks in Express.
- Secrets from **Secrets Manager/SSM** via the function/task **role** — never baked in.

## Lead-level notes
- Choose by **traffic shape**; many systems are hybrid (Lambda for async/glue, Fargate for the core API).
- **HTTP API** > REST API on API Gateway unless you need usage plans/API keys/request validation.
- **Graviton (arm64)** cuts cost ~20% — build arm64 images / set Lambda `Architectures: [arm64]`.
