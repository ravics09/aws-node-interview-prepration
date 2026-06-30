# AWS Reference — Lead Interview Prep (AWS + Node.js)

A focused AWS knowledge pack for **Lead / Senior Backend** interviews, written from the perspective of someone who runs Node.js / NestJS workloads on AWS. Less "what is service X," more "when do I reach for it, what breaks at scale, and what do I say to an interviewer."

## Contents

| File | What it covers | Best for |
|------|----------------|----------|
| [aws-cheatsheet.md](./aws-cheatsheet.md) | Dense reference of the services, limits, and facts a Node.js backend lead should recall instantly | Night-before revision |
| [aws-services-quick-review.md](./aws-services-quick-review.md) | Per-service review: what it is, when to use, key features, Node.js tie-in, gotchas | Refreshing a specific service |
| [aws-services-comparison.md](./aws-services-comparison.md) | Head-to-head decision tables (compute, messaging, databases, storage, caching, auth, IaC, observability) | "X vs Y, which and why?" questions |
| [aws-services-realtime-scenarios.md](./aws-services-realtime-scenarios.md) | 15 real-world scenarios with recommended architectures + lead-level reasoning | System-design rounds |
| [aws-services-realtime-scenarios-detailed.md](./aws-services-realtime-scenarios-detailed.md) | **Long-form** interview walkthroughs of the same 15 scenarios — how to actually explain each one out loud, with deep reasoning, failure modes, and cost/scale | Practicing spoken system-design answers |

## Related material in this repo

- Deep-dive interview guide: [../guide/AWS-NodeJS-Lead-Interview-100-Questions.md](../guide/AWS-NodeJS-Lead-Interview-100-Questions.md)
- Per-topic split: [../topics/README.md](../topics/README.md)
- Rapid-fire definitions: [../rapid-fire/AWS-NodeJS-Rapid-Fire-101-150.md](../rapid-fire/AWS-NodeJS-Rapid-Fire-101-150.md)
- Runnable code examples: [../code-examples/README.md](../code-examples/README.md)
- One-page cheat sheet: [../cheatsheet/CHEATSHEET.md](../cheatsheet/CHEATSHEET.md)

> **How to use in an interview:** Lead with the decision driver (traffic shape, consistency, latency SLO, cost, ops appetite), then name the service and its trade-offs. Service facts/limits change over time — always confirm current quotas in the AWS docs for production decisions.
