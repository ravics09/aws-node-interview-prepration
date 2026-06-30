# Amazon Kinesis (Data Streams) + Node.js

## What it is
A managed service for ingesting and processing **massive, high-speed, real-time data streams**. Data is ordered within a **shard**, retained for a window (so it's **replayable**), and consumable by multiple independent consumers. **Firehose** is the sibling service that delivers streams to S3/Redshift/OpenSearch with no consumer code.

## How we use it with Node.js
Producers `PutRecord(s)` with `@aws-sdk/client-kinesis`, choosing a **partition key** that spreads load across shards. Consumers are usually **Lambda** (via event source mapping) processing batches of records, or a long-running app using the Kinesis Client Library. Firehose is configured (no code) to batch records into S3.

## For what purpose (real use cases)
- **Clickstream / IoT telemetry** ingestion at millions of events/sec.
- **Real-time analytics & dashboards** (aggregate as data flows).
- **Log/event pipelines** feeding a data lake (via Firehose → S3).
- **Multiple consumers** of the same stream (real-time path + lake path) with **replay**.

## Code

### 1. Producer — put records (batch for throughput)
```ts
import { KinesisClient, PutRecordsCommand } from '@aws-sdk/client-kinesis';
const kinesis = new KinesisClient({});

export async function publishEvents(events: { deviceId: string; payload: any }[]) {
  await kinesis.send(new PutRecordsCommand({
    StreamName: process.env.STREAM_NAME!,
    Records: events.map((e) => ({
      Data: Buffer.from(JSON.stringify(e.payload)),
      PartitionKey: e.deviceId,   // HIGH-CARDINALITY key spreads load across shards
    })),
  }));
}
```

### 2. Consumer — Lambda processing stream records
```ts
import type { KinesisStreamEvent, KinesisStreamBatchResponse } from 'aws-lambda';

export const handler = async (event: KinesisStreamEvent): Promise<KinesisStreamBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      const data = JSON.parse(Buffer.from(record.kinesis.data, 'base64').toString('utf8'));
      await aggregate(data);   // e.g., update rolling metrics in DynamoDB (idempotent)
    } catch {
      // checkpoint failure point so we don't lose ordering guarantees
      batchItemFailures.push({ itemIdentifier: record.kinesis.sequenceNumber });
    }
  }
  return { batchItemFailures };
};
```

### 3. Real-time aggregation into DynamoDB
```ts
async function aggregate(event: { metric: string; value: number; ts: number }) {
  const minute = Math.floor(event.ts / 60000);
  await ddb.send(new UpdateCommand({
    TableName: 'metrics',
    Key: { pk: event.metric, sk: minute },
    UpdateExpression: 'ADD total :v, samples :one',
    ExpressionAttributeValues: { ':v': event.value, ':one': 1 },
  }));
}
```

## Kinesis vs SQS (quick distinction)
- **Kinesis:** ordered (per shard), **replayable**, **multiple consumers** of the same data, high-volume streaming/analytics.
- **SQS:** a work queue, message deleted after processing, typically **one consumer pool**, no replay.

## Lead-level notes & gotchas
- **Partition-key design is everything:** a low-cardinality key (e.g., a status flag) creates a **hot shard** that caps throughput. Use high-cardinality keys (deviceId/sessionId); write-shard if needed.
- **Poison-pill blocks the shard** (ordering): use `bisectBatchOnFunctionError`, max-retry, and an **on-failure destination**.
- **Idempotent consumers** (at-least-once delivery; dedupe by sequence/business key).
- **Capacity:** on-demand mode for variable load; provisioned shards (cheaper) when rate is predictable; monitor **iterator age** (consumer falling behind).
- **Use Firehose** when you just need to land the stream in S3/Redshift/OpenSearch — no code, with batching + Parquet conversion (huge cost savings on downstream queries).
- **Enhanced fan-out** for multiple low-latency consumers.
