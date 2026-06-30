/**
 * Direct-to-S3 uploads via pre-signed URLs (Q43).
 *
 * Why it matters: Routing large file bytes through your API tier wastes memory
 * and bandwidth and doesn't scale. Instead, the backend issues a short-lived,
 * constrained pre-signed URL and the client uploads DIRECTLY to S3. Processing
 * is triggered by an S3 event (EventBridge/SNS -> SQS -> worker).
 *
 * Packages: @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3 = new S3Client({});
const BUCKET = process.env.UPLOAD_BUCKET ?? 'my-uploads';

/**
 * Issue a pre-signed PUT URL. Constrain content type and expiry; enforce size
 * limits via a bucket policy or S3 PUT conditions / POST policy where possible.
 */
export async function createUploadUrl(params: {
  userId: string;
  contentType: string;
}): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
  // Namespacing by user keeps objects organized and supports IAM path scoping.
  const key = `uploads/${params.userId}/${randomUUID()}`;
  const expiresIn = 300; // 5 minutes — keep pre-signed URLs short-lived

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: params.contentType, // client must send the same Content-Type
    }),
    { expiresIn },
  );

  return { key, uploadUrl, expiresIn };
}

/** Issue a pre-signed GET URL for private downloads. */
export async function createDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 300,
  });
}

// --- Client flow -------------------------------------------------------------
// 1) GET /upload-url            -> { uploadUrl, key }
// 2) PUT <uploadUrl> (file)     -> uploads straight to S3 (no app server hop)
// 3) S3 ObjectCreated event     -> EventBridge -> SQS -> worker processes file
// 4) worker updates status + notifies user (see Q95)
//
// For very large files, use multipart uploads (@aws-sdk/lib-storage `Upload`),
// which also provides backpressure when streaming through a server is required.
