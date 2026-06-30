# REST API Interview Questions — Intermediate

[← Back to index](./README.md) · Context: **Node.js · Express.js · AWS**

---

### Q1. How do you version a REST API, and which approach do you prefer?

**Answer.** Options:
- **URI versioning:** `/v1/users` — explicit, easy to route/cache. Most common.
- **Header versioning:** `Accept: application/vnd.myapp.v1+json` or `X-API-Version: 1` — cleaner URLs.
- **Query param:** `/users?version=1` — least preferred.

```js
const v1 = require('express').Router();
v1.get('/users', listV1);
app.use('/v1', v1);   // URI versioning
```

**Lead-level note:** I default to **URI versioning** for explicitness and cache-friendliness. Whatever you pick, keep changes **additive/backward-compatible** within a version and publish a **deprecation timeline** before removing one.

---

### Q2. How do you implement pagination, filtering, and sorting?

**Answer.** Use query params; return an envelope with metadata. Prefer **cursor (keyset)** pagination for large/changing datasets.

```js
// Cursor pagination (stable, scalable)
app.get('/items', async (req, res, next) => {
  try {
    const limit = Math.min(+req.query.limit || 20, 100);
    const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;
    const rows = await db.items.find({ ...(cursor && { id: { $gt: cursor } }) }, { sort: { id: 1 }, limit: limit + 1 });
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    res.json({
      data,
      page: { limit, hasMore },
      links: { next: hasMore ? `/items?limit=${limit}&cursor=${encodeCursor(data.at(-1).id)}` : null },
    });
  } catch (e) { next(e); }
});
```

**Lead-level note:** **Offset pagination** (`?page=2`) is simple but degrades on large offsets and can skip/duplicate rows when data changes. **Cursor/keyset** is stable and scales — use it for big or fast-changing collections.

---

### Q3. How do you validate request data robustly?

**Answer.** Validate at the edge of the handler with a schema library (express-validator, zod, Joi); reject with **422/400** and a consistent error shape.

```js
const { z } = require('zod');
const CreateUser = z.object({ email: z.string().email(), age: z.number().int().min(18) });

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(422).json({ error: 'validation_error', details: result.error.issues });
    req.body = result.data;   // sanitized/typed
    next();
  };
}
app.post('/users', validate(CreateUser), createHandler);
```

**Lead-level note:** Validation is a **security control** (prevents injection/mass-assignment) — whitelist allowed fields and reject unknown ones. Never trust client input.

---

### Q4. How do you design a consistent error-handling strategy?

**Answer.** A single error shape + centralized Express error middleware; distinguish operational (expose-safe) from programmer errors (hide details on 5xx).

```js
class ApiError extends Error {
  constructor(status, code, message, expose = true) { super(message); Object.assign(this, { status, code, expose }); }
}
// usage: throw new ApiError(404, 'user_not_found', 'User does not exist');

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'internal_error',
    message: status < 500 && err.expose ? err.message : 'Something went wrong',
    requestId: req.id,            // correlation id for support
  });
  if (status >= 500) logger.error({ err, requestId: req.id });  // log full detail server-side
});
```

**Lead-level note:** Never leak stack traces/internal messages on 5xx. Include a **requestId/correlation id** so clients can reference it and you can grep logs.

---

### Q5. How do you implement authentication in a REST API?

**Answer.** Stateless **JWT bearer tokens** (or OAuth2); verify on every request via middleware. Use short-lived access tokens + refresh tokens.

```js
const jwt = require('jsonwebtoken');
function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ['RS256'], issuer: ISS, audience: AUD });
    next();
  } catch { return res.status(401).json({ error: 'invalid_token' }); }
}
app.get('/me', authenticate, (req, res) => res.json(req.user));
```

**Lead-level note:** Prefer **asymmetric (RS256)** verification against a JWKS (e.g., Cognito) so resource servers hold no shared secret; validate `iss`/`aud`/`exp`; reject `alg: none`. On AWS, push first-line auth to API Gateway/Cognito authorizers.

---

### Q6. What's the difference between authentication and authorization, and how do you implement authz?

**Answer.** **AuthN** = who you are; **AuthZ** = what you can do. Implement authz with role/permission middleware after authentication.

