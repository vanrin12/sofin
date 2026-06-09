# Sofin

Microservices platform on **NestJS** (TypeScript). Self-built JWT auth (RS256),
multi-role RBAC via guards/decorators, REST + message-broker design.

See [`docs/`](./docs/README.md) for the full system design.

## Layout (NestJS monorepo)

```
sofin/
├── apps/
│   ├── gateway/        # single public entry; verifies JWT, proxies to services
│   ├── auth-sso/       # login/register/refresh, RS256 JWT, roles
│   ├── lms/            # courses/enrollments (RBAC-protected)
│   ├── crm/            # contacts/deals (RBAC-protected, event consumers)
│   └── notification/   # event-driven notifications
├── libs/common/        # shared: guards, decorators, EventBus, filters, bootstrap
├── infra/              # docker-compose (Postgres + RabbitMQ), Dockerfile
├── apps/*/prisma/      # one Prisma schema per service (DB-per-service)
├── nest-cli.json       # monorepo projects
└── tsconfig.json       # @app/common path mapping
```

## RBAC primitives (`@app/common`)

| Primitive | Purpose |
|---|---|
| `IdentityGuard` | reads gateway-injected `x-user-id`/`x-user-roles` → `req.user` |
| `PermissionsGuard` | enforces `@Permissions(...)` metadata; deny-by-default |
| `@Permissions('course:create')` | declares a route's required permission |
| `@CurrentUser()` | injects the authenticated user into a handler |
| `@Public()` | opts a route out of identity (e.g. `/health`) |

Both guards are wired globally per app via `APP_GUARD` (identity → permissions).

## Quickstart

```bash
npm install
cp .env.example .env
npm run infra:up       # Postgres (:5544) + RabbitMQ (:5672, UI :15672) via docker
npm run db:push        # create tables in each service database
npm run build          # prisma generate + compile all apps + lib
npm run dev            # start auth, gateway, lms, crm, notification (watch mode)
```

Persistence is **Postgres per service (Prisma)**; events flow over **RabbitMQ**.
Run the whole stack in containers instead with `npm run stack:up` (builds images
and runs `prisma db push` on boot). With `RABBITMQ_URL` unset the services fall
back to an in-process EventBus (single-process dev without the broker).

## Try it

```bash
# register (gets `learner` by default)
curl -sX POST localhost:8080/auth/register -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"secret123","name":"Ann"}'

# login → accessToken
TOKEN=$(curl -sX POST localhost:8080/auth/login -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"secret123"}' | jq -r .data.accessToken)

# protected call through the gateway
curl -s localhost:8080/lms/courses -H "authorization: Bearer $TOKEN" | jq

# learner creating a course → 403 (needs course:create)
curl -si -X POST localhost:8080/lms/courses -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"title":"x"}' | head -1

# pre-seeded admin: admin@sofin.dev / admin1234
```
