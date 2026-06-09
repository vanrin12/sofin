# Cross-Cutting Concerns

## Security
- **TLS everywhere**, terminated at the Gateway (and ideally mTLS internally).
- Services are **not publicly routable** — only the Gateway is exposed.
- Secrets via **Vault / AWS Secrets Manager**, injected as env vars. Never committed.
- Private signing key lives **only** in the Auth service.
- Input validation with `zod` at every service boundary.
- Rate limiting at the Gateway (per-IP and per-user); stricter on `/auth/login`.
- `helmet` for security headers; strict CORS allowlist.

## Observability
| Pillar | Tool | Notes |
|---|---|---|
| Logging | `pino` → Loki/ELK | structured JSON, one line per request |
| Correlation | `x-request-id` | generated at Gateway, propagated to events & downstream calls |
| Tracing | OpenTelemetry → Jaeger/Tempo | trace spans across services + broker |
| Metrics | Prometheus | RED metrics (Rate, Errors, Duration) per service |
| Dashboards/alerts | Grafana | latency, error rate, queue depth, DLQ size |

## Resilience
- **Health endpoints** per service: `/health` (liveness), `/ready` (readiness — checks DB/broker).
- **Timeouts + retries** on inter-service REST calls (with jittered backoff).
- **Circuit breaker** (e.g. `opossum`) around remote calls to fail fast.
- **Graceful shutdown**: stop accepting traffic, drain in-flight requests, close broker channels.
- **Idempotent** event consumers; **outbox** for reliable publish (see 05-events.md).

## Configuration
- 12-factor: all config from env vars.
- Per-service `.env` for local; ConfigMaps/Secrets in K8s.
- Schema-validate env at boot (fail fast on missing config).

## API versioning & contracts
- Version via path prefix at the Gateway (`/v1/lms/...`) when breaking changes land.
- Each service ships an **OpenAPI 3** spec; events documented in `05-events.md`.

## Data & consistency
- Eventual consistency for cross-service denormalized data.
- Migrations per service (Prisma Migrate), run in CI/CD before deploy.
- Backups per database; PITR for production.
