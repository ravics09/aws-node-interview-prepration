# REST API — Lead Interview Prep (Node.js · Express.js · AWS)

Everything REST API for a **Lead / Senior Backend** interview, with Express.js code logic and AWS integration throughout.

## Categories

| Folder | What's inside |
|--------|---------------|
| [`interview-questions/`](./interview-questions/README.md) | **Basic → Advanced** REST questions with detailed answers + **Node/Express code logic** |
| [`code-examples/`](./code-examples/README.md) | Practical **REST + Node + Express + AWS** code (CRUD, auth, validation, pagination, S3/DynamoDB, deploy) |
| [`cheatsheet/`](./cheatsheet/rest-api-cheatsheet.md) | Dense reference: methods, status codes, conventions, headers, Express snippets |
| [`rapid-fire/`](./rapid-fire/rest-api-rapid-fire.md) | ~50 top-rated quick Q&A definitions for fast recall |

## The REST essentials a lead must nail
1. **REST constraints:** client-server, **stateless**, cacheable, uniform interface, layered system, (code-on-demand optional).
2. **Resource-oriented** design: nouns not verbs (`/orders/123`, not `/getOrder`).
3. **HTTP methods + semantics:** safe vs idempotent (GET/PUT/DELETE idempotent; POST not).
4. **Status codes** used correctly (2xx/3xx/4xx/5xx).
5. **Statelessness** → horizontal scaling (no server-side session affinity).
6. **Versioning, pagination, filtering, sorting** conventions.
7. **Idempotency keys** for safe retries of unsafe operations.
8. **Caching** (ETag, Cache-Control) + CDN (CloudFront).
9. **Security:** authN/authZ (JWT), HTTPS, CORS, input validation, rate limiting.
10. **Consistent error contract** + good docs (OpenAPI).

## Related material in this repo
- Express vs NestJS, API design (Q21, Q30): [../guide/AWS-NodeJS-Lead-Interview-100-Questions.md](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md)
- API Gateway practical guide: [../practical-usecases/03-amazon-api-gateway.md](../practical-usecases/03-amazon-api-gateway.md)
- Microservice patterns (API Gateway, BFF, composition): [../microservices-nodejs/README.md](../microservices-nodejs/README.md)
