# 6. Security & Identity (Q72–Q83)

_Part of the [Top 100 Lead Interview Guide](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md). See the [topic index](./README.md) for all categories._

**Prev:** [← 5. Databases & Caching](./05-databases-caching.md) · **Next:** [7. Monitoring & Observability →](./07-monitoring-logging-observability.md)

---

## 6. Security & Identity

### Q72. Explain the AWS IAM model: users, roles, policies, and how a Node.js app on EC2/ECS/Lambda should get credentials.

**Short answer:** Prefer **IAM roles** (temporary, auto-rotated credentials) over long-lived access keys; the app assumes a role via the instance/task/function role, and policies grant least-privilege permissions.

**Detailed answer:**
- **Users:** long-lived identities (mostly for humans/CLI); avoid embedding their access keys in apps.
- **Roles:** assumable identities providing **temporary** credentials via STS — used by EC2 (instance profile), ECS (task role), and Lambda (execution/function role). The AWS SDK picks these up automatically from the environment (no keys in code).
- **Policies:** JSON documents (identity-based or resource-based) granting/denying actions on resources; evaluated as deny-by-default, explicit-deny-wins.

**Lead-level insight:** "No static keys in code or env — use roles." This eliminates the most common AWS breach vector (leaked keys). Mention IRSA (IAM Roles for Service Accounts) on EKS as the per-pod equivalent, and using STS short-lived credentials everywhere.

---

### Q73. How do you implement authentication with Amazon Cognito, and how does it integrate with a Node.js backend?

**Short answer:** Cognito User Pools manage user identities and issue OIDC JWTs; the backend (or API Gateway) verifies these tokens, and Identity Pools can grant temporary AWS credentials for direct service access.

**Detailed answer:**
- **User Pools:** managed user directory with sign-up/sign-in, MFA, password policies, social/SAML/OIDC federation; issues **ID/access/refresh JWTs**.
- **Verification:** the backend validates the JWT signature against Cognito's **JWKS** endpoint and checks issuer, audience, `token_use`, and expiry (NestJS guard or API Gateway Cognito authorizer).
- **Identity Pools (Federated Identities):** exchange a token for temporary AWS credentials so a client can directly access S3/etc. with scoped permissions.

**Lead-level insight:** Offloading auth to Cognito (or another managed IdP) avoids building/maintaining password storage, MFA, and rotation — reducing risk. Verify tokens at the edge (API Gateway authorizer) to reject bad tokens before they reach compute, and still re-check fine-grained authorization in the app.

---

### Q74. How do you manage secrets and encryption keys on AWS?

**Short answer:** Store secrets in Secrets Manager (with rotation) or SSM Parameter Store (SecureString), encrypt with KMS, grant least-privilege access via IAM, and never hard-code or log secrets.

**Detailed answer:**
- **Secrets Manager:** encrypted secret storage with **automatic rotation** (native for RDS), versioning, and fine-grained access. Best for DB credentials/API keys needing rotation.
- **SSM Parameter Store:** cheaper, hierarchical config + SecureString secrets (KMS-encrypted). Good for config and simpler secrets.
- **KMS:** manages encryption keys (CMKs), with key policies, rotation, and audit via CloudTrail. Used to encrypt secrets, S3, EBS, RDS, DynamoDB.
- **Access at runtime:** fetch via the task/function role; cache in memory; refresh on rotation. Inject via ECS `secrets`/Lambda env from Secrets Manager — not baked into images.

**Lead-level insight:** Emphasize **rotation** and **least privilege per secret** (path/ARN-scoped IAM), plus ensuring secrets never land in logs (redact) or in source control (pre-commit secret scanning, e.g., git-secrets/trufflehog).

---

### Q75. How do you design VPC networking for a secure Node.js backend (subnets, security groups, NACLs)?

**Short answer:** Place compute in private subnets, databases in isolated subnets, use public subnets only for load balancers/NAT, control traffic with security groups (stateful, instance-level) and NACLs (stateless, subnet-level), following least privilege.

**Detailed answer:**
- **Subnet tiers:** public (ALB, NAT GW), private app (ECS/EC2/Lambda — no direct internet, egress via NAT), isolated data (RDS/ElastiCache — no internet at all).
- **Security groups (stateful):** allow only required ports between tiers (ALB→app on app port, app→DB on 5432). Reference SGs by ID, not CIDR, so rules follow instances.
- **NACLs (stateless):** subnet-level coarse allow/deny; defense in depth, used sparingly (e.g., block known-bad ranges).
- **VPC Endpoints:** access S3/DynamoDB/Secrets Manager privately without traversing the internet (Gateway/Interface endpoints) — improves security and can cut NAT costs.

