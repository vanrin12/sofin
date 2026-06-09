# Sofin — Microservices Architecture Overview

**Stack:** Express + Node.js · Self-built JWT auth · REST (sync) + Message Broker (async)

## 1. System context

```
                          ┌─────────────┐
                          │   Clients   │   Web SPA · Mobile · 3rd-party API consumers
                          └──────┬──────┘
                                 │ HTTPS / JSON
                       ┌─────────▼──────────┐
                       │    API Gateway     │   single entry point
                       │  • TLS termination │
                       │  • JWT verify      │
                       │  • routing         │
                       │  • rate limit/CORS │
                       └────┬───────┬───────┘
        ┌──────────┬────────┼───────┼────────┬───────────┐
        │          │        │       │        │           │
   ┌────▼────┐ ┌───▼───┐ ┌──▼───┐ ┌─▼────┐ ┌─▼────────┐
   │ Auth /  │ │  LMS  │ │ CRM  │ │ Notif│ │  (future │
   │  SSO    │ │ svc   │ │ svc  │ │ svc  │ │   svcs)  │
   └────┬────┘ └───┬───┘ └──┬───┘ └─┬────┘ └─┬────────┘
        │          │        │       │        │
   ┌────▼────┐ ┌───▼───┐ ┌──▼───┐ ┌─▼────┐
   │ AuthDB  │ │ LMSDB │ │ CRMDB│ │NotifDB│   database-per-service
   └─────────┘ └───────┘ └──────┘ └──────┘

   ═══════════════ Message Broker (RabbitMQ) ═══════════════
            async domain events between services
```

## 2. Design principles

| Principle | Decision |
|---|---|
| **Database per service** | No service reads another's DB. Data shared via API or events. |
| **Stateless services** | No in-memory session; all state in DB/cache. Horizontally scalable. |
| **Single entry point** | Clients only talk to the Gateway. Services are network-internal. |
| **Local JWT verification** | Gateway + services verify tokens with Auth's public key (RS256). No per-request call to Auth. |
| **Sync = REST, Async = events** | REST for request/response; broker events for decoupled side-effects. |
| **Smart endpoints, dumb pipes** | Business logic in services; broker just transports messages. |

## 3. Services at a glance

| Service | Owns | Key responsibilities |
|---|---|---|
| **API Gateway** | — | Routing, JWT validation, rate limiting, CORS, request logging/correlation ID |
| **Auth / SSO** | users, roles, sessions, refresh_tokens | Login, JWT issue/refresh/revoke, RBAC, JWKS public key, user identity |
| **LMS** | courses, lessons, enrollments, progress | Course catalog, enrollment, lesson progress, quizzes |
| **CRM** | contacts, leads, deals, activities | Contact mgmt, sales pipeline, activity timeline |
| **Notification** | notifications, templates | Email/SMS/push delivery driven by events |

## 4. Technology choices

| Concern | Choice |
|---|---|
| Runtime / framework | Node.js 20+ · Express 4 |
| Auth | `jsonwebtoken` (RS256), `bcrypt`, refresh-token rotation |
| DB | PostgreSQL per service (ORM: Prisma) |
| Cache | Redis (rate-limit counters, token revocation list, hot reads) |
| Broker | RabbitMQ (`amqplib`) |
| Validation | `zod` at every boundary |
| Logging | `pino` structured JSON + correlation ID |
| Tracing | OpenTelemetry |
| Containerization | Docker per service, `docker-compose` for local |
| Orchestration | Kubernetes / ECS in prod |
| Repo layout | pnpm workspaces monorepo |

See: `02-api-contracts.md`, `03-data-models.md`, `04-auth-flow.md`, `05-events.md`, `06-cross-cutting.md`, `07-repo-and-deploy.md`.
