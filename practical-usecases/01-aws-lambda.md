# AWS Lambda + Node.js

## What it is
A serverless compute service that runs your Node.js code in response to events, automatically scaling and billing per request + duration. No servers to manage; scales to zero when idle.

## How we use it with Node.js
You export a `handler` function. AWS invokes it with an `event` (the trigger payload) and `context` (runtime info). The Node runtime keeps the execution environment warm between invocations, so anything you initialize **outside** the handler (SDK clients, DB pools, config) is reused.

## For what purpose (real use cases)
- **API backends** (behind API Gateway) for spiky/low-baseline traffic.
- **Event processing:** react to S3 uploads, DynamoDB Streams, SQS messages, Kinesis records.
- **Scheduled jobs** (with EventBridge Scheduler) — cleanup, reports.
- **Glue/automation** between AWS services.
- **Fan-out workers** for async tasks (thumbnails, notifications).

## Code

### 1. Basic API handler (API Gateway proxy integration)
```ts
// handler.ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// Initialized ONCE per execution environment — reused across warm invocations.
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const getUser = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const userId = event.pathParameters?.id;
  if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };

  const { Item } = await ddb.send(
    new GetCommand({ TableName: process.env.TABLE!, Key: { userId } }),
  );

  if (!Item) return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Item),
  };
};
```

### 2. SQS-triggered worker with partial batch failure
```ts
import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body);
      await processMessage(msg); // your business logic (must be idempotent)
    } catch (err) {
      // Only this message is retried, not the whole batch.
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
```
> Enable **`ReportBatchItemFailures`** on the event source mapping so only failed messages are retried.

### 3. Reusing a connection / avoiding re-init
```ts
let cachedSecret: string | undefined; // survives across warm invocations

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  cachedSecret = await fetchFromSecretsManager(); // expensive — do it once
  return cachedSecret;
}
```

## Lead-level notes & gotchas
- **Cold starts:** keep the bundle small (esbuild + SDK v3 modular clients), init clients outside the handler, use **provisioned concurrency** for latency-critical paths.
- **15-minute max** execution; **6 MB** sync payload — offload long/large work to Fargate/Step Functions or stream via S3.
- **RDS connections:** one env = one connection → use **RDS Proxy** to avoid exhaustion, or prefer DynamoDB (connectionless).
- **Idempotency:** retries/at-least-once delivery mean handlers must be idempotent.
- **Concurrency:** use **reserved concurrency** to protect fragile downstreams; **provisioned concurrency** to eliminate cold starts.
- **Don't** do CPU-heavy work that exceeds limits; offload to a worker/Step Functions.
