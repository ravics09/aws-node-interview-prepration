# DynamoDB Streams + Node.js

## What it is
A time-ordered change log of item-level modifications (INSERT/MODIFY/REMOVE) on a DynamoDB table. It enables **Change Data Capture (CDC)** — you react to data changes in near-real-time, typically with a Lambda trigger, without polling.

## How we use it with Node.js
Enable a stream on the table (choosing what each record contains: keys only, new image, old image, or both). Attach a **Lambda** that receives batches of change records and processes them. The handler iterates records and acts on `eventName` (INSERT/MODIFY/REMOVE).

## For what purpose (real use cases)
- **Materialized views / aggregations:** keep a per-user summary updated as orders change.
- **Search index sync:** push changes to OpenSearch.
- **Event publishing / outbox:** emit domain events to EventBridge/SNS when data changes.
- **Audit logs / history** of every change.
- **Cross-region replication** (Global Tables use Streams under the hood).
- **Notifications:** trigger an email/push when a record reaches a state.

## Code

### 1. Lambda stream handler with partial batch failures
```ts
import type { DynamoDBStreamEvent, DynamoDBBatchResponse } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';

export const handler = async (event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const newImage = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : undefined;
      const oldImage = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage as any) : undefined;

      switch (record.eventName) {
        case 'INSERT': await onCreated(newImage); break;
        case 'MODIFY': await onUpdated(oldImage, newImage); break;
        case 'REMOVE': await onDeleted(oldImage); break;
      }
    } catch (err) {
      // Report failure so only failed records (from this point) are retried.
      batchItemFailures.push({ itemIdentifier: record.dynamodb!.SequenceNumber! });
    }
  }
  return { batchItemFailures };
};
```

### 2. Example: sync changes to OpenSearch (search index)
```ts
async function onUpdated(_old: any, next: any) {
  if (next?.pk?.startsWith('PRODUCT#')) {
    await openSearch.index({
      index: 'products',
      id: next.pk,
      document: { name: next.name, price: next.price, updatedAt: next.updatedAt },
    });
  }
}
```

### 3. Example: outbox — publish a domain event on change
```ts
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
const eb = new EventBridgeClient({});

async function onCreated(item: any) {
  if (item?.sk === 'ORDER') {
    await eb.send(new PutEventsCommand({
      Entries: [{
        Source: 'orders.service',
        DetailType: 'OrderCreated',
        Detail: JSON.stringify({ orderId: item.pk, total: item.total }),
        EventBusName: 'default',
      }],
    }));
  }
}
```

## Lead-level notes & gotchas
- **Ordering** is guaranteed only **within a partition** (shard); design accordingly.
- **Idempotency required:** records may be delivered more than once — make handlers idempotent (dedupe by `SequenceNumber`/business key).
- **Poison-pill risk:** by default a failing record can block the shard. Use **`ReportBatchItemFailures`** + `bisectBatchOnFunctionError` + a max-retry + an **on-failure destination** (SQS/SNS) so bad records are quarantined.
- **24-hour retention** — for longer retention/replay or very high fan-out, consider Kinesis Data Streams as the table's stream target.
- Choose the **StreamViewType** deliberately: `NEW_AND_OLD_IMAGES` if you need to diff old vs new (e.g., detecting a status transition).
- Great for the **outbox pattern** — atomically change data + reliably emit an event without dual-write inconsistency.
