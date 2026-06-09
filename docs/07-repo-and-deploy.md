# Repository Layout & Deployment

## Monorepo (pnpm workspaces)

```
sofin/
├── docs/                      # this design
├── services/
│   ├── gateway/               # Express API gateway
│   ├── auth-sso/              # JWT auth, RBAC, JWKS
│   ├── lms/                   # courses, enrollments
│   ├── crm/                   # contacts, deals
│   └── notification/          # event-driven delivery
├── packages/                  # shared internal libraries
│   ├── shared-auth/           # JWT verify + requireRole() middleware
│   ├── shared-events/         # broker client, event envelope, schemas
│   ├── shared-logger/         # pino + correlation id
│   └── shared-config/         # env schema validation
├── infra/
│   ├── docker-compose.yml     # local: all services + Postgres x N + RabbitMQ + Redis
│   └── k8s/                   # prod manifests / Helm charts
├── pnpm-workspace.yaml
└── package.json
```

Each service folder (consistent internal structure):

```
services/<name>/
├── src/
│   ├── routes/         # express routers
│   ├── controllers/    # HTTP ↔ service layer
│   ├── services/       # business logic
│   ├── repositories/   # DB access (Prisma)
│   ├── events/         # publishers + consumers
│   ├── middleware/     # auth guard, validation, error handler
│   └── app.js
├── prisma/schema.prisma
├── Dockerfile
└── package.json
```

## Local development

`docker-compose up` brings up: Gateway, all services, one Postgres per service
(or schemas), RabbitMQ (with management UI), Redis. Hot-reload via `tsx`/`nodemon`.

## Deployment (production)

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

- **Containerize** each service; push to registry.
- **Kubernetes** (or ECS): one Deployment + Service per microservice, HPA on CPU/RPS.
- **Service discovery** via K8s DNS (`auth-sso.svc.cluster.local`).
- **CI/CD**: lint → test → build image → migrate → deploy (per service, independently).
- **Managed Postgres** per service; **clustered RabbitMQ**; **Redis** for cache/rate-limit.

## Build order recommendation
1. `shared-*` packages + Gateway skeleton
2. Auth/SSO (everything depends on it)
3. One business service end-to-end (LMS) incl. an event producer
4. Notification (first consumer) to prove the async path
5. CRM, then remaining modules
