# API Contracts

All client traffic goes through the Gateway at `https://api.sofin.example`.
The Gateway forwards the full path intact (e.g. `/lms/courses` → LMS). Every
authenticated request carries `Authorization: Bearer <access_jwt>`.

## Gateway routing table

| Public path | → Service | Auth required |
|---|---|---|
| `/auth/*` | Auth/SSO | No (login/refresh are public) |
| `/lms/*` | LMS | Yes |
| `/crm/*` | CRM | Yes |
| `/notifications/*` | Notification | Yes |

After verifying the JWT, the Gateway injects headers for downstream services:

```
x-user-id:    <uuid>
x-user-roles: admin,instructor
x-request-id: <correlation-uuid>
```

Downstream services trust these headers (services are not publicly reachable).

---

## Auth / SSO service

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/auth/register` | no | `{ email, password, name }` |
| POST | `/auth/login` | no | `{ email, password }` → `{ accessToken, refreshToken }` |
| POST | `/auth/refresh` | no | `{ refreshToken }` → new token pair (rotation) |
| POST | `/auth/logout` | yes | revokes refresh token |
| GET | `/auth/me` | yes | current user claims |
| PUT | `/auth/users/:id/roles` | yes (`role:assign`) | set a user's roles |
| GET | `/auth/public-key.pem` | no | RS256 public key for token verification (JWKS in prod) |
| GET | `/auth/users/:id` | yes (internal) | user lookup for other services |

## LMS service

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/lms/courses` | yes | list/filter catalog |
| POST | `/lms/courses` | instructor/admin | create course |
| GET | `/lms/courses/:id` | yes | course detail + lessons |
| POST | `/lms/courses/:id/enroll` | yes | enroll current user → emits `enrollment.created` |
| GET | `/lms/enrollments/me` | yes | my enrollments + progress |
| PATCH | `/lms/lessons/:id/progress` | yes | update lesson progress |

## CRM service

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/crm/contacts` | yes | list/search contacts |
| POST | `/crm/contacts` | sales/admin | create contact |
| GET | `/crm/contacts/:id` | yes | contact + activity timeline |
| POST | `/crm/deals` | sales/admin | create deal |
| PATCH | `/crm/deals/:id` | sales/admin | move pipeline stage → emits `deal.stage_changed` |
| GET | `/crm/contacts/:id/activities` | yes | activity log |

## Notification service

Primarily event-driven (no public write API). Read endpoints:

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/notifications/me` | yes | my in-app notifications |
| PATCH | `/notifications/:id/read` | yes | mark read |

## Standard response envelope

```json
// success
{ "data": { ... }, "meta": { "requestId": "..." } }
// error
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

Each service publishes an OpenAPI 3 spec at `/<service>/openapi.json`.
