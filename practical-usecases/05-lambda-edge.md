# Lambda@Edge (and CloudFront Functions) + Node.js

## What it is
**Lambda@Edge** runs Node.js functions at CloudFront edge locations, close to users, triggered by CloudFront events. **CloudFront Functions** are an even lighter, faster (sub-millisecond) JavaScript option for simple header/URL manipulation. Both let you run logic *before/after* requests hit your origin, globally, with ultra-low latency.

## How we use it with Node.js
You attach a Node function to one of four CloudFront events:
- **viewer-request** — runs on every request before cache lookup (auth, redirects, A/B).
- **origin-request** — runs on a cache miss before hitting origin (routing, header injection).
- **origin-response** — after origin responds (modify/add headers).
- **viewer-response** — before returning to the user (security headers).

## For what purpose (real use cases)
- **Security headers** injection (HSTS, CSP) on every response.
- **Edge authentication / token validation** before content is served.
- **A/B testing & feature flags** by rewriting requests/cookies at the edge.
- **Geo-based routing / redirects** and localization.
- **URL rewrites** (e.g., pretty URLs → S3 object keys), bot filtering.
- **Image optimization** routing.

## Code

### 1. CloudFront Functions — add security headers (viewer-response)
```js
// CloudFront Functions use a constrained JS runtime (not full Node) — keep it tiny & fast.
function handler(event) {
  var response = event.response;
  var headers = response.headers;
  headers['strict-transport-security'] = { value: 'max-age=63072000; includeSubdomains; preload' };
  headers['x-content-type-options']   = { value: 'nosniff' };
  headers['x-frame-options']          = { value: 'DENY' };
  headers['content-security-policy']  = { value: "default-src 'self'" };
  return response;
}
```

### 2. Lambda@Edge — edge auth / redirect (viewer-request)
```js
'use strict';
// Lambda@Edge runs in Node; no env vars, limited size, must be deployed in us-east-1.
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  // Redirect unauthenticated users to login.
  const hasSession = headers.cookie?.some((c) => c.value.includes('session='));
  if (!hasSession && request.uri.startsWith('/app')) {
    return {
      status: '302',
      statusDescription: 'Found',
      headers: { location: [{ key: 'Location', value: 'https://example.com/login' }] },
    };
  }
  return request; // continue to cache/origin
};
```

### 3. Lambda@Edge — URL rewrite (origin-request)
```js
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  // Map "/" to "/index.html" for SPA hosting on S3.
  if (request.uri.endsWith('/')) request.uri += 'index.html';
  else if (!request.uri.includes('.')) request.uri += '/index.html';
  return request;
};
```

## Lead-level notes & gotchas
- **Choose the right tool:** CloudFront Functions for trivial, ultra-high-volume header/URL tweaks (cheaper, faster); **Lambda@Edge** when you need full Node, network calls, or larger logic.
- **Constraints:** Lambda@Edge must be deployed in **us-east-1**, **no environment variables**, smaller size/timeout limits than regular Lambda, and replication takes a few minutes to propagate.
- Keep edge logic **lightweight** — it runs on (potentially) every request globally; heavy logic belongs at the origin.
- Great for **cross-cutting concerns** (security headers, auth gating, redirects) without touching origin code.
- Debugging is harder (logs are in the region nearest the edge that executed) — log deliberately.
