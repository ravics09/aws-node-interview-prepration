# Practical Use Cases — AWS + Node.js

How the top AWS services are actually used **with Node.js** in modern real-time applications. Each file answers: **What is it? → How do we use it with Node.js? → For what purpose (real use cases)? → Detailed code (AWS SDK v3) → Lead-level notes & gotchas.**

All code targets **Node.js 18+** and **AWS SDK for JavaScript v3** (modular clients), which is the current standard (smaller bundles, better tree-shaking, faster Lambda cold starts than the deprecated v2).

## Services

| # | Service | What it does for a Node.js app | File |
|---|---------|--------------------------------|------|
| 1 | **AWS Lambda** | Run serverless, event-driven Node.js functions | [01-aws-lambda.md](./01-aws-lambda.md) |
| 2 | **Amazon ECS + Fargate** | Run long-running containerized Node.js services | [02-amazon-ecs-fargate.md](./02-amazon-ecs-fargate.md) |
| 3 | **Amazon API Gateway** | Front REST APIs + native WebSocket connections | [03-amazon-api-gateway.md](./03-amazon-api-gateway.md) |
| 4 | **Amazon CloudFront** | Global CDN to accelerate delivery & offload origin | [04-amazon-cloudfront.md](./04-amazon-cloudfront.md) |
| 5 | **Lambda@Edge** | Run Node.js logic at edge locations (ultra-low latency) | [05-lambda-edge.md](./05-lambda-edge.md) |
| 6 | **Amazon DynamoDB** | High-speed serverless NoSQL data store | [06-amazon-dynamodb.md](./06-amazon-dynamodb.md) |
| 7 | **DynamoDB Streams** | React to data changes (CDC) automatically | [07-dynamodb-streams.md](./07-dynamodb-streams.md) |
| 8 | **Amazon ElastiCache (Redis)** | In-memory caching + Redis Pub/Sub | [08-amazon-elasticache.md](./08-amazon-elasticache.md) |
| 9 | **Amazon Kinesis** | Process massive high-speed live data streams | [09-amazon-kinesis.md](./09-amazon-kinesis.md) |
| 10 | **Amazon SQS** | Reliable async message queuing between services | [10-amazon-sqs.md](./10-amazon-sqs.md) |
| 11 | **Amazon SNS** | High-volume pub/sub broadcast & notifications | [11-amazon-sns.md](./11-amazon-sns.md) |
| 12 | **Amazon S3** | Store media, user uploads, and backups | [12-amazon-s3.md](./12-amazon-s3.md) |
| 13 | **Amazon CloudWatch** | Real-time logs, metrics, and alarms | [13-amazon-cloudwatch.md](./13-amazon-cloudwatch.md) |

## Common setup notes

- **Install only the clients you need** (modular v3): `npm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb` etc.
- **Credentials:** locally via `aws configure` / env vars; in production via the **IAM role** of the Lambda/ECS task (the SDK loads them automatically — never hard-code keys).
- **Reuse clients:** instantiate an SDK client **once at module scope** and reuse it across invocations/requests (connection reuse, fewer handshakes, faster Lambda warm starts).
- **Region:** set via `AWS_REGION` env var or the client config.

```ts
// Pattern used throughout: create the client once, reuse it.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
export const ddbClient = new DynamoDBClient({}); // region/creds from env or role
```

## Related material in this repo

- AWS reference pack (cheat sheet, comparisons, scenarios): [../aws/README.md](../aws/README.md)
- Deep-dive interview guide: [../guide/AWS-NodeJS-Lead-Interview-100-Questions.md](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md)
- Runnable code examples: [../code-examples/README.md](../code-examples/README.md)
