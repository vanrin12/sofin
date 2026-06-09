# Sofin — Microservices Architecture Overview

**Stack:** NestJS (TypeScript) · Self-built JWT auth · REST (sync) + Message Broker (async)

> **Implementation status (scaffold).** The repo implements this design as a
> NestJS monorepo (`apps/*` + `libs/common`) with **Postgres per service (Prisma)**
> and **RabbitMQ** (topic exchange), wired via `infra/docker-compose.yml`. With
> `RABBITMQ_URL` unset, services fall back to an in-process EventBus for
> single-process dev. Remaining gaps: Auth serves its public key at
> **`/auth/public-key.pem`** rather than a rotating JWKS, and Redis/tracing are
> not yet wired. Everything else below is implemented as described.

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
| **Auth / SSO** | users, roles, sessions, refresh_tokens | Login, JWT issue/refresh/revoke, RBAC, public key (`/auth/public-key.pem`), user identity |
| **LMS** | courses, lessons, enrollments, progress | Course catalog, enrollment, lesson progress, quizzes |
| **CRM** | contacts, leads, deals, activities | Contact mgmt, sales pipeline, activity timeline |
| **Notification** | notifications, templates | Email/SMS/push delivery driven by events |

## 4. Technology choices

| Concern | Choice | In scaffold |
|---|---|---|
| Runtime / framework | Node.js 20+ · NestJS 10 (TypeScript) | ✅ implemented |
| Auth | `@nestjs/jwt` (RS256), `bcryptjs`, refresh-token rotation | ✅ implemented |
| RBAC | Nest guards + `@Permissions()`/`@CurrentUser()` decorators | ✅ implemented |
| Validation | `class-validator` DTOs + global `ValidationPipe` | ✅ implemented |
| DB | PostgreSQL per service (ORM: Prisma) | ✅ implemented |
| Broker | RabbitMQ topic exchange (`amqplib`) | ✅ implemented (in-proc fallback) |
| Cache | Redis (rate-limit counters, token revocation list, hot reads) | ⏳ planned |
| Logging | Nest `Logger` (structured) + correlation ID | ✅ Nest Logger |
| Tracing | OpenTelemetry | ⏳ planned |
| Containerization | Docker per app, `docker-compose` for local | ✅ compose + Dockerfile |
| Orchestration | Kubernetes / ECS in prod | ⏳ planned |
| Repo layout | NestJS monorepo (`apps/*` + `libs/common`) | ✅ implemented |

See: `02-api-contracts.md`, `03-data-models.md`, `04-auth-flow.md`, `05-events.md`, `06-cross-cutting.md`, `07-repo-and-deploy.md`, `08-authorization-rbac.md`.
