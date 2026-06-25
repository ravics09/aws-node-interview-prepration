/**
 * Idempotency keys with DynamoDB conditional writes (Q49).
 *
 * Why it matters: At-least-once systems (SQS, Lambda retries, client retries)
 * WILL deliver duplicates. An idempotency key + a conditional PutItem ensures a
 * logical operation (e.g., "charge this customer") executes at most once and
 * returns the original result on duplicates.
 *
 * Table design:
 *   PK: idempotencyKey (string)
 *   Attributes: status ("IN_PROGRESS" | "COMPLETED"), result (JSON), expiresAt (TTL)
 *   Enable TTL on `expiresAt` so old keys self-expire.
 *
 * Packages: @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.IDEMPOTENCY_TABLE ?? 'idempotency';
const TTL_SECONDS = 24 * 60 * 60; // keep keys for 24h

export class DuplicateInProgressError extends Error {}

/**
 * Runs `operation` at most once per `key`. Returns the stored result for
 * duplicate calls. `operation` must be the side-effecting business logic.
 */
export async function withIdempotency<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const now = Math.floor(Date.now() / 1000);

  // 1) Try to claim the key. The condition fails if it already exists.
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { idempotencyKey: key, status: 'IN_PROGRESS', expiresAt: now + TTL_SECONDS },
        ConditionExpression: 'attribute_not_exists(idempotencyKey)',
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;

    // 2) Key exists — return the prior result, or signal still-in-progress.
    const existing = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { idempotencyKey: key } }),
    );
    if (existing.Item?.status === 'COMPLETED') return existing.Item.result as T;
    // A concurrent attempt is mid-flight; caller can retry later / return 409.
    throw new DuplicateInProgressError(`operation in progress for key ${key}`);
  }

  // 3) We own the key: run the real operation and persist its result.
  const result = await operation();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { idempotencyKey: key },
      UpdateExpression: 'SET #s = :done, #r = :result',
      ExpressionAttributeNames: { '#s': 'status', '#r': 'result' },
      ExpressionAttributeValues: { ':done': 'COMPLETED', ':result': result },
    }),
  );
  return result;
}

// --- Example: payment handler -----------------------------------------------
// app.post('/charge', async (req, res) => {
//   const key = req.header('Idempotency-Key');
//   if (!key) return res.status(400).json({ error: 'Idempotency-Key required' });
//   try {
//     const charge = await withIdempotency(key, () => paymentProvider.charge(req.body));
//     res.json(charge);
//   } catch (e) {
//     if (e instanceof DuplicateInProgressError) return res.status(409).json({ error: 'in progress' });
//     throw e;
//   }
// });
