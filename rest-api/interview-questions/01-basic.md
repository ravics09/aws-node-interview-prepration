# REST API Interview Questions — Basic

[← Back to index](./README.md) · Context: **Node.js · Express.js · AWS**

---

### Q1. What is REST and what are its core constraints?

**Answer.** REST (Representational State Transfer) is an architectural **style** for networked APIs built on HTTP. Its constraints:
- **Client-Server** — separation of concerns (UI vs data).
- **Stateless** — each request carries all needed context; the server stores no session state between requests.
- **Cacheable** — responses declare cacheability.
- **Uniform Interface** — resources, standard methods, self-descriptive messages, (HATEOAS).
- **Layered System** — proxies/gateways/LBs can sit between client and server.
- **Code on Demand** (optional) — server can send executable code.

**Lead-level note:** **Statelessness** is the constraint that matters most operationally — it's what lets you scale horizontally behind a load balancer with no sticky sessions.

---

### Q2. What is a "resource" and how should URIs be designed?

**Answer.** A resource is any named entity (a user, an order). It's identified by a URI; you act on it with HTTP methods. Use **plural nouns**, lowercase, hyphens — **no verbs** in the path.

```
GET    /users            # list
POST   /users            # create
GET    /users/123        # read one
PUT    /users/123        # replace
PATCH  /users/123        # partial update
DELETE /users/123        # delete
GET    /users/123/orders # nested relationship
```

```js
const router = require('express').Router();
router.get('/users', list);
router.post('/users', create);
router.get('/users/:id', getOne);
router.get('/users/:id/orders', getUserOrders);  // nested
```

**Lead-level note:** Verbs in URIs (`/getUser`, `/createOrder`) are the classic non-RESTful smell — the HTTP method *is* the verb.

---

### Q3. Explain the main HTTP methods and their semantics.

**Answer.**
- **GET** — read; safe + idempotent.
- **POST** — create / non-idempotent action.
- **PUT** — full replacement; idempotent.
- **PATCH** — partial update.
- **DELETE** — remove; idempotent.
- **HEAD/OPTIONS** — metadata / capabilities (CORS preflight).

```js
app.put('/users/:id', (req, res) => {   // replace entire resource
  const updated = users.replace(req.params.id, req.body);
  res.json(updated);
});
app.patch('/users/:id', (req, res) => { // merge partial fields
  const updated = users.merge(req.params.id, req.body);
  res.json(updated);
});
```

---

### Q4. What's the difference between "safe" and "idempotent" methods?

**Answer.**
- **Safe** — doesn't change server state (GET, HEAD, OPTIONS).
- **Idempotent** — calling it N times has the same effect as once (GET, PUT, DELETE, HEAD).

**POST is neither** safe nor idempotent — repeating it usually creates duplicates.

```js
// Idempotent DELETE: deleting an already-deleted resource still ends in "gone".
app.delete('/users/:id', (req, res) => {
  users.remove(req.params.id);   // no error if already absent
  res.status(204).end();         // 204 No Content
});
```

**Lead-level note:** Idempotency matters for **retries** — clients/proxies can safely retry GET/PUT/DELETE; for POST you need an **idempotency key** (advanced Q1).

---

### Q5. How do you choose the right HTTP status code?

**Answer.** Match the outcome:
- **2xx** success: 200 OK, 201 Created (+`Location`), 202 Accepted (async), 204 No Content.
- **4xx** client error: 400 bad input, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 422 validation, 429 rate-limited.
- **5xx** server error: 500 generic, 503 unavailable.

```js
app.post('/users', async (req, res) => {
  const user = await svc.create(req.body);
  res.status(201).location(`/users/${user.id}`).json(user);  // 201 + Location
});
```

**Lead-level note:** Returning `200` for everything (including errors) is a common anti-pattern — correct codes let clients, proxies, and monitoring behave correctly.

---

### Q6. What does "stateless" mean and why does it matter?

**Answer.** The server keeps **no client session state** between requests; each request includes all needed info (e.g., a JWT). State that must persist lives in a database/cache, not in server memory.

