# Amazon S3 + Node.js

## What it is
Object storage with 11 nines of durability, effectively unlimited capacity, and rich features: lifecycle tiering, versioning, encryption, event notifications, and pre-signed URLs. The default home for files, uploads, media, backups, and data lakes.

## How we use it with Node.js
Use `@aws-sdk/client-s3` for object operations and `@aws-sdk/s3-request-presigner` for **pre-signed URLs** so clients upload/download **directly** to/from S3 (your servers never proxy the bytes). For large files, use multipart uploads via `@aws-sdk/lib-storage`.

## For what purpose (real use cases)
- **User uploads** (images, videos, documents) via pre-signed URLs.
- **Media storage + delivery** (front with CloudFront).
- **Backups / exports / generated reports.**
- **Data lake** (raw events landed by Firehose, queried by Athena).
- **Event-driven processing:** S3 event → SQS/Lambda to process new objects.

## Code

### 1. Pre-signed upload URL (client uploads directly to S3)
```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3 = new S3Client({});
const BUCKET = process.env.UPLOAD_BUCKET!;

export async function createUploadUrl(userId: string, contentType: string) {
  const key = `uploads/${userId}/${randomUUID()}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 }, // short-lived
  );
  return { key, uploadUrl: url };
}
// Client then: PUT <uploadUrl> with the file body and matching Content-Type.
```

### 2. Pre-signed download URL (private content)
```ts
export const createDownloadUrl = (key: string) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 300 });
```

### 3. Streaming a large object (don't buffer it all in memory)
```ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
await pipeline(Body as NodeJS.ReadableStream, createWriteStream('/tmp/out')); // backpressure-safe
```

### 4. Multipart streaming upload (large files, with backpressure)
```ts
import { Upload } from '@aws-sdk/lib-storage';

const upload = new Upload({
  client: s3,
  params: { Bucket: BUCKET, Key: key, Body: someReadableStream },
  queueSize: 4,          // parallel parts
  partSize: 5 * 1024 * 1024,
});
upload.on('httpUploadProgress', (p) => console.log(p.loaded, '/', p.total));
await upload.done();
```

### 5. Process new uploads via S3 event → Lambda
```ts
import type { S3Event } from 'aws-lambda';
export const handler = async (event: S3Event) => {
  for (const r of event.Records) {
    const key = decodeURIComponent(r.s3.object.key.replace(/\+/g, ' '));
    await generateThumbnail(r.s3.bucket.name, key); // idempotent (deterministic output key)
  }
};
```

## Lead-level notes & gotchas
- **Never proxy large file bytes through your API** — use **pre-signed URLs** (client ↔ S3 directly). This is the #1 scaling/cost pattern for uploads.
- **Stream, don't buffer** large objects (`pipeline`) to keep memory flat.
- **Lock it down:** short pre-signed expiry, constrain content-type/size, private buckets + bucket policies, **Block Public Access** on, SSE-KMS encryption.
- **Lifecycle policies / Intelligent-Tiering** to cut storage cost; clean up incomplete multipart uploads.
- **Event-driven processing:** S3 → EventBridge/SNS → **SQS** → worker (buffer + retry + DLQ).
- Front downloads with **CloudFront** (signed URLs) for latency + egress savings.
- Use **VPC Gateway Endpoint** for S3 to avoid NAT data-processing cost and keep traffic private.
