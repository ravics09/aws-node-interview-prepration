# Rapid-Fire Round — Q101–Q150

> **Quick definitions to complement the [deep-dive 100 questions](../AWS-NodeJS-Lead-Interview-100-Questions.md).**
> These are short, punchy answers for fast recall — the kind of crisp definitions interviewers expect when they fire questions in quick succession. Each is 1–3 sentences. Use these for last-minute revision and to sharpen terminology.

**Stack:** Node.js · NestJS · Express.js · AWS

---

## Contents

- [Node.js & JavaScript Runtime](#nodejs--javascript-runtime) — Q101–Q112
- [NestJS & Express.js](#nestjs--expressjs) — Q113–Q122
- [AWS Core Services](#aws-core-services) — Q123–Q136
- [Scaling, Resilience & Networking](#scaling-resilience--networking) — Q137–Q143
- [Security, Data & Observability](#security-data--observability) — Q144–Q150

---

## Node.js & JavaScript Runtime

**Q101. What is the difference between `require` (CommonJS) and `import` (ES Modules)?**
`require` is synchronous, CommonJS, resolved at runtime, and allows dynamic paths; `import` is the ESM standard, statically analyzable (enabling tree-shaking), supports top-level `await`, and is asynchronously resolved. Node supports both; ESM is the modern direction.

**Q102. What is the difference between `Buffer` and a stream?**
A `Buffer` holds a fixed chunk of binary data fully in memory; a stream processes data incrementally in chunks, keeping memory flat for large payloads. Use streams for large files/network data.

**Q103. What is the difference between `setTimeout` and `setInterval`?**
`setTimeout` runs a callback once after a delay; `setInterval` runs it repeatedly at a fixed interval until cleared with `clearInterval`. Neither guarantees exact timing (subject to event-loop load).

**Q104. What does `Promise.race` do vs `Promise.any`?**
`Promise.race` settles as soon as the first promise settles (resolve *or* reject); `Promise.any` resolves with the first *fulfilled* promise and only rejects if all reject (with an `AggregateError`).

**Q105. What is `Promise.allSettled` used for?**
It waits for all promises to settle and returns an array of `{status, value|reason}` — useful when you want every result regardless of individual failures (unlike `Promise.all`, which fails fast).

**Q106. What is the purpose of `AbortController` in Node.js?**
It provides a standard way to cancel async operations (fetch, timers, streams) by passing its `signal`; calling `abort()` triggers cancellation and an `AbortError`. Essential for request timeouts and cleanup.

**Q107. What is `AsyncLocalStorage`?**
A Node API (built on async hooks) that maintains context across asynchronous call chains without passing it explicitly — commonly used for request-scoped data like correlation IDs and tenant context.

**Q108. What is the difference between `process.env` and a config module?**
`process.env` is the raw environment-variable map (strings only, unvalidated); a config module wraps it with parsing, defaults, type coercion, and validation so the app fails fast on misconfiguration.

**Q109. What is a memory leak vs high memory usage?**
A leak is *unbounded* growth of retained memory that never frees (a bug); high usage is large but stable memory that the app legitimately needs. A leak eventually crashes the process; high usage just needs right-sizing.

**Q110. What is the difference between CPU-bound and I/O-bound work?**
CPU-bound work saturates the processor (hashing, parsing, image processing) and blocks Node's single thread; I/O-bound work waits on external resources (DB, network, disk) and is handled efficiently by the async event loop.

**Q111. What is `npm ci` and why prefer it in CI/CD?**
`npm ci` does a clean, reproducible install strictly from `package-lock.json` (deleting `node_modules` first) — faster and deterministic, unlike `npm install`, which may update the lockfile.

**Q112. What is tree-shaking and why does it matter?**
Tree-shaking is dead-code elimination during bundling — unused exports are dropped, shrinking the bundle. It reduces Lambda cold-start time and container image size (e.g., bundling NestJS/Express with esbuild).

---

## NestJS & Express.js

**Q113. What is a NestJS provider?**
Any class (service, repository, factory, helper) that can be injected via DI — declared in a module's `providers` and resolved by the IoC container.

**Q114. What is the default scope of a NestJS provider?**
**Singleton** — one shared instance across the whole application. Other scopes are `REQUEST` (new per request) and `TRANSIENT` (new per consumer).

**Q115. What does the `@Module` decorator's `exports` array do?**
It makes a module's providers available to other modules that import it — without `exports`, providers are private to their declaring module (encapsulation).

**Q116. What is the difference between a NestJS guard and middleware?**
Middleware runs early with raw `req/res` (logging, parsing); guards run after route binding, return a boolean to allow/deny access, and integrate with route metadata/decorators — ideal for auth.

**Q117. What is the `Reflector` in NestJS?**
A utility to read custom metadata set by decorators (e.g., `@Roles('admin')`) at runtime — used inside guards/interceptors to make decisions based on route metadata.

**Q118. What is a DTO?**
A Data Transfer Object — a typed class defining the shape of request/response data, used with `class-validator`/`class-transformer` for validation and transformation.

**Q119. What is the difference between `@nestjs/platform-express` and `@nestjs/platform-fastify`?**
They are interchangeable HTTP adapters under Nest; Express is the default (largest ecosystem), Fastify offers higher throughput and lower overhead. You can swap adapters with minimal code changes.

**Q120. In Express, what is the signature of error-handling middleware?**
It takes four arguments — `(err, req, res, next)`. The four-parameter arity is how Express recognizes it as an error handler.

**Q121. What is the difference between `app.use` and `app.get` in Express?**
`app.use` mounts middleware for all HTTP methods (and optionally a path prefix); `app.get` (and `post`, etc.) registers a handler for a specific method and exact route.

**Q122. What is a NestJS interceptor most commonly used for?**
Wrapping the request/response lifecycle — transforming responses, adding caching, measuring latency, logging, and mapping/serializing output.

---

## AWS Core Services

**Q123. What is the difference between S3 and EBS?**
S3 is object storage accessed over HTTP (unlimited, durable, for files/backups/static assets); EBS is block storage attached to a single EC2 instance (like a virtual disk for a filesystem/database).

**Q124. What is the difference between S3 and EFS?**
S3 is object storage (API access, not a filesystem); EFS is a managed NFS filesystem that can be mounted by many EC2/ECS/Lambda instances simultaneously for shared POSIX file access.

**Q125. What are S3 storage classes?**
Tiers balancing cost vs access: Standard (frequent), Standard-IA / One Zone-IA (infrequent), Intelligent-Tiering (auto-moves), Glacier Instant/Flexible/Deep Archive (cold/archival, cheapest, slower retrieval).

**Q126. What is the difference between SQS and SNS?**
SQS is a pull-based message *queue* (one consumer group processes each message); SNS is push-based *pub/sub* that fans a message out to many subscribers. They're often combined (SNS→SQS fan-out).

**Q127. What is the difference between SQS Standard and FIFO queues?**
Standard = high throughput, at-least-once delivery, best-effort ordering; FIFO = strict ordering and exactly-once processing within a message group, at lower throughput.

**Q128. What is a Dead Letter Queue (DLQ)?**
A separate queue that receives messages which repeatedly failed processing (after `maxReceiveCount`), isolating "poison" messages for inspection/replay without blocking the main queue.

**Q129. What is the difference between Kinesis Data Streams and Firehose?**
Data Streams is a low-latency, replayable streaming service you consume with custom code (ordered per shard); Firehose is a fully managed delivery service that batches and loads streaming data into S3/Redshift/OpenSearch with no consumer code.

**Q130. What is the difference between an ALB, NLB, and CLB?**
ALB = layer-7 (HTTP/HTTPS, path/host routing, WebSockets); NLB = layer-4 (TCP/UDP, ultra-high performance, static IP, low latency); CLB = legacy classic load balancer (avoid for new work).

**Q131. What is the difference between a security group and a NACL?**
A security group is stateful and operates at the instance/ENI level (return traffic auto-allowed); a NACL is stateless and operates at the subnet level (must allow both directions explicitly).

**Q132. What is the difference between the ECS task role and execution role?**
The **task role** grants permissions to your *application code* at runtime (e.g., read DynamoDB); the **execution role** grants ECS itself permissions to pull the image from ECR and fetch secrets/write logs.

**Q133. What is AWS Fargate?**
A serverless compute engine for containers (ECS/EKS) that runs them without you managing the underlying EC2 hosts — you specify CPU/memory and AWS provisions/patches the infrastructure.

**Q134. What is an AWS VPC endpoint?**
A private connection from your VPC to AWS services (Gateway endpoints for S3/DynamoDB, Interface endpoints for others) so traffic stays on the AWS network instead of traversing the public internet.

**Q135. What is the difference between CloudFormation, CDK, and Terraform?**
CloudFormation is AWS's native declarative IaC (JSON/YAML); CDK lets you define infra in real languages (e.g., TypeScript) that synthesize to CloudFormation; Terraform is a multi-cloud IaC tool using HCL with its own state.

**Q136. What is the difference between API Gateway REST APIs and HTTP APIs?**
REST APIs offer more features (request validation, API keys/usage plans, WAF, caching, fine-grained control); HTTP APIs are cheaper, lower-latency, and simpler — preferred when you don't need the advanced REST API features.

---

## Scaling, Resilience & Networking

**Q137. What is horizontal vs vertical scaling?**
Horizontal scaling adds more instances (scale out); vertical scaling adds more power (CPU/RAM) to a single instance (scale up). Horizontal is more elastic and fault-tolerant; vertical is simpler but has a ceiling.

**Q138. What is the difference between an Auto Scaling Group and a target group?**
An Auto Scaling Group manages the *number* of EC2 instances (launch/terminate based on policies); a target group is the set of registered targets a load balancer routes to and health-checks.

**Q139. What is a sticky session and why avoid it?**
Sticky sessions pin a user to one backend instance (via cookie). They break statelessness, cause uneven load, and lose session data if that instance dies — prefer externalized state (Redis/JWT).

**Q140. What is the difference between latency and throughput?**
Latency is the time for a single request to complete; throughput is how many requests the system handles per unit time. Optimizing one doesn't automatically improve the other.

**Q141. What is a cold start?**
The added latency when a serverless function (or scaled-out container) initializes a fresh execution environment — provisioning, loading the runtime, and running init code — before handling its first request.

**Q142. What is graceful degradation?**
Designing a system to keep serving reduced functionality when a dependency fails (e.g., serve cached/default data when a service is down) instead of failing completely.

**Q143. What is the difference between RTO and RPO?**
RTO (Recovery Time Objective) = how quickly you must restore service after an outage; RPO (Recovery Point Objective) = the maximum acceptable amount of data loss measured in time.

---

## Security, Data & Observability

**Q144. What is the difference between authentication and authorization?**
Authentication verifies *who you are* (identity); authorization determines *what you're allowed to do* (permissions). AuthN comes first, then AuthZ.

**Q145. What is the principle of least privilege?**
Granting each user, role, or service only the minimum permissions needed to do its job — limiting the blast radius if credentials are compromised.

**Q146. What is the difference between symmetric and asymmetric encryption?**
Symmetric uses one shared key for encrypt/decrypt (fast, e.g., AES); asymmetric uses a public/private key pair (slower, enables signatures and key exchange, e.g., RSA/JWT RS256).

**Q147. What is the difference between hashing and encryption?**
Hashing is a one-way, irreversible transform (for passwords/integrity, e.g., bcrypt/SHA-256); encryption is reversible with a key (for confidentiality). Passwords should be hashed (with salt), never encrypted.

**Q148. What is the difference between strong and eventual consistency?**
Strong consistency guarantees every read returns the latest write; eventual consistency allows temporary staleness that converges over time (favoring availability/scale). DynamoDB offers both read modes.

**Q149. What are the three pillars of observability?**
**Metrics** (numeric time-series), **logs** (discrete event records), and **traces** (request paths across services). Together they let you understand system behavior and debug unknown issues.

**Q150. What is the difference between liveness and readiness probes?**
Liveness checks whether the process is alive (failure → restart it); readiness checks whether it can serve traffic right now (failure → stop routing to it without restarting). Keep them separate to avoid correlated fleet failures.

---

## Closing Tip

Rapid-fire rounds test *breadth and precision of vocabulary*. Answer crisply, then offer to go deeper: *"That's the short version — I can walk through the trade-offs if useful."* This signals confidence without over-talking. For the detailed reasoning behind these terms, see the [main 100-question guide](../AWS-NodeJS-Lead-Interview-100-Questions.md).