```js
const requireRole = (...roles) => (req, res, next) =>
  roles.some((r) => req.user?.roles?.includes(r))
    ? next()
    : res.status(403).json({ error: 'forbidden' });

app.delete('/users/:id', authenticate, requireRole('admin'), deleteHandler);
```

**Lead-level note:** Enforce **object-level authorization** (does *this* user own *this* resource?) to prevent IDOR — don't just check the role, check the relationship. 401 if unauthenticated, 403 if authenticated-but-not-allowed.

---

### Q7. How do you cache REST responses (ETag, Cache-Control)?

**Answer.** Use `Cache-Control` for freshness and `ETag`/`If-None-Match` (or `Last-Modified`/`If-Modified-Since`) for validation → 304 Not Modified.

```js
app.get('/products/:id', async (req, res) => {
  const product = await svc.find(req.params.id);
  const etag = makeEtag(product);                  // e.g., hash or version
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.set('ETag', etag);
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
  res.json(product);
});
```

**Lead-level note:** Layer caching: client/CDN via headers + **CloudFront** at the edge to offload the origin. Don't cache user-specific/auth responses publicly (`Cache-Control: private`/`no-store`).

---

### Q8. How do you handle file uploads in a REST API on AWS?

**Answer.** Don't proxy large files through Express — issue an **S3 pre-signed URL** and let the client upload directly.

```js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = new S3Client({});

app.post('/uploads', authenticate, async (req, res, next) => {
  try {
    const key = `uploads/${req.user.sub}/${crypto.randomUUID()}`;
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: req.body.contentType }), { expiresIn: 300 });
    res.status(201).json({ key, uploadUrl: url });   // client PUTs file directly to S3
  } catch (e) { next(e); }
});
```

**Lead-level note:** Pre-signed URLs keep big bytes off your compute (scales, cheaper). Process the uploaded object via an S3 event → SQS/Lambda. For small files you can stream, but never buffer huge payloads in memory.

---

### Q9. How do you implement CORS correctly?

**Answer.** Use the `cors` middleware with an explicit allow-list; the browser sends a **preflight** `OPTIONS` for non-simple requests.

```js
const cors = require('cors');
app.use(cors({
  origin: ['https://app.example.com'],   // explicit allow-list, not '*'
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
```

**Lead-level note:** Avoid `origin: '*'` with credentials (insecure/disallowed). CORS is **browser** security — it doesn't protect server-to-server calls; pair with real authz.

---

### Q10. How should the response envelope and metadata be structured?

**Answer.** Be consistent: either return the resource directly (simple) or wrap collections with metadata + links.

```js
// Collection envelope
{
  "data": [ { "id": 1 }, { "id": 2 } ],
  "page": { "limit": 20, "hasMore": true },
  "links": { "self": "/items?cursor=...", "next": "/items?cursor=..." }
}
// Single resource: return it directly, or { "data": {...} } — just be consistent across the API.
```

**Lead-level note:** Pick a convention and apply it everywhere. Inconsistent shapes across endpoints are a real DX problem; document the contract in **OpenAPI**.

---

### Q11. How do you document a REST API?

**Answer.** Generate an **OpenAPI/Swagger** spec as the single source of truth (swagger-jsdoc/swagger-ui-express for Express, `@nestjs/swagger` for NestJS).

```js
const swaggerUi = require('swagger-ui-express');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
```

**Lead-level note:** OpenAPI drives client SDK generation, contract tests, and can configure API Gateway. As a lead you treat the contract as a first-class artifact with versioning + deprecation policy.

---

### Q12. How do you handle long-running operations in a REST API?

**Answer.** Don't block the request. Accept the work and return **202 Accepted** with a status resource the client can poll (or notify via webhook/WebSocket).

```js
app.post('/reports', authenticate, async (req, res, next) => {
  try {
    const jobId = crypto.randomUUID();
    await sqs.send(new SendMessageCommand({ QueueUrl: REPORTS_Q, MessageBody: JSON.stringify({ jobId, ...req.body }) }));
    res.status(202).location(`/reports/${jobId}`).json({ jobId, status: 'processing' });
  } catch (e) { next(e); }
});
app.get('/reports/:jobId', authenticate, async (req, res) => res.json(await svc.status(req.params.jobId)));
```

**Lead-level note:** This async pattern (202 + status polling + SQS worker) keeps the API responsive and the event loop free — critical for anything slow (reports, transcoding, batch).
