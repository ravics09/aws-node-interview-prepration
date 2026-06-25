# Amazon DynamoDB + Node.js

## What it is
A fully managed, serverless NoSQL key-value/document database with single-digit-millisecond latency at any scale. It's **connectionless** (HTTP API), which makes it ideal for Lambda and high-concurrency Node apps.

## How we use it with Node.js
Use the **`@aws-sdk/lib-dynamodb` DocumentClient**, which marshals plain JS objects to/from DynamoDB's typed format automatically. You model data around **access patterns** (partition key + optional sort key) and query by keys/GSIs.

## For what purpose (real use cases)
- **High-traffic, low-latency** data: user profiles, sessions, shopping carts, feature flags.
- **Serverless-first** apps (no connection pool to exhaust — perfect with Lambda).
- **Event sourcing / connection registries** (e.g., WebSocket `connectionId` store).
- **High-write workloads:** IoT telemetry, activity feeds, idempotency keys.

## Code

### 1. Setup (reuse the client)
```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = process.env.TABLE!;
```

### 2. CRUD operations
```ts
import { PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Create / overwrite
await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: `USER#${id}`, sk: 'PROFILE', name, email } }));

// Read by key
const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `USER#${id}`, sk: 'PROFILE' } }));

// Update specific attributes
await ddb.send(new UpdateCommand({
  TableName: TABLE,
  Key: { pk: `USER#${id}`, sk: 'PROFILE' },
  UpdateExpression: 'SET lastLogin = :now',
  ExpressionAttributeValues: { ':now': Date.now() },
}));

// Query: all orders for a user (single-table design with sort-key prefix)
const { Items } = await ddb.send(new QueryCommand({
  TableName: TABLE,
  KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
  ExpressionAttributeValues: { ':pk': `USER#${id}`, ':prefix': 'ORDER#' },
}));
```

### 3. Conditional write (optimistic locking / idempotency)
```ts
// Only create if it doesn't already exist — prevents duplicates (idempotency).
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
try {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `IDEMP#${key}`, status: 'DONE', result },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
} catch (e) {
  if (e instanceof ConditionalCheckFailedException) {/* already processed — safe no-op */}
  else throw e;
}
```

### 4. Atomic counter & transaction
```ts
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

// Atomic increment (no read-modify-write race)
await ddb.send(new UpdateCommand({
  TableName: TABLE, Key: { pk: 'STATS', sk: 'VIEWS' },
  UpdateExpression: 'ADD viewCount :one', ExpressionAttributeValues: { ':one': 1 },
}));

// Multi-item ACID transaction
await ddb.send(new TransactWriteCommand({
  TransactItems: [
    { Update: { TableName: TABLE, Key: { pk: 'ACC#A' }, UpdateExpression: 'ADD bal :d', ExpressionAttributeValues: { ':d': -100 }, ConditionExpression: 'bal >= :min', ExpressionAttributeValues: { ':d': -100, ':min': 100 } } },
    { Update: { TableName: TABLE, Key: { pk: 'ACC#B' }, UpdateExpression: 'ADD bal :d', ExpressionAttributeValues: { ':d': 100 } } },
  ],
}));
```

## Lead-level notes & gotchas
- **Model around access patterns first**, not normalization. List your queries, then design keys/GSIs to serve them (single-table design fetches related data in one query).
- **Hot partitions:** pick **high-cardinality** partition keys; write-shard unavoidable hotspots (suffix); use **DAX** for read-heavy hot keys.
- **Eventually vs strongly consistent reads** (`ConsistentRead: true` costs more, only on the base table not GSIs).
- **Capacity:** on-demand for unpredictable load; provisioned + auto-scaling for steady/predictable.
- **Idempotency:** conditional writes (`attribute_not_exists`) are the standard pattern.
- **Bounded concurrency** for bulk writes to avoid throttling; handle `ProvisionedThroughputExceededException` with retries (SDK retries automatically).
- Avoid **`Scan`** in hot paths (full-table read) — design a GSI instead.
