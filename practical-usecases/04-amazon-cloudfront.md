# Amazon CloudFront + Node.js

## What it is
A global Content Delivery Network (CDN). It caches content at hundreds of edge locations close to users, reducing latency, offloading your origin, and absorbing traffic spikes. It integrates with S3, ALB, API Gateway, WAF, and Shield.

## How we use it with Node.js
CloudFront sits **in front of** your Node.js origin (ALB/API Gateway) or an S3 bucket. Your Node app controls caching behavior by setting **`Cache-Control` headers**, and generates **signed URLs/cookies** for private content. You rarely call CloudFront from app code at request time — you configure it (via console/CDK) and influence it through response headers.

## For what purpose (real use cases)
- Serve **static assets / SPA bundles / images** from S3 with edge caching.
- **Cache cacheable API GETs** (e.g., product catalog) to offload your Node origin during spikes.
- **Accelerate dynamic content** via the AWS backbone + persistent connections.
- Serve **private media** (paid videos, user files) via signed URLs/cookies.
- Front your API with **WAF + Shield** for security/DDoS protection.

## Code

### 1. Node origin controlling cache behavior with headers
```ts
import express from 'express';
const app = express();

// Cacheable for 60s at the edge, allow stale while revalidating.
app.get('/products', async (_req, res) => {
  const products = await getProducts();
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
  res.json(products);
});

// Never cache user-specific/auth responses.
app.get('/me', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(req.user);
});
```

### 2. Generating CloudFront signed URLs for private content (SDK v3)
```ts
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

export function privateMediaUrl(objectPath: string): string {
  return getSignedUrl({
    url: `https://cdn.example.com/${objectPath}`,
    keyPairId: process.env.CF_KEY_PAIR_ID!,         // CloudFront key pair
    privateKey: process.env.CF_PRIVATE_KEY!,        // PEM private key (from Secrets Manager)
    dateLessThan: new Date(Date.now() + 5 * 60_000).toISOString(), // 5-min expiry
  });
}
// Client receives a time-limited URL; CloudFront verifies the signature before serving.
```

### 3. Invalidating cache after a deploy/content change (SDK v3)
```ts
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
const cf = new CloudFrontClient({});

export async function invalidate(paths: string[]) {
  await cf.send(new CreateInvalidationCommand({
    DistributionId: process.env.CF_DISTRIBUTION_ID!,
    InvalidationBatch: {
      CallerReference: `inv-${Date.now()}`,
      Paths: { Quantity: paths.length, Items: paths }, // e.g. ['/index.html']
    },
  }));
}
```

## Lead-level notes & gotchas
- **Prefer versioned asset filenames** (`app.abc123.js`) over invalidations — invalidations are eventually consistent and cost money.
- Design the **cache key** carefully (which headers/query/cookies vary the cache) — caching on a cookie that's always unique = 0% hit rate.
- `Cache-Control: no-store` for anything user-specific; never cache authenticated responses publicly.
- Combine with **WAF** (SQLi/XSS/rate rules) and **Shield** — the edge absorbs/blocks malicious load before it scales your Node origin (security *and* cost protection).
- Cache hits never reach your origin → massive load + cost reduction during spikes.
- For private downloads use **signed URLs/cookies**; keep the private key in Secrets Manager.