**Lead-level insight:** SGs do most of the work (stateful, intuitive); NACLs are a backstop. The pattern is layered: nothing in the data tier is reachable from the internet, app tier egress is controlled, and VPC endpoints keep AWS API traffic off the public internet.

---

### Q76. What are AWS WAF and Shield, and how do they protect your API?

**Short answer:** WAF filters layer-7 HTTP traffic (SQLi/XSS, bot control, rate-based rules, geo/IP blocks) on CloudFront/ALB/API Gateway; Shield protects against DDoS (Standard is automatic; Advanced adds detection, mitigation, and cost protection).

**Detailed answer:**
- **WAF:** managed + custom rules to block common exploits (OWASP-style), rate-based rules to throttle abusive IPs, bot control, geo restrictions, and IP allow/deny lists. Attach to CloudFront, ALB, or API Gateway.
- **Shield Standard:** free, automatic protection against common network/transport (L3/L4) DDoS.
- **Shield Advanced:** enhanced DDoS detection/mitigation, 24/7 response team, and **DDoS cost protection** (refunds scaling charges from attacks).

**Lead-level insight:** Defense in depth at the edge protects both security *and* cost (absorbing/blocking malicious load before it scales your backend). WAF rate-based rules complement app-level rate limiting (Q27). Tune WAF in count mode first to avoid blocking legitimate traffic.

---

### Q77. How do you secure a Node.js/Express/NestJS application against common web vulnerabilities (OWASP Top 10)?

**Short answer:** Validate/sanitize all input, use parameterized queries, set security headers (helmet), enforce authZ on every request, manage secrets safely, and keep dependencies patched.

