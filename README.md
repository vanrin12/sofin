# Sofin

Microservices platform on **Express + Node.js**. Self-built JWT auth (RS256),
multi-role RBAC, REST + message-broker design.

See [`docs/`](./docs/README.md) for the full system design.

## Quickstart (no external services needed)

```bash
npm install
cp .env.example .env
npm run dev        # starts auth, gateway, lms, crm, notification
```

The scaffold runs out of the box with **in-memory stores** and an **in-process
event bus** so you can explore the flow immediately. Swap these for
Postgres/Prisma + RabbitMQ for production (see `docs/07-repo-and-deploy.md`).

## Try it

```bash
# 1. Register (gets the `learner` role by default)
curl -sX POST localhost:8080/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"secret123","name":"Ann"}'

# 2. Login → returns accessToken + refreshToken
TOKEN=$(curl -sX POST localhost:8080/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.com","password":"secret123"}' | jq -r .data.accessToken)

# 3. Call a protected service through the gateway
curl -s localhost:8080/lms/courses -H "authorization: Bearer $TOKEN" | jq

# 4. Creating a course needs `course:create` (instructor/admin) → 403 for a learner
curl -si -X POST localhost:8080/lms/courses -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"title":"x"}' | head -1

# A pre-seeded admin exists: admin@sofin.dev / admin1234
```

## Layout

| Path | What |
|---|---|
| `packages/shared-auth` | JWT verify + `requirePermission()` RBAC middleware |
| `packages/shared-logger` | structured logging + correlation id |
| `packages/shared-events` | event-bus client (in-proc now, RabbitMQ-ready) |
| `services/gateway` | single public entry; verifies JWT, routes to services |
| `services/auth-sso` | login/register/refresh, RS256 JWT, roles |
| `services/lms` | courses/enrollments (RBAC-protected) |
| `services/crm` | contacts/deals (RBAC-protected) |
| `services/notification` | event-driven notifications |
