# Example 5 — AWS Integration (DynamoDB · S3 · SQS)

[← Back to index](./README.md)

A REST API backed by **DynamoDB**, with **S3 pre-signed uploads** and **SQS** for async work. AWS SDK v3, clients created once and reused.

## Setup (reuse clients)

```js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const sqs = new SQSClient({});
const TABLE = process.env.TABLE, BUCKET = process.env.BUCKET, QUEUE = process.env.QUEUE_URL;
```

## DynamoDB-backed CRUD endpoints

```js
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Create (conditional write prevents overwriting an existing id)
router.post('/v1/items', wrap(async (req, res) => {
  const item = { pk: `ITEM#${crypto.randomUUID()}`, ...req.body, createdAt: Date.now() };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item, ConditionExpression: 'attribute_not_exists(pk)' }));
  res.status(201).json(item);
}));

// Read
router.get('/v1/items/:id', wrap(async (req, res) => {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `ITEM#${req.params.id}` } }));
  if (!Item) return res.status(404).json({ error: 'not_found' });
  res.json(Item);
}));

// Update specific fields
router.patch('/v1/items/:id', wrap(async (req, res) => {
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABLE, Key: { pk: `ITEM#${req.params.id}` },
    UpdateExpression: 'SET #n = :name, updatedAt = :now',
    ExpressionAttributeNames: { '#n': 'name' },
    ExpressionAttributeValues: { ':name': req.body.name, ':now': Date.now() },
    ReturnValues: 'ALL_NEW',
  }));
  res.json(Attributes);
}));

// Delete
router.delete('/v1/items/:id', wrap(async (req, res) => {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk: `ITEM#${req.params.id}` } }));
  res.status(204).end();
}));
```

## S3 pre-signed upload (don't proxy big files through Express)

```js
router.post('/v1/uploads', authenticate, wrap(async (req, res) => {
  const key = `uploads/${req.user.sub}/${crypto.randomUUID()}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: req.body.contentType }),
    { expiresIn: 300 },   // short-lived
  );
  res.status(201).json({ key, uploadUrl });   // client PUTs the file directly to S3
}));

// pre-signed download
router.get('/v1/files/:key/url', authenticate, wrap(async (req, res) => {
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: req.params.key }), { expiresIn: 300 });
  res.json({ url });
}));
```

## SQS for slow/async work (return 202 Accepted)

```js
router.post('/v1/reports', authenticate, wrap(async (req, res) => {
  const jobId = crypto.randomUUID();
  await sqs.send(new SendMessageCommand({
    QueueUrl: QUEUE,
    MessageBody: JSON.stringify({ jobId, userId: req.user.sub, params: req.body }),
    MessageAttributes: { correlationId: { DataType: 'String', StringValue: req.id } }, // propagate trace
  }));
  res.status(202).location(`/v1/reports/${jobId}`).json({ jobId, status: 'processing' });
}));
```

## Why these patterns
- **DynamoDB** is connectionless (no pool exhaustion) — ideal for Lambda-backed REST APIs; conditional writes give idempotency/optimistic locking.
- **S3 pre-signed URLs** keep large file bytes off your compute → scalable + cheap.
- **SQS + 202** decouples slow work from the request, keeping the API responsive (a worker processes the queue and updates job status).
- All clients are **created once** and reused → connection reuse + faster Lambda warm starts.