**Detailed answer:**
- **Injection (SQLi/NoSQLi):** parameterized queries / ORM bindings; never string-concatenate user input; validate types (Q19).
- **XSS:** output encoding, `Content-Security-Policy`, sanitize rich input; for APIs, set proper content types.
- **Security headers:** `helmet` (HSTS, X-Content-Type-Options, frameguard, CSP).
- **Broken access control:** enforce authZ server-side on every endpoint/resource (guards), object-level checks (don't trust IDs from the client — IDOR).
- **Auth/session:** strong JWT validation (Q78), secure cookies (`HttpOnly`, `Secure`, `SameSite`), CSRF protection for cookie-based flows.
- **Sensitive data:** TLS everywhere, encrypt at rest, redact logs.
- **Dependencies (Q82):** `npm audit`, Dependabot/Snyk.
- **Rate limiting** (Q27) and request size limits to prevent abuse/DoS.

**Lead-level insight:** As a lead you bake these into shared middleware, lint rules, code review checklists, and CI security scanning — security as a default, not a per-developer afterthought. Map controls explicitly to OWASP categories to show structured thinking.

---

### Q78. What are best practices for JWT-based authentication, and what are the pitfalls?

**Short answer:** Use short-lived access tokens + refresh tokens, verify signature/issuer/audience/expiry, never put secrets/sensitive data in the payload, and have a revocation strategy.

**Detailed answer:**
- **Validation:** verify signature (prefer asymmetric RS256/ES256 with public keys, e.g., Cognito JWKS — so resource servers don't hold a shared secret), check `iss`, `aud`, `exp`, `nbf`, and algorithm (reject `alg: none` / algorithm confusion).
- **Lifetimes:** short access tokens (minutes) limit damage if leaked; refresh tokens (longer, revocable, stored securely) get new access tokens.
- **Storage:** avoid `localStorage` (XSS-exposed); prefer secure `HttpOnly` cookies or in-memory for SPAs.
- **Revocation:** JWTs are stateless and valid until expiry — for immediate revocation maintain a denylist/`tokenVersion` check or keep access tokens very short.
- **Don't store sensitive data** in the (base64, not encrypted) payload.

**Lead-level insight:** The big pitfalls: long-lived tokens with no revocation, accepting unverified `alg`, and treating the payload as confidential. For high-security needs, mention token binding and rotating refresh tokens with reuse detection.

---

### Q79. How do you implement encryption at rest and in transit across the stack?

**Short answer:** TLS for all in-transit traffic (client→edge and service→service where feasible), and KMS-backed encryption at rest for every datastore (S3, EBS, RDS, DynamoDB, ElastiCache), with key policies and rotation.

**Detailed answer:**
- **In transit:** HTTPS/TLS at CloudFront/ALB/API Gateway (ACM-managed certs); enforce TLS to RDS/ElastiCache; consider mTLS or encryption for internal service-to-service traffic in zero-trust designs.
- **At rest:** enable encryption on S3 (SSE-KMS/SSE-S3), EBS, RDS/Aurora, DynamoDB (default), ElastiCache, and backups — all via **KMS**. 
- **KMS management:** customer-managed keys for control/audit, key rotation, scoped key policies, and CloudTrail logging of key usage.
- **App level:** hash passwords (bcrypt/argon2), encrypt highly sensitive fields (field-level encryption / envelope encryption with KMS data keys).

**Lead-level insight:** "Encrypt everything by default" is the baseline; the lead-level nuance is **key management** — who can use which key, rotation, and separating data access from key access so a single compromised role can't both read data and decrypt it.

---

### Q80. How do you secure inter-service communication and apply zero-trust principles?

**Short answer:** Authenticate and authorize every call (no implicit trust by network location), use least-privilege IAM/service identities, encrypt traffic, and segment the network.

**Detailed answer:**
- **Identity-based auth between services:** IAM (SigV4-signed calls to AWS services / API Gateway IAM auth), mTLS, or signed service tokens — not "it's inside the VPC so it's trusted."
- **Least privilege:** each service's role grants only the specific actions/resources it needs; scope SQS/SNS/S3 resource policies to specific principals.
- **Network segmentation:** SGs restrict which services can talk to which; private subnets + VPC endpoints.
- **Service mesh (App Mesh / Istio on EKS):** consistent mTLS, authz, and observability for service-to-service traffic.

**Lead-level insight:** Zero trust = "never trust, always verify," even internally. The shift from perimeter security to identity-centric security is a strong lead-level theme — defense in depth so a single breached service has minimal blast radius.

---

### Q81. How do you handle audit logging and compliance on AWS?

**Short answer:** Enable CloudTrail for API-level audit, use Config for resource compliance, centralize logs immutably, and apply tagging + retention policies aligned to compliance requirements.

**Detailed answer:**
- **CloudTrail:** records all AWS API calls (who did what, when, from where) — the foundation of audit. Send to a locked-down S3 bucket (Object Lock/immutability) + CloudWatch Logs, organization-wide trail.
- **AWS Config:** tracks resource configuration history and evaluates compliance rules (e.g., "no public S3 buckets," "encryption enabled").
- **Application audit trail:** log security-relevant business events (logins, permission changes, data access) with correlation IDs, immutably stored with defined retention (Q90 on data retention).
- **GuardDuty / Security Hub:** threat detection and centralized security posture.

**Lead-level insight:** Separate **audit** logs (immutable, long retention, restricted access) from operational logs. For regulated domains (PII/PCI/HIPAA), tie retention, encryption, and access controls to the specific compliance regime and prove it with Config rules.

---

### Q82. How do you secure the software supply chain and dependencies in a Node.js project?

**Short answer:** Pin dependencies with a lockfile, scan for vulnerabilities and license issues in CI, scan container images, verify integrity, and minimize/audit third-party packages.

**Detailed answer:**
- **Lockfile + reproducible installs:** commit `package-lock.json`, use `npm ci`; pin versions; enable integrity hashes.
- **Vulnerability scanning:** `npm audit`, Dependabot/Snyk in CI; fail builds on high/critical CVEs; automate patch PRs.
- **Image scanning:** ECR scanning / Trivy for OS + library CVEs; use minimal base images (Q15).
- **Supply-chain hygiene:** beware typosquatting/malicious packages; review new dependencies; limit `postinstall` script execution; consider an internal registry/proxy (CodeArtifact) and SBOM generation.
- **Least privilege in CI/CD:** scoped deploy credentials, no secrets in build logs.

**Lead-level insight:** Supply-chain attacks (compromised npm packages) are a top modern threat. As a lead you institutionalize automated scanning gates, dependency review, and SBOMs rather than relying on ad-hoc `npm audit` runs.

---

### Q83. How do you protect against and respond to a security incident (e.g., leaked credentials)?

**Short answer:** Detect fast (GuardDuty/CloudTrail alarms), contain by revoking/rotating credentials and isolating resources, eradicate the cause, recover, and run a blameless post-mortem — all per a pre-defined runbook.

**Detailed answer:**
- **Detect:** GuardDuty findings, anomalous CloudTrail activity, billing spikes, secret-scanning alerts.
- **Contain:** immediately disable/rotate the exposed key/role, revoke sessions (STS), tighten SGs, snapshot affected resources for forensics.
- **Eradicate & recover:** remove the vulnerability (patch, fix leaked secret in history), restore from clean backups, re-deploy from trusted IaC.
- **Prevent recurrence:** rotate all related secrets, add detection (secret scanning, least privilege), update runbooks.
- **Post-mortem:** blameless RCA with action items.

**Lead-level insight:** Preparation is the differentiator — pre-built runbooks, least privilege (limits blast radius), short-lived credentials (a leaked key expires), and rehearsed game days. A lead owns the incident-response process, not just the fix.

---


