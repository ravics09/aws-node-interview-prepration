# REST API Cheat Sheet (Node.js · Express.js · AWS)

Dense, high-recall reference. For detail see [../interview-questions/](../interview-questions/README.md).

---

## HTTP methods — semantics

| Method | Purpose | Safe | Idempotent | Body |
|--------|---------|------|-----------|------|
| GET | read | ✅ | ✅ | no |
| HEAD | read headers | ✅ | ✅ | no |
| OPTIONS | capabilities / CORS preflight | ✅ | ✅ | no |
| POST | create / action | ❌ | ❌ | yes |
| PUT | full replace | ❌ | ✅ | yes |
| PATCH | partial update | ❌ | ⚠️ (design it to be) | yes |
| DELETE | remove | ❌ | ✅ | maybe |

- **Safe** = no state change. **Idempotent** = same result if repeated.

## Status codes

| Code | Meaning | Use |
|------|---------|-----|
| 200 | OK | generic success |
| 201 | Created | resource created (+ `Location` header) |
| 202 | Accepted | async accepted, processing later |
| 204 | No Content | success, no body (DELETE/PUT) |
| 301/302/307 | Redirect | permanent / temporary |
| 304 | Not Modified | caching (ETag/If-None-Match) |
| 400 | Bad Request | malformed/invalid input |
| 401 | Unauthorized | not authenticated |
| 403 | Forbidden | authenticated, not allowed |
| 404 | Not Found | resource missing |
| 405 | Method Not Allowed | wrong verb |
| 409 | Conflict | duplicate / version conflict |
| 422 | Unprocessable | semantic validation failure |
| 429 | Too Many Requests | rate limited (+ `Retry-After`) |
| 500 | Internal Error | unhandled server error |
| 502/503/504 | Gateway/Unavailable/Timeout | upstream/capacity issues |

## URI design conventions

```
GET    /users                 # list
POST   /users                 # create
GET    /users/123             # read one
PUT    /users/123             # full replace
PATCH  /users/123             # partial update
DELETE /users/123             # delete
GET    /users/123/orders      # nested relationship
GET    /users?status=active&sort=-createdAt&page=2&limit=20   # filter/sort/paginate
```
- Plural **nouns**, lowercase, hyphens; **no verbs** in paths.
- Actions that don't fit CRUD: `POST /orders/123/cancel` (pragmatic).

## Express skeleton

```js
const express = require('express');
const app = express();
app.use(express.json());

app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await svc.find(req.params.id);
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json(user);
  } catch (e) { next(e); }       // forward to error middleware
});

// centralized error handler (4 args)
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.code || 'internal_error', message: err.expose ? err.message : undefined });
});

app.listen(3000);
```

## Validation (express-validator / zod)

```js
const { body, validationResult } = require('express-validator');
app.post('/users',
  body('email').isEmail(), body('age').isInt({ min: 18 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    next();
  },
  createUserHandler,
);
```

## Auth (JWT bearer)

```js
const jwt = require('jsonwebtoken');
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try { req.user = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] }); next(); }
  catch { return res.status(401).json({ error: 'invalid_token' }); }
}
```

## Common middleware stack

```js
app.use(helmet());                 // security headers
app.use(cors({ origin: allowed })); // CORS
app.use(express.json({ limit: '1mb' })); // body parse + size limit
app.use(compression());            // gzip
app.use(rateLimit({ windowMs: 60000, max: 100 })); // throttle (use Redis store for a fleet)
app.use(pinoHttp());               // structured request logging
```

## Caching headers

```
Cache-Control: public, max-age=60, stale-while-revalidate=30
ETag: "abc123"            # response sends; client returns If-None-Match -> 304
Last-Modified: <date>     # client returns If-Modified-Since -> 304
```

## Pagination patterns

```
Offset:  GET /items?page=2&limit=20         (simple; bad for large/changing sets)
Cursor:  GET /items?limit=20&cursor=eyJpZCI6MTAwfQ   (stable, scalable; keyset)
Envelope: { "data": [...], "page": {...}, "links": { "next": "..." } }
```

## Versioning

```
URI:        /v1/users         (most common, explicit)
Header:     Accept: application/vnd.api.v1+json
Custom hdr: X-API-Version: 1
```
Keep backward compatibility; additive changes; deprecate with a timeline.

## Idempotency for unsafe ops

```
POST /payments
Idempotency-Key: <uuid>      # server stores key+result; dup key returns original result
```

## AWS placement

```
Client -> CloudFront (+WAF) -> API Gateway (auth/throttle/keys) -> Lambda (Express)   [spiky]
Client -> CloudFront (+WAF) -> ALB -> ECS Fargate (Express/NestJS)                    [steady]
```

## Lead-level gotchas
- Use **nouns + correct verbs + correct status codes** — most "REST" APIs get these wrong.
- **POST is not idempotent** → idempotency keys for retried writes.
- **Stateless** (JWT or external session store) → horizontal scaling.
- **Validate input** (security) + **consistent error shape** (never leak stack traces).
- **Paginate** list endpoints (cursor for scale); **cache** with ETag/Cache-Control + CloudFront.
- **Version** from day one; evolve additively.
- **Rate-limit** with a shared (Redis) store; edge throttling via API Gateway/WAF.
