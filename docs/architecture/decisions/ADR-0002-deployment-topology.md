# ADR-0002: Deployment Topology

## Status
Accepted

## Context
The ReplayLab platform comprises two distinct workloads:
1. An interactive web UI with static assets, server components, and client-side visualization (`apps/web`).
2. An API and Replay Engine (`apps/api`) that executes outbound HTTP requests with socket-level control, timeouts, stream buffering, and potential long-running test suites.

Serverless hosting (such as Next.js API routes on Vercel) imposes strict execution timeouts (10-15s max on free/standard plans), limited raw socket configuration, lack of persistent TCP connection pools, and unpredictable outbound egress IPs.

## Decision
We decouple the deployment topology:
- **`apps/web`** will be deployed to **Vercel** as a Next.js application, taking full advantage of edge CDN routing, preview deployments, and optimal React rendering.
- **`apps/api`** will be deployed to a **persistent Node.js container environment** (e.g., Render, Railway, Fly.io, or AWS ECS/Fargate). This provides persistent HTTP agents, socket pool reuse, background task processing, and stable egress network configurations for SSRF egress filtering.

## Consequences
- **Positive**: Dedicated egress control and custom network socket wrappers for the Replay Engine; independent scaling of UI vs replay workloads; avoidance of serverless execution limits.
- **Negative**: Requires separate deployment pipelines, CORS configuration between `apps/web` and `apps/api`, and distinct environment variable management.
