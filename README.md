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
├── apps/*/project.json # per-app Nx targets (build/serve/lint) + tags
├── nx.json             # Nx task cache + named inputs
└── tsconfig.base.json  # @app/common path mapping
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
pnpm install
cp .env.example .env
pnpm infra:up       # Postgres (:5544) + RabbitMQ (:5672, UI :15672) via docker
pnpm db:migrate     # apply migrations to each service database
pnpm build          # prisma generate + nx run-many -t build (all apps, cached)
pnpm dev            # nx run-many -t serve (auth, gateway, lms, crm, notification, watch)
```

Nx (integrated monorepo): build/serve/lint one app with `nx build crm` ·
`nx serve auth-sso` · `nx lint lms`; rebuild only what changed with
`nx affected -t build`; view the project graph with `nx graph`.

Persistence is **Postgres per service (Prisma)**; events flow over **RabbitMQ**.
Run the whole stack in containers instead with `pnpm stack:up` (builds images
and runs `prisma migrate deploy` on boot). With `RABBITMQ_URL` unset the services
fall back to an in-process EventBus (single-process dev without the broker).

Schema changes use versioned migrations: edit a service's
`prisma/schema.prisma`, then `pnpm db:migrate:auth` (or `:lms`/`:crm`/`:notif`)
to create + apply a new migration. `pnpm db:migrate` applies pending
migrations (CI/boot).

> Hot reload watches each app's own sources, **not** the shared `libs/common` it
> depends on — after editing shared code, restart `pnpm dev` to pick it up.

## API docs (Swagger)

With the stack running (`pnpm dev`), each service serves its own Swagger UI at
`/docs` (OpenAPI JSON at `/docs-json`) on its own port:

| Service | Swagger UI |
|---|---|
| auth-sso | <http://localhost:4001/docs> |
| lms | <http://localhost:4002/docs> |
| crm | <http://localhost:4003/docs> |
| notification | <http://localhost:4004/docs> |

The docs page itself is public; protected **endpoints** return `401` until you
authorize. There are two auth paths — pick the one matching the URL you call:

- **A service's own Swagger (`:4001`–`:4004`) calls that service directly**,
  bypassing the gateway. Click **Authorize** and set the identity headers the
  gateway would otherwise inject — leave `bearer` empty:
  - `x-user-id` — any user id, e.g. `11111111-1111-1111-1111-111111111111`
  - `x-user-roles` — a role, e.g. `admin`
- **Through the gateway (`:8080`)** requests are JWT-verified, so authorize with a
  **Bearer** token from `/auth/login`; any client-sent `x-user-*` headers are
  stripped and ignored.

Then **Try it out → Execute**: you'll get `200`/`201`, or `403` if the role lacks
the required permission. Roles map to permissions in
[`libs/common/src/permissions.ts`](libs/common/src/permissions.ts): `admin`
(everything), `instructor`, `learner` (alias `user`), `sales`, `manager`.

Disable docs with `SWAGGER_ENABLED=false` (set in production); change the route
with `SWAGGER_PATH`.

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
