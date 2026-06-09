# Cross-Cutting Concerns

## Security
- **TLS everywhere**, terminated at the Gateway (and ideally mTLS internally).
- Services are **not publicly routable** — only the Gateway is exposed.
- Gateway **strips client-supplied `x-user-*` headers** before injecting its own,
  so identity can't be spoofed from outside.
- Secrets via **Vault / AWS Secrets Manager**, injected as env vars. Never committed.
- Private signing key lives **only** in the Auth service.
- Input validation via **`class-validator` DTOs + a global `ValidationPipe`**
  (`whitelist: true`) at every service boundary.
- Rate limiting at the Gateway (`express-rate-limit`); stricter on `/auth/login` in prod.
- `helmet` for security headers; strict CORS allowlist.

## Observability
| Pillar | Tool | Notes |
|---|---|---|
| Logging | Nest `Logger` (→ `pino`/Loki/ELK in prod) | structured; one line per request |
| Correlation | `x-request-id` | generated at the Gateway, propagated downstream and onto event envelopes (`correlationId`) |
| Tracing | OpenTelemetry → Jaeger/Tempo | trace spans across services + broker |
| Metrics | Prometheus | RED metrics (Rate, Errors, Duration) per service |
| Dashboards/alerts | Grafana | latency, error rate, queue depth, DLQ size |

Every response is wrapped by a global `TransformInterceptor` into
`{ data, meta:{ requestId } }`, and every error by a global `HttpExceptionFilter`
into `{ error:{ code, message } }` (both in `libs/common`). `@Raw()` opts a
handler out of the envelope (e.g. the public-key endpoint).

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
