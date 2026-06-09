# Auth & SSO Flow (self-built JWT)

## Token strategy

| Token | Lifetime | Algorithm | Storage |
|---|---|---|---|
| **Access token (JWT)** | 15 min | RS256 (private key in Auth) | client memory |
| **Refresh token** | 7–30 days | opaque random, hashed in DB | client httpOnly cookie / secure store |

- **RS256 asymmetric:** Auth signs with the **private key**; Gateway and all
  services verify with the **public key** fetched from the JWKS endpoint.
  → No service needs the private key, no per-request call to Auth.
- Access token claims: `{ sub, email, roles[], iat, exp, iss }`.

## Login sequence

```
Client            Gateway            Auth svc            AuthDB
  │  POST /auth/login  │                  │                 │
  │───────────────────►│  forward         │                 │
  │                    │─────────────────►│  find user      │
  │                    │                  │────────────────►│
  │                    │                  │  verify bcrypt  │
  │                    │                  │  sign access JWT│
  │                    │                  │  store refresh  │
  │                    │                  │────────────────►│
  │   {access,refresh} │◄─────────────────│                 │
  │◄───────────────────│                  │                 │
```

## Authenticated request (no call to Auth)

```
Client            Gateway                     LMS svc
  │ GET /lms/courses                            │
  │ Bearer <access>  │                          │
  │─────────────────►│ verify JWT sig (pub key) │
  │                  │ check exp                │
  │                  │ inject x-user-id/roles   │
  │                  │─────────────────────────►│ check role guard
  │                  │                          │ run query
  │      data        │◄─────────────────────────│
  │◄─────────────────│                          │
```

## Refresh & rotation

1. Client sends expired-access + `refreshToken` to `POST /auth/refresh`.
2. Auth looks up the **hashed** refresh token; rejects if revoked/expired.
3. On success: issue new access + **new refresh** (rotation), mark old revoked.
4. Detecting reuse of a revoked refresh token ⇒ revoke the whole family
   (token theft response).

## Logout / revocation

- `POST /auth/logout` → mark refresh token revoked.
- Access tokens are short-lived, so no blacklist needed normally. For instant
  kill, keep a **Redis revocation list** of `jti` checked by the Gateway.

## RBAC

- Roles in the JWT (`roles[]`). Services enforce with a `requireRole()`
  middleware reading `x-user-roles`. Fine-grained permissions can map roles →
  permission sets inside each service.

## SSO across multiple frontends

Since auth is self-built, "SSO" = a shared Auth service + shared refresh
cookie on a parent domain (`.sofin.example`). All apps redirect unauthenticated
users to a central login page; one login → access to every app. If you later
need standards-based SSO for 3rd parties, this service can be upgraded to
OIDC without changing consumers (they already use bearer tokens).
