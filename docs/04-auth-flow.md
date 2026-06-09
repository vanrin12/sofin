# Auth & SSO Flow (self-built JWT)

## Token strategy

| Token | Lifetime | Algorithm | Storage |
|---|---|---|---|
| **Access token (JWT)** | 15 min | RS256 (private key in Auth) | client memory |
| **Refresh token** | 7–30 days | opaque random, hashed in DB | client httpOnly cookie / secure store |

- **RS256 asymmetric:** Auth signs with the **private key**; the Gateway verifies
  with the **public key** it fetches at boot from `GET /auth/public-key.pem`
  (upgrade to a rotating JWKS in production). → No service needs the private key,
  and there is no per-request call to Auth.
- Access token claims: `{ sub, email, roles[], iat, exp, iss }`.

> **Scaffold note.** The Gateway is the component that verifies tokens and injects
> `x-user-id`/`x-user-roles`; downstream services trust those headers (they sit on
> a private network) rather than re-verifying the JWT. Users/refresh tokens live in
> an in-memory store; the RSA keypair is generated at boot (persist/rotate it via
> JWKS in production).

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

- Roles travel in the JWT (`roles[]`). Services enforce with Nest guards reading
  `x-user-roles` (`IdentityGuard`) and `@Permissions()` metadata
  (`PermissionsGuard`), mapping roles → permission sets locally. Full model in
  `08-authorization-rbac.md`.

## SSO across multiple frontends

Since auth is self-built, "SSO" = a shared Auth service + shared refresh
cookie on a parent domain (`.sofin.example`). All apps redirect unauthenticated
users to a central login page; one login → access to every app. If you later
need standards-based SSO for 3rd parties, this service can be upgraded to
OIDC without changing consumers (they already use bearer tokens).
