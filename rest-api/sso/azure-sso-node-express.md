# Azure SSO with Node.js + Express — Full Implementation

[← Back to SSO index](./README.md)

Azure SSO = **Microsoft Entra ID** (formerly Azure Active Directory) using **OAuth 2.0 / OpenID Connect**. Microsoft's recommended library is **MSAL** (`@azure/msal-node`). We'll implement it two ways: (A) **MSAL** (recommended/current), and (B) **standards-based** with `openid-client`.

---

## 1. Provider setup (Azure Portal → Microsoft Entra ID)

1. **Entra ID → App registrations → New registration.**
2. Set **Redirect URI** (Web): `http://localhost:3000/auth/azure/callback` (+ prod).
3. Note the **Application (client) ID** and **Directory (tenant) ID**.
4. **Certificates & secrets → New client secret** → copy the value.
5. **API permissions** → Microsoft Graph delegated: `openid`, `profile`, `email`, `User.Read`.
6. (Multi-tenant vs single-tenant) choose **Supported account types** accordingly.

```bash
# .env
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # or "common" for multi-tenant
AZURE_CLIENT_SECRET=xxxxxxxx
AZURE_REDIRECT_URI=http://localhost:3000/auth/azure/callback
SESSION_SECRET=long-random-string
JWT_SECRET=another-long-random-string
```

```bash
npm i express express-session @azure/msal-node jsonwebtoken
# Approach B: npm i openid-client
```

---

## 2. Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant A as Express App
    participant E as Microsoft Entra ID
    U->>A: GET /auth/azure
    A->>U: 302 to Entra /authorize (client_id, redirect_uri, scope=openid profile email, state, PKCE)
    U->>E: Sign in (work/school or personal account)
    E->>U: 302 /auth/azure/callback?code&state
    U->>A: GET callback?code
    A->>E: exchange code -> id_token + access_token (with client_secret + PKCE verifier)
    A->>A: MSAL validates id_token; create app session/JWT
    A->>U: set cookie / token
```

---

## Approach A — MSAL (`@azure/msal-node`, recommended)

```js
// auth-azure.js
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ConfidentialClientApplication, CryptoProvider } = require('@azure/msal-node');

const msal = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
});
const cryptoProvider = new CryptoProvider();
const router = express.Router();
const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

// 1) Start login (with PKCE + state)
router.get('/auth/azure', async (req, res, next) => {
  try {
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = crypto.randomBytes(16).toString('hex');
    req.session.pkce = { verifier, state };                 // store for the callback

    const authUrl = await msal.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: process.env.AZURE_REDIRECT_URI,
      responseMode: 'query',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state,
    });
    res.redirect(authUrl);
  } catch (err) { next(err); }
});

// 2) Callback: validate state, exchange code (MSAL validates the id_token)
router.get('/auth/azure/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code || state !== req.session.pkce?.state) return res.status(400).json({ error: 'invalid_state' });

    const result = await msal.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: process.env.AZURE_REDIRECT_URI,
      codeVerifier: req.session.pkce.verifier,              // PKCE
    });

    // result.account / result.idTokenClaims are validated by MSAL
    const claims = result.idTokenClaims;                    // { oid, preferred_username, name, email, ... }
    const user = await upsertUser({
      provider: 'azure',
      providerId: claims.oid,                               // stable object id
      email: claims.email || claims.preferred_username,
      name: claims.name,
    });

    const token = jwt.sign({ sub: user.id, email: user.email, provider: 'azure' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    res.cookie('access_token', token, { httpOnly: true, secure: true, sameSite: 'lax' });
    res.redirect(process.env.FRONTEND_URL || '/');
  } catch (err) { next(err); }
});

module.exports = router;
```

```js
// app.js
const express = require('express');
const session = require('express-session');
const app = express();
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: true, sameSite: 'lax' } }));
app.use(require('./auth-azure'));
app.listen(3000);
```

> MSAL handles **token acquisition, caching, refresh, and id_token validation**. The `oid` (object ID) claim is the **stable** user identifier in Entra ID (`sub` is per-app-pairwise; `oid` is constant for the user in the tenant).

---

## Approach B — Standards-based with `openid-client`

```js
const { Issuer, generators } = require('openid-client');

const entraIssuer = await Issuer.discover(
  `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,   // OIDC discovery
);
const client = new entraIssuer.Client({
  client_id: process.env.AZURE_CLIENT_ID,
  client_secret: process.env.AZURE_CLIENT_SECRET,
  redirect_uris: [process.env.AZURE_REDIRECT_URI],
  response_types: ['code'],
});

router.get('/auth/azure', (req, res) => {
  const state = generators.state();
  const nonce = generators.nonce();
  const code_verifier = generators.codeVerifier();
  req.session.oidc = { state, nonce, code_verifier };
  res.redirect(client.authorizationUrl({
    scope: 'openid profile email',
    state, nonce,
    code_challenge: generators.codeChallenge(code_verifier),
    code_challenge_method: 'S256',
  }));
});

router.get('/auth/azure/callback', async (req, res, next) => {
  try {
    const { state, nonce, code_verifier } = req.session.oidc || {};
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(process.env.AZURE_REDIRECT_URI, params, { state, nonce, code_verifier });
    const claims = tokenSet.claims();   // verified id_token (sig/iss/aud/exp/nonce)
    const user = await upsertUser({ provider: 'azure', providerId: claims.oid || claims.sub, email: claims.email || claims.preferred_username, name: claims.name });
    // issue app JWT/session...
    res.redirect('/');
  } catch (err) { next(err); }
});
```

---

## Logout (Entra ID supports federated sign-out)

```js
router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {});
  const url = new URL(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/logout`);
  url.search = new URLSearchParams({ post_logout_redirect_uri: process.env.FRONTEND_URL || 'http://localhost:3000/' }).toString();
  res.redirect(url.toString());   // ends the Entra session too
});
```

---

## Calling Microsoft Graph (e.g., get the user's profile/photo)

```js
// Use the access_token from the MSAL result to call Graph
const graph = await fetch('https://graph.microsoft.com/v1.0/me', {
  headers: { Authorization: `Bearer ${result.accessToken}` },
}).then((r) => r.json());   // requires the User.Read scope
```

---

## Security & production notes
- Use **MSAL** (current/recommended) — `passport-azure-ad` is legacy. MSAL handles validation, caching, and refresh.
- Always use **Authorization Code flow + PKCE** (both approaches above do).
- Validate **`state`** (CSRF) and **`nonce`** (replay); MSAL/openid-client validate the **`id_token`** (signature via JWKS, `iss`, `aud`, `exp`).
- **`tenant` choice:** a specific tenant ID = single-tenant (only your org); `common`/`organizations`/`consumers` = multi-tenant/personal — validate the `tid` (tenant id) claim if multi-tenant to restrict who can sign in.
- Use **`oid`** (object id) as the stable user key, not `email`/`upn` (which can change).
- Keep **client secret** in **Secrets Manager/SSM** (or use **certificate credentials** for higher security); rotate regularly.
- Cookies `HttpOnly`/`Secure`/`SameSite`; HTTPS only; redirect URIs must match exactly.
- On AWS, you can also federate **Entra ID into Cognito** (OIDC IdP) so your app integrates once with Cognito and supports Azure + Google + Facebook together (see the AWS/Cognito guide).
