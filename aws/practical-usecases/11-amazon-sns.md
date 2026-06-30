# Amazon SNS + Node.js

## What it is
A fully managed **pub/sub** messaging service. A publisher sends a message to a **topic**, and SNS pushes it to all **subscribers** (fan-out) — which can be SQS queues, Lambda functions, HTTP endpoints, email, SMS, or mobile push (APNs/FCM). It's push-based and high-throughput.

## How we use it with Node.js
Publish to a topic with `@aws-sdk/client-sns`. Subscribers receive the message: a Lambda subscriber gets an `SNSEvent`; an SQS subscriber gets it on its queue (the durable **SNS→SQS fan-out** pattern). You can filter which messages a subscriber receives with **message attributes + filter policies**.

## For what purpose (real use cases)
- **Fan-out:** one event → many independent consumers (e.g., `OrderPlaced` → email + analytics + inventory).
- **Application-to-person (A2P):** mobile push notifications, SMS, email alerts.
- **Decoupled broadcast** between microservices.
- **SNS → SQS fan-out** for broadcast *plus* durable, retryable per-consumer buffering.

## Code

### 1. Publish to a topic (with filterable attributes)
```ts
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
const sns = new SNSClient({});

export async function publishOrderEvent(order: { id: string; total: number; country: string }) {
  await sns.send(new PublishCommand({
    TopicArn: process.env.ORDER_TOPIC_ARN!,
    Message: JSON.stringify(order),
    MessageAttributes: {
      // subscribers can filter on these without parsing the body
      eventType: { DataType: 'String', StringValue: 'OrderPlaced' },
      country:   { DataType: 'String', StringValue: order.country },
    },
  }));
}
```

### 2. Lambda subscriber
```ts
import type { SNSEvent } from 'aws-lambda';

export const handler = async (event: SNSEvent) => {
  for (const record of event.Records) {
    const order = JSON.parse(record.Sns.Message);
    await sendOrderConfirmation(order); // idempotent
  }
};
```

### 3. Mobile/SMS push (A2P)
```ts
// Direct SMS
await sns.send(new PublishCommand({ PhoneNumber: '+15551234567', Message: 'Your OTP is 123456' }));

// Mobile push to a registered device endpoint (APNs/FCM)
await sns.send(new PublishCommand({
  TargetArn: deviceEndpointArn,
  Message: JSON.stringify({ default: 'Hi', GCM: JSON.stringify({ notification: { title: 'New order', body: 'Shipped!' } }) }),
  MessageStructure: 'json',
}));
```

### 4. Subscription filter policy (set on the subscription, not in code)
```json
{ "eventType": ["OrderPlaced"], "country": ["US", "CA"] }
```
> Only matching messages are delivered to that subscriber — no wasted invocations.

## SNS vs SQS vs EventBridge (quick distinction)
- **SNS:** push pub/sub fan-out; great for broadcast + A2P; no message retention/replay on its own.
- **SQS:** pull queue; durable buffering for **one** consumer pool.
- **EventBridge:** event bus with **rich content filtering**, many AWS targets, schema registry, archive/replay.

## Lead-level notes & gotchas
- **SNS → SQS fan-out** is the canonical durable pattern: SNS broadcasts, each SQS queue gives a consumer its own durable, retryable buffer (+ DLQ).
- **No built-in replay** (unlike EventBridge/Kinesis) — pair with SQS for durability.
- **Idempotency:** at-least-once delivery → idempotent subscribers.
- Use **filter policies** to avoid delivering irrelevant messages (saves cost + invocations).
- **FIFO topics** exist when you need ordering/dedup (lower throughput).
- For complex routing/many AWS targets/replay, prefer **EventBridge**; SNS wins for simple, very high-throughput fan-out and A2P.
