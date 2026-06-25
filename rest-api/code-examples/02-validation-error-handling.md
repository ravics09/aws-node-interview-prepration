# Example 2 — Validation & Error Handling

[← Back to index](./README.md)

Schema validation with **zod**, a typed `ApiError`, and a single error handler that produces a consistent contract.

## A reusable validation middleware (body/query/params)

```js
const { z } = require('zod');

const validate = (schemas) => (req, res, next) => {
  try {
    if (schemas.body)   req.body   = schemas.body.parse(req.body);
    if (schemas.query)  req.query  = schemas.query.parse(req.query);
    if (schemas.params) req.params = schemas.params.parse(req.params);
    next();
  } catch (err) {
    return res.status(422).json({
      error: 'validation_error',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      requestId: req.id,
    });
  }
};
```

## Schemas + usage

```js
const CreateUser = z.object({
  email: z.string().email(),
  age: z.number().int().min(18),
  role: z.enum(['user', 'admin']).default('user'),
}).strict();                 // .strict() rejects unknown keys (anti mass-assignment)

const IdParam = z.object({ id: z.string().uuid() });

router.post('/v1/users', validate({ body: CreateUser }), createHandler);
router.get('/v1/users/:id', validate({ params: IdParam }), getHandler);
```

## Typed error class + central handler

```js
class ApiError extends Error {
  constructor(status, code, message, { expose = true, details } = {}) {
    super(message);
    Object.assign(this, { status, code, expose, details });
  }
  static notFound(msg = 'Resource not found') { return new ApiError(404, 'not_found', msg); }
  static conflict(msg)  { return new ApiError(409, 'conflict', msg); }
  static forbidden(msg = 'Forbidden') { return new ApiError(403, 'forbidden', msg); }
}

// throw it from anywhere:  throw ApiError.notFound('User does not exist');

// central handler (registered last)
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) req.log.error({ err, requestId: req.id });   // log full detail server-side
  res.status(status).json({
    error: err.code || 'internal_error',
    message: status < 500 && err.expose ? err.message : 'Something went wrong',
    ...(err.details && { details: err.details }),
    requestId: req.id,
  });
}
```

## Handling unexpected/programmer errors safely

```js
// async route errors are forwarded to errorHandler via wrap() (see example 1)
// process-level safety net:
process.on('unhandledRejection', (reason) => { logger.fatal({ reason }); gracefulShutdown(); });
process.on('uncaughtException', (err) => { logger.fatal({ err }); gracefulShutdown(); });
```

## The consistent error contract

```json
{
  "error": "validation_error",
  "message": "Invalid request",
  "details": [{ "field": "email", "message": "Invalid email" }],
  "requestId": "f1a2b3c4"
}
```

## Why this matters
- **`.strict()`** rejects unknown fields → prevents **mass-assignment** and surfaces typos.
- **One error shape** across the whole API → predictable client handling + easy docs.
- **Never leak internals on 5xx**; log them server-side with a **requestId** the client can quote.
- **Right codes:** 422 (validation), 404 (missing), 409 (conflict), 403 (forbidden), 500 (unexpected).
