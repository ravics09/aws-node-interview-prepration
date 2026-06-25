# Example 3 — Authentication (JWT) & Authorization

[← Back to index](./README.md)

Stateless **JWT** authentication + role/ownership **authorization** middleware. Verifies against a JWKS (e.g., Amazon Cognito) using RS256.

## Authentication middleware (RS256 via JWKS — Cognito-style)

```js
const { createRemoteJWKSet, jwtVerify } = require('jose');

const ISSUER = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`)); // cached/refreshed

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      algorithms: ['RS256'],         // reject alg:none / algorithm confusion
    });
    req.user = { sub: payload.sub, roles: payload['cognito:groups'] || [], email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
```

## Authorization: role-based + object-level (prevent IDOR)

```js
// Role check
const requireRole = (...roles) => (req, res, next) =>
  roles.some((r) => req.user?.roles?.includes(r))
    ? next()
    : res.status(403).json({ error: 'forbidden' });

// Object-level ownership check — don't just trust the role, check the relationship
const requireOwnership = (loadResource) => async (req, res, next) => {
  const resource = await loadResource(req.params.id);
  if (!resource) return res.status(404).json({ error: 'not_found' });
  if (resource.ownerId !== req.user.sub && !req.user.roles.includes('admin')) {
    return res.status(403).json({ error: 'forbidden' });   // authenticated but not allowed
  }
  req.resource = resource;
  next();
};
```

## Applying it

```js
app.get('/v1/me', authenticate, (req, res) => res.json(req.user));

app.delete('/v1/users/:id', authenticate, requireRole('admin'), deleteUser);

app.get('/v1/orders/:id',
  authenticate,
  requireOwnership((id) => orders.find(id)),   // ensures the caller owns the order
  (req, res) => res.json(req.resource),
);
```

## Simple HS256 issuance (for self-issued tokens; prefer an IdP like Cognito)

```js
const jwt = require('jsonwebtoken');
function issueTokens(user) {
  const access = jwt.sign({ sub: user.id, roles: user.roles }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign({ sub: user.id, type: 'refresh' }, process.env.REFRESH_SECRET, { expiresIn: '7d' });
  return { access, refresh };
}
```

## Key practices
- **Verify** signature + `iss`/`aud`/`exp`; pin `algorithms` (reject `alg: none`).
- Prefer **asymmetric (RS256) + JWKS** (Cognito) so resource servers hold no shared secret.
- **Short-lived access tokens** (minutes) + revocable refresh tokens.
- **401 vs 403:** 401 = not authenticated, 403 = authenticated but not allowed.
- **Object-level authz** prevents **IDOR** — always check the user owns the resource, not just their role.
- On AWS, you can also verify JWTs at the **API Gateway Cognito/JWT authorizer** before requests reach Express.
