# Amazon API Gateway + Node.js

## What it is
A fully managed front door for APIs. It handles routing, auth, throttling, request validation, and can expose **REST/HTTP APIs** and **native WebSocket APIs** — typically backed by Lambda or a container service.

## How we use it with Node.js
- **HTTP/REST APIs** route requests to Lambda (or HTTP backends/ALB via VPC Link). Your Node handler receives a proxy event and returns a response.
- **WebSocket APIs** manage persistent connections for you; you implement `$connect`, `$disconnect`, and custom route handlers in Lambda, and push messages back to clients via the management API.

## For what purpose (real use cases)
- **Public/partner REST APIs** needing auth (Cognito/JWT), API keys, usage plans, throttling, request validation.
- **Real-time apps** (chat, live dashboards, notifications) over **WebSockets** without running your own socket fleet.
- A managed edge that offloads coarse auth + rate limiting from your app.

## Code

### 1. REST: Lambda handler (HTTP API v2 event)
```ts
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (e: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const claims = (e.requestContext as any).authorizer?.jwt?.claims; // from Cognito JWT authorizer
  const body = e.body ? JSON.parse(e.body) : {};
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: claims?.sub, received: body }),
  };
};
```

### 2. WebSocket: connect / disconnect / message routes
```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CONNECTIONS_TABLE!;

// $connect — store the connectionId
export const onConnect = async (event: any) => {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { connectionId: event.requestContext.connectionId, connectedAt: Date.now() },
  }));
  return { statusCode: 200 };
};

// $disconnect — remove it
export const onDisconnect = async (event: any) => {
  await ddb.send(new DeleteCommand({
    TableName: TABLE, Key: { connectionId: event.requestContext.connectionId },
  }));
  return { statusCode: 200 };
};

// custom route — broadcast a message to all connections
export const onMessage = async (event: any) => {
  const { domainName, stage } = event.requestContext;
  const mgmt = new ApiGatewayManagementApiClient({ endpoint: `https://${domainName}/${stage}` });
  const payload = Buffer.from(JSON.stringify(JSON.parse(event.body).data));

  const { Items } = await ddb.send(new ScanCommand({ TableName: TABLE }));
  await Promise.all((Items ?? []).map(async ({ connectionId }) => {
    try {
      await mgmt.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: payload }));
    } catch (err: any) {
      if (err.statusCode === 410) {  // stale connection -> clean up
        await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { connectionId } }));
      }
    }
  }));
  return { statusCode: 200 };
};
```

## Lead-level notes & gotchas
- **HTTP APIs** are cheaper/faster than **REST APIs**; pick REST only when you need API keys/usage plans/request validation/caching.
- Put coarse **auth at the gateway** (Cognito/JWT/Lambda authorizer) so bad tokens never reach compute; keep fine-grained authz in the app.
- **WebSocket**: AWS manages connections, but you store the `connectionId` mapping (DynamoDB) and push via the management API. Clean up **410 Gone** stale connections.
- Priced **per request** → can be costly at very high volume (consider ALB for high-RPS container services).
- Use **usage plans + API keys** for tiered public APIs; combine with **WAF** for abuse protection.
