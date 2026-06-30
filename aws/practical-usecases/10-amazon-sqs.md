# Amazon SQS + Node.js

## What it is
A fully managed message queue for reliable, asynchronous communication between services. Producers send messages; consumers pull and process them at their own pace. **Standard** queues offer high throughput + at-least-once delivery; **FIFO** queues add strict ordering + exactly-once processing per group.

## How we use it with Node.js
A producer sends a message with `@aws-sdk/client-sqs`. A consumer either polls the queue (long-running ECS worker) or is invoked by Lambda via an event source mapping. Failed messages return after the **visibility timeout** and eventually go to a **Dead Letter Queue (DLQ)**.

## For what purpose (real use cases)
- **Queue-based load leveling:** absorb traffic spikes so a spike grows the queue, not crashes the backend.
- **Decouple slow work** from the request path (emails, PDF/report generation, image processing).
- **Buffer in front of a rate-limited resource** (a DB or third-party API).
- **Retry + DLQ** for reliable async processing.

## Code

### 1. Producer — send a message
```ts
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
const sqs = new SQSClient({});

export async function enqueueEmail(payload: { to: string; template: string }) {
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.EMAIL_QUEUE_URL!,
    MessageBody: JSON.stringify(payload),
    // FIFO only: MessageGroupId (ordering scope) + MessageDeduplicationId (idempotency)
  }));
}
```

### 2. Consumer A — long-running ECS worker (long polling)
```ts
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
const sqs = new SQSClient({});
const QUEUE = process.env.EMAIL_QUEUE_URL!;

async function poll() {
  while (running) {
    const { Messages } = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: QUEUE,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,            // long polling — fewer empty receives, lower cost
      VisibilityTimeout: 60,          // time to process before message reappears
    }));
    for (const m of Messages ?? []) {
      try {
        await sendEmail(JSON.parse(m.Body!));    // must be idempotent
        await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE, ReceiptHandle: m.ReceiptHandle! }));
      } catch {
        // don't delete -> message reappears after visibility timeout -> retried -> DLQ after maxReceiveCount
      }
    }
  }
}
poll();
```

### 3. Consumer B — Lambda with partial batch failure
```ts
import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';

export const handler = async (e: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of e.Records) {
    try { await process(JSON.parse(record.body)); }
    catch { batchItemFailures.push({ itemIdentifier: record.messageId }); } // retry only this one
  }
  return { batchItemFailures };  // requires ReportBatchItemFailures enabled
};
```

### 4. Large payloads (claim-check pattern)
```ts
// SQS messages are max 256 KB. For bigger payloads, store in S3 and send a reference.
await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bigPayload }));
await sqs.send(new SendMessageCommand({ QueueUrl: QUEUE, MessageBody: JSON.stringify({ s3Key: key }) }));
```

## Lead-level notes & gotchas
- **At-least-once delivery → make consumers idempotent** (dedupe by message/business key).
- **DLQ + redrive:** set `maxReceiveCount` so poison messages stop blocking throughput; alarm on DLQ depth.
- **Autoscale workers on queue depth / age-of-oldest-message** — the best scaling signal for backlog.
- **Visibility timeout** must exceed processing time, or messages get reprocessed concurrently.
- **256 KB limit** → S3 claim-check for large payloads.
- **Standard vs FIFO:** use FIFO only when you truly need ordering/exactly-once (lower throughput); scope ordering to a `MessageGroupId` (per-entity), not globally.
- **Long polling** (`WaitTimeSeconds: 20`) reduces empty receives and cost.
