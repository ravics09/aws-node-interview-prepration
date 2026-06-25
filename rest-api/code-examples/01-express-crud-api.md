# Example 1 — CRUD REST API (Express, layered)

[← Back to index](./README.md)

A clean, layered CRUD API: **router → controller (thin) → service (logic) → repository (data)**, with async error forwarding and a central error handler.

## app.js — wiring & cross-cutting middleware

```js
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const pinoHttp = require('pino-http');
const crypto = require('crypto');

const app = express();
app.use(helmet());                                   // security headers
app.use(compression());                              // gzip
app.use(express.json({ limit: '1mb' }));             // body parse + size cap
app.use(pinoHttp({ genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID() })); // correlation id + logs

app.use('/v1/users', require('./users.router'));     // versioned mount

app.get('/health/ready', (_req, res) => res.json({ status: 'ready' }));

// 404 for unmatched routes
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// central error handler (4 args) — registered LAST
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  req.log.error({ err });
  res.status(status).json({
    error: err.code || 'internal_error',
    message: status < 500 ? err.message : 'Something went wrong',
    requestId: req.id,
  });
});

module.exports = app;
```

## users.router.js — routes (thin controllers)

```js
const router = require('express').Router();
const svc = require('./users.service');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); // async error forwarding

router.get('/', wrap(async (req, res) => res.json(await svc.list(req.query))));

router.post('/', wrap(async (req, res) => {
  const user = await svc.create(req.body);
  res.status(201).location(`/v1/users/${user.id}`).json(user);   // 201 + Location
}));

router.get('/:id', wrap(async (req, res) => {
  const user = await svc.find(req.params.id);
  if (!user) { const e = new Error('User not found'); e.status = 404; e.code = 'user_not_found'; throw e; }
  res.json(user);
}));

router.put('/:id', wrap(async (req, res) => res.json(await svc.replace(req.params.id, req.body))));
router.patch('/:id', wrap(async (req, res) => res.json(await svc.update(req.params.id, req.body))));
router.delete('/:id', wrap(async (req, res) => { await svc.remove(req.params.id); res.status(204).end(); }));

module.exports = router;
```

## users.service.js — business logic

```js
const repo = require('./users.repo');

exports.list = (query) => repo.findAll(query);
exports.find = (id) => repo.findById(id);
exports.create = async (data) => {
  if (await repo.findByEmail(data.email)) { const e = new Error('Email already exists'); e.status = 409; e.code = 'email_conflict'; throw e; }
  return repo.insert(data);
};
exports.replace = (id, data) => repo.replace(id, data);
exports.update = (id, data) => repo.update(id, data);
exports.remove = (id) => repo.remove(id);
```

## server.js — bootstrap + graceful shutdown

```js
const app = require('./app');
const server = app.listen(process.env.PORT || 3000);

function shutdown() {
  server.close(async () => { await require('./db').end(); process.exit(0); }); // drain + close pool
  setTimeout(() => process.exit(1), 25_000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

## Why this structure
- **Separation:** router (HTTP) → service (logic) → repo (data) — testable and reusable.
- **`wrap()`** forwards async errors to one central handler (no try/catch in every route).
- **Correct codes:** 201 + `Location` on create, 204 on delete, 404/409 with a consistent error shape.
- **Graceful shutdown** for zero-downtime deploys on ECS/Fargate.
