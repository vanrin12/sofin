# Sofin — System Design

Microservices platform on **Express + Node.js**.
Self-built JWT auth · REST (sync) + RabbitMQ (async) · database-per-service.

## Documents
1. [Architecture Overview](./01-architecture-overview.md) — context diagram, principles, service map, tech stack
2. [API Contracts](./02-api-contracts.md) — gateway routing, per-service endpoints, response envelope
3. [Data Models](./03-data-models.md) — per-service schemas, cross-service data handling
4. [Auth & SSO Flow](./04-auth-flow.md) — JWT strategy, login/refresh/logout sequences, RBAC, SSO
5. [Async Events](./05-events.md) — RabbitMQ topology, event catalogue, reliability (outbox, idempotency)
6. [Cross-Cutting Concerns](./06-cross-cutting.md) — security, observability, resilience, config
7. [Repo & Deployment](./07-repo-and-deploy.md) — monorepo layout, local dev, K8s deployment, build order
8. [Authorization — Multi-Role RBAC](./08-authorization-rbac.md) — roles→permissions model, gateway vs service checks, ownership, role management

## TL;DR
- **Gateway** is the only public entry; it verifies JWTs locally (RS256 public key) and routes to services.
- **Auth/SSO** owns identity, issues short-lived access + rotating refresh tokens.
- **LMS** and **CRM** are independent services, each with its own Postgres DB.
- Services talk **REST** when an answer is needed now, **events** for decoupled side-effects.
- Everything is stateless, containerized, and independently deployable.