```js
// Stateless auth: token carries identity; no server-side session lookup.
function auth(req, res, next) {
  req.user = jwt.verify(req.headers.authorization?.split(' ')[1], PUBLIC_KEY);
  next();
}
```

**Lead-level note:** Statelessness enables **horizontal scaling** — any instance can serve any request, so you can add/remove instances freely behind an ALB without sticky sessions.

---

### Q7. How do you send and parse JSON in Express?

**Answer.** Use the built-in `express.json()` body parser; respond with `res.json()`.

```js
const app = require('express')();
app.use(express.json({ limit: '1mb' }));   // parse JSON bodies, cap size

app.post('/echo', (req, res) => res.json({ youSent: req.body }));
```

**Lead-level note:** Always set a **body size limit** to prevent memory-exhaustion DoS, and set `Content-Type: application/json` on responses (json() does this).

---

### Q8. What is the difference between path params, query params, and body?

**Answer.**
- **Path params** identify a specific resource: `/users/:id`.
- **Query params** filter/sort/paginate or pass options: `?status=active&page=2`.
- **Body** carries the payload for create/update (POST/PUT/PATCH).

```js
app.get('/users/:id', (req, res) => {       // path param
  const { fields } = req.query;             // query param
  res.json(svc.find(req.params.id, fields));
});
```

**Lead-level note:** Don't put sensitive data in the URL/query (it's logged); use the body/headers. Don't use the body for GET.

---

### Q9. How do you structure a basic CRUD Express route?

**Answer.** Thin controllers delegating to a service, with async/await + a `next(err)` for errors.

```js
const router = require('express').Router();

router.get('/', async (req, res, next) => { try { res.json(await svc.list(req.query)); } catch (e) { next(e); } });
router.post('/', async (req, res, next) => { try { res.status(201).json(await svc.create(req.body)); } catch (e) { next(e); } });
router.get('/:id', async (req, res, next) => {
  try { const u = await svc.find(req.params.id); return u ? res.json(u) : res.status(404).json({ error: 'not_found' }); }
  catch (e) { next(e); }
});
router.put('/:id', async (req, res, next) => { try { res.json(await svc.replace(req.params.id, req.body)); } catch (e) { next(e); } });
router.delete('/:id', async (req, res, next) => { try { await svc.remove(req.params.id); res.status(204).end(); } catch (e) { next(e); } });

module.exports = router;
```

**Lead-level note:** Keep business logic in the **service**, not the route handler — controllers handle HTTP only (testability + reuse).

---

### Q10. What is middleware in Express and how does it work?

**Answer.** Middleware are functions `(req, res, next)` that run in order in the request pipeline; they can read/modify req/res, end the response, or call `next()` to pass control. Error middleware has **four** args `(err, req, res, next)`.

```js
// logging middleware
app.use((req, res, next) => { req.startedAt = Date.now(); next(); });
// route
app.get('/health', (req, res) => res.json({ ok: true }));
// error middleware (must have 4 params)
app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.code || 'internal' }));
```

**Lead-level note:** Order matters — body parsing/auth/validation run before handlers; the error handler is registered **last**. This pipeline is where cross-cutting concerns (auth, logging, rate limiting) live.

---

### Q11. What is the difference between REST and SOAP?

**Answer.** **REST** is a lightweight style, typically JSON over HTTP, flexible and cache-friendly. **SOAP** is a strict XML-based **protocol** with formal contracts (WSDL), built-in standards (WS-Security), heavier and more rigid.

**Lead-level note:** REST dominates modern web/mobile APIs for its simplicity; SOAP persists in legacy/enterprise (banking, telecom) where formal contracts and WS-* standards are required.

---

### Q12. What is content negotiation?

**Answer.** The client states preferred formats via the **`Accept`** header; the server responds with a matching **`Content-Type`**. Enables one endpoint to serve JSON, XML, etc.

```js
app.get('/users/:id', (req, res) => {
  const user = svc.find(req.params.id);
  res.format({
    'application/json': () => res.json(user),
    'application/xml': () => res.type('xml').send(toXml(user)),
    default: () => res.status(406).send('Not Acceptable'),
  });
});
```

**Lead-level note:** Most modern APIs standardize on JSON; content negotiation matters when you must support multiple media types or versioning via media type.
