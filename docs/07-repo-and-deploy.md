# Repository Layout & Deployment

## NestJS monorepo

A single NestJS monorepo (`nest-cli.json` projects) — apps build/deploy
independently, shared code lives in one library.

```
sofin/
├── docs/                        # this design
├── apps/
│   ├── gateway/                 # single public entry; JWT verify + proxy
│   ├── auth-sso/                # JWT auth, RBAC, roles, public key
│   ├── lms/                     # courses, enrollments
│   ├── crm/                     # contacts, deals (+ event consumers)
│   └── notification/            # event-driven delivery
├── libs/
│   └── common/                  # shared library (@app/common)
│       └── src/
│           ├── common.module.ts        # @Global module: EventBus + guards
│           ├── bootstrap.ts            # shared service bootstrap
│           ├── event-bus.ts            # publish/subscribe (RabbitMQ-ready)
│           ├── permissions.ts          # role→permission table + can()
│           ├── guards/                 # IdentityGuard, PermissionsGuard
│           ├── decorators/             # @Permissions, @CurrentUser, @Public, @Raw
│           ├── interceptors/           # TransformInterceptor ({ data, meta })
│           └── filters/                # HttpExceptionFilter ({ error })
├── nest-cli.json                # monorepo project map
├── tsconfig.json                # @app/common path mapping, rootDir
└── package.json                 # one dependency set for all apps
```

Each app has the same Nest shape:

```
apps/<name>/
├── src/
│   ├── main.ts                  # bootstrapService(AppModule, PORT, name)
│   ├── app.module.ts            # imports CommonModule + feature modules;
│   │                            #   wires APP_GUARD: IdentityGuard → PermissionsGuard
│   ├── health.controller.ts     # @Public() /health
│   └── <feature>/               # module + controller + service + dto.ts
└── tsconfig.app.json
```

`apps/gateway` is the exception: it has no controllers besides `/health` — its
auth + proxy logic is Express middleware applied in `main.ts` (proxying happens
before Nest's router).

## Local development

```bash
npm install
cp .env.example .env
npm run infra:up     # Postgres (:5544) + RabbitMQ (:5672, UI :15672) via docker
npm run db:migrate   # apply migrations to each service database
npm run build        # prisma generate + nest build for each app + the lib
npm run dev          # nest start --watch for all five (concurrently)
```

Persistence is **Postgres per service** (Prisma); events flow over **RabbitMQ**
(`infra/docker-compose.yml`). A default admin (`admin@sofin.dev` / `admin1234`)
is seeded so role-gated endpoints are reachable. With `RABBITMQ_URL` unset, the
services fall back to an in-process EventBus for broker-less single-process dev.

Run the whole stack (services + infra) in containers with
`npm run stack:up` (`docker compose --profile apps up --build`); each service
runs `prisma migrate deploy` on boot.

**Migrations.** Versioned per service under `apps/<name>/prisma/migrations/`
(committed). Create + apply a new one during development with
`npm run db:migrate:<svc>` (`prisma migrate dev`); apply pending migrations in
CI/boot with `npm run db:migrate` (`prisma migrate deploy`).

## Production build & run

```bash
npm run build                                  # → dist/apps/<name>/src/main.js
node dist/apps/auth-sso/src/main.js            # run a single service
```

```
            Internet
               │
        ┌──────▼──────┐
        │ Load Balancer / Ingress │  (TLS)
        └──────┬──────┘
        ┌──────▼──────┐
        │   Gateway   │  (N replicas)
        └──────┬──────┘
   ┌───────────┼───────────┐
 Auth(N)     LMS(N)      CRM(N)   ...   ← K8s Deployments, HPA autoscaling
   │            │           │
 Postgres    Postgres    Postgres       ← managed DB (RDS/Cloud SQL)
        RabbitMQ (clustered) · Redis
```

- **Containerize** each app (`nest build <app>` → slim Node image); push to a registry.
- **Kubernetes** (or ECS): one Deployment + Service per app, HPA on CPU/RPS.
- **Service discovery** via K8s DNS (`auth-sso.svc.cluster.local`).
- **CI/CD**: lint → test → `nest build` → migrate → deploy (per app, independently).
- **Managed Postgres** per service; **clustered RabbitMQ**; **Redis** for cache/rate-limit.

## From scaffold → production (remaining hardening)
Persistence (Prisma/Postgres), versioned **migrations** (`prisma migrate`), the
broker (RabbitMQ), `docker-compose`, and a per-app `Dockerfile` are **done**.
What's left to be production-grade:
1. **Broker reliability** — add the **outbox** pattern (publish in the same tx as
   the write) and per-consumer **dead-letter queues** with retry/backoff
   (`05-events.md`). The persistent/ack/nack plumbing is already in place.
2. **Keys** — persist/rotate the Auth RSA keypair and expose a real **JWKS**
   instead of `/auth/public-key.pem`.
3. **Infra** — split into separate managed Postgres instances per service, a
   clustered RabbitMQ, add **Redis** (rate-limit/token revocation), and
   `infra/k8s/` manifests.

## Build order recommendation
1. `libs/common` + Gateway skeleton
2. Auth/SSO (everything depends on it)
3. One business service end-to-end (LMS) incl. an event producer
4. Notification (first consumer) to prove the async path
5. CRM, then remaining modules
