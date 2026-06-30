# Use Case 5 — CI/CD Pipeline + Lambda Container Images

[← Back to index](./README.md)

**Goal:** automate build → scan → push → deploy with GitHub Actions (OIDC, no static keys), and show how to package a Node app as a **Lambda container image**.

## Part A — GitHub Actions: build, push to ECR, deploy to ECS

```yaml
name: deploy
on:
  push: { branches: [main] }

permissions:
  id-token: write     # required for OIDC federation to AWS
  contents: read

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    env:
      REGISTRY: 123456789012.dkr.ecr.us-east-1.amazonaws.com
      REPO: my-api
    steps:
      - uses: actions/checkout@v4

      # No long-lived keys: assume an AWS role via OIDC
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy
          aws-region: us-east-1

      - uses: aws-actions/amazon-ecr-login@v2

      - name: Build, scan & push
        run: |
          TAG=${GITHUB_SHA::8}
          docker build -t $REGISTRY/$REPO:$TAG .
          docker push $REGISTRY/$REPO:$TAG
          echo "IMAGE=$REGISTRY/$REPO:$TAG" >> $GITHUB_ENV

      # Render a new task def revision with the new image, then deploy
      - uses: aws-actions/amazon-ecs-render-task-definition@v1
        id: taskdef
        with:
          task-definition: taskdef.json
          container-name: api
          image: ${{ env.IMAGE }}

      - uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.taskdef.outputs.task-definition }}
          service: my-api
          cluster: prod
          wait-for-service-stability: true     # waits for healthy rollout
```

**Why OIDC:** GitHub federates with AWS to get **temporary** credentials per run — no static access keys to leak (the top AWS breach vector).

## Part B — Node app as a Lambda container image

Use when your function exceeds the 250 MB zip limit or needs a custom runtime. Max image size: **10 GB**.

```dockerfile
# Use the AWS-provided Lambda base image for Node 20
FROM public.ecr.aws/lambda/nodejs:20

# Build artifacts go into the Lambda task root
COPY dist/ ${LAMBDA_TASK_ROOT}/
COPY node_modules/ ${LAMBDA_TASK_ROOT}/node_modules/

# CMD = the exported handler ("file.export")
CMD ["index.handler"]
```

```ts
// index.ts — a standard Lambda handler
export const handler = async (event: any) => {
  return { statusCode: 200, body: JSON.stringify({ ok: true, event }) };
};
```

Push to ECR and point the function at it:

```bash
aws lambda create-function \
  --function-name my-fn \
  --package-type Image \
  --code ImageUri=123.dkr.ecr.us-east-1.amazonaws.com/my-fn:abc123 \
  --role arn:aws:iam::123:role/my-fn-role

# Update on each deploy
aws lambda update-function-code \
  --function-name my-fn \
  --image-uri 123.dkr.ecr.us-east-1.amazonaws.com/my-fn:abc123
```

## Part C — running a NestJS HTTP app on Lambda (container)

```ts
// Cache the server across warm invocations (don't rebuild per request)
import serverlessExpress from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

let cached: any;
export const handler = async (event: any, context: any) => {
  if (!cached) {
    const app = await NestFactory.create(AppModule);
    await app.init();
    cached = serverlessExpress({ app: app.getHttpAdapter().getInstance() });
  }
  return cached(event, context);
};
```

## Lead-level notes
- **OIDC over static keys** for CI → AWS — temporary credentials, nothing to leak.
- **Gate the pipeline** on image scan results (fail on critical CVEs) and tests.
- **`wait-for-service-stability`** ensures the deploy actually became healthy (catch bad rollouts).
- **Lambda container images** suit large deps/custom runtimes; otherwise **zip + esbuild** usually gives faster cold starts — choose by dependency size and cold-start sensitivity.
- For Lambda + relational DB, front it with **RDS Proxy**; init clients **outside** the handler and cache across warm invocations.
