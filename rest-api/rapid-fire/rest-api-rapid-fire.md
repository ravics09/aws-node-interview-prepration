# REST API Rapid Fire (~50 Top-Rated)

Quick one- to two-line answers for fast recall. For depth, see the [interview questions](../interview-questions/README.md).

---

## REST fundamentals
1. **What is REST?** An architectural style for networked APIs using HTTP, resources, and a uniform interface — Representational State Transfer.
2. **Is REST a protocol?** No — it's a style/set of constraints; HTTP is the protocol it typically uses.
3. **Core REST constraints?** Client-server, stateless, cacheable, uniform interface, layered system, (optional) code-on-demand.
4. **What is a resource?** Any named entity exposed by the API (e.g., a user, order), identified by a URI.
5. **What makes an API "RESTful"?** Resource-oriented URIs, correct HTTP methods/status codes, statelessness, and a uniform interface.
6. **REST vs SOAP?** REST = lightweight, JSON over HTTP, flexible; SOAP = heavy XML protocol with strict contracts (WSDL).
7. **REST vs GraphQL?** REST = multiple endpoints, fixed shapes; GraphQL = one endpoint, client picks fields (solves over/under-fetching).
8. **REST vs gRPC?** REST/JSON = human-readable, broad; gRPC = binary (protobuf) over HTTP/2, faster for internal service-to-service.

## HTTP methods & semantics
9. **GET?** Retrieve a resource. Safe + idempotent. No body.
10. **POST?** Create a resource / non-idempotent action. Not safe, not idempotent.
11. **PUT?** Replace a resource fully. Idempotent.
12. **PATCH?** Partially update a resource. Not guaranteed idempotent.
13. **DELETE?** Remove a resource. Idempotent.
14. **HEAD?** Like GET but headers only (no body).
15. **OPTIONS?** Describe allowed methods / CORS preflight.
16. **Safe method?** Doesn't modify state (GET, HEAD, OPTIONS).
17. **Idempotent method?** Same effect whether called once or many times (GET, PUT, DELETE, HEAD).
18. **Is POST idempotent?** No — repeating it usually creates duplicates (use idempotency keys).
19. **PUT vs PATCH?** PUT replaces the whole resource; PATCH applies a partial update.
20. **PUT vs POST for create?** POST when the server assigns the ID; PUT when the client specifies the resource URI.

## Status codes
21. **2xx?** Success: 200 OK, 201 Created, 202 Accepted, 204 No Content.
22. **201 vs 200?** 201 = resource created (include `Location` header); 200 = generic success.
23. **204?** Success with no response body (common for DELETE/PUT).
24. **3xx?** Redirection: 301 (permanent), 302/307 (temporary), 304 (Not Modified — caching).
25. **400?** Bad Request — malformed/invalid input.
26. **401 vs 403?** 401 = not authenticated; 403 = authenticated but not authorized.
27. **404?** Resource not found.
28. **405?** Method Not Allowed on this resource.
29. **409?** Conflict (e.g., duplicate, version conflict).
30. **422?** Unprocessable Entity — semantic validation failure.
31. **429?** Too Many Requests — rate limited (include `Retry-After`).
32. **5xx?** Server errors: 500 (generic), 502 (bad gateway), 503 (unavailable), 504 (gateway timeout).

## Design & conventions
33. **URI naming?** Use plural nouns, lowercase, hyphens: `/users/123/orders` — not verbs.
34. **How to model relationships?** Nested resources: `/users/123/orders`.
35. **Filtering/sorting/pagination?** Query params: `?status=active&sort=-createdAt&page=2&limit=20`.
36. **Pagination types?** Offset/limit (simple) vs cursor/keyset (stable, scalable).
37. **API versioning options?** URI (`/v1`), header (`Accept`/custom), or media-type; pick one and stay backward-compatible.
38. **What is HATEOAS?** Responses include links to related actions/resources (the hypermedia constraint).
39. **Content negotiation?** Client uses `Accept` header; server responds with matching `Content-Type`.
40. **Idempotency key?** A client-supplied unique key so retried POSTs don't duplicate side effects.

## Caching, security, performance
41. **How to cache REST responses?** `Cache-Control`, `ETag` + `If-None-Match` (304), `Last-Modified`; CDN (CloudFront) at the edge.
42. **What is an ETag?** A response fingerprint; client sends `If-None-Match` to get 304 if unchanged.
43. **Statelessness benefit?** Any server can handle any request → easy horizontal scaling, no sticky sessions.
44. **How do you authenticate REST APIs?** JWT/OAuth2 bearer tokens, API keys; always over HTTPS.
45. **JWT vs session?** JWT = stateless token (no server store); session = server-side state (needs shared store to scale).
46. **What is CORS?** Browser security controlling cross-origin requests; server sets `Access-Control-Allow-*` headers.
47. **CSRF — when relevant?** With cookie-based auth; mitigate with tokens/`SameSite`. Bearer-token APIs are largely immune.
48. **Rate limiting?** Cap requests per client (token bucket/sliding window); 429 + `Retry-After`; back with Redis across a fleet.
49. **How to handle errors consistently?** A standard error shape (code, message, details) + correct status; never leak stack traces.
50. **On AWS, what fronts a REST API?** API Gateway (auth/throttle/keys) or ALB; CloudFront + WAF at the edge; Express on Lambda or ECS/Fargate.
