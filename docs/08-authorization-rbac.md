# Authorization — Multi-Role RBAC

Authentication answers *"who are you?"* (handled in `04-auth-flow.md`).
**Authorization** answers *"what are you allowed to do?"* — this doc.

## 1. Model: Roles → Permissions → Resources

A user has **many roles**. Each role grants a set of **permissions**.
A permission is a `resource:action` pair. Services check **permissions**,
not roles directly — so you can add/rename roles without touching code.

```
 User ──(many-to-many)──► Role ──(many-to-many)──► Permission
  e.g. dong  ──►  admin            ──►  course:create, course:delete, user:manage
                  instructor       ──►  course:create, course:update
                  learner          ──►  course:read, enrollment:create
```

A user with multiple roles gets the **union** of all their permissions.

## 2. Role catalogue (starter set)

| Role | Intended for | Sample permissions |
|---|---|---|
| `admin` | Platform operators | `*:*` (all) |
| `instructor` | Course authors (LMS) | `course:create`, `course:update`, `lesson:*`, `enrollment:read` |
| `sales` | CRM users | `contact:*`, `deal:*`, `activity:*` |
| `manager` | Team leads | `*:read`, `deal:update`, `report:read` |
| `learner` / `user` | End users | `course:read`, `enrollment:create`, `progress:update`, `notification:read` |

Roles are **global** here, but the model extends to scoped roles
(e.g. "instructor *of course X*") — see §6.

## 3. Permission catalogue (per service)

| Service | Permissions (`resource:action`) |
|---|---|
| Auth | `user:read`, `user:manage`, `role:assign` |
| LMS | `course:read/create/update/delete`, `lesson:*`, `enrollment:read/create` |
| CRM | `contact:read/create/update/delete`, `deal:*`, `activity:read/create` |
| Notification | `notification:read`, `notification:send` |

Convention: `*` = wildcard. `course:*` ⇒ all course actions. `*:*` ⇒ superadmin.

## 4. Where each check happens

```
        Auth issues JWT with roles[]  ──►  claims: { sub, roles:["instructor","learner"] }
                     │
   ┌─────────────────▼──────────────────┐
   │  Gateway: coarse-grained gate       │  is the token valid? optional role pre-filter
   │  (verify sig + exp, inject headers) │  e.g. block /admin/* unless roles has "admin"
   └─────────────────┬──────────────────┘
                     │  x-user-id, x-user-roles
   ┌─────────────────▼──────────────────┐
   │  Service: fine-grained authz        │  IdentityGuard → req.user
   │  @Permissions('course:create')      │  PermissionsGuard + ownership checks
   └────────────────────────────────────┘
```

In NestJS this is two global guards per app (wired via `APP_GUARD`, in order):
`IdentityGuard` populates `req.user` from the gateway's headers, then
`PermissionsGuard` enforces the `@Permissions(...)` metadata on the handler.

- **Gateway** does cheap, broad gating only (token valid; optionally block whole
  prefixes by role). It should **not** hold the full permission matrix.
- **Services** own the authoritative check because they know their resources.

### What's in the JWT
Keep the token small: put **roles** in the JWT, not the full permission list.
Each service maps roles → permissions from its own copy of the role→permission
table (seeded/synced from Auth). This keeps tokens compact and lets permission
definitions evolve without re-issuing tokens.

```json
// access token claims
{ "sub": "uuid", "email": "...", "roles": ["instructor","learner"], "iat":..., "exp":... }
```

## 5. Service-side enforcement (NestJS)

The role→permission table and matcher live in `libs/common/src/permissions.ts`
(each service seeds/syncs this from Auth via `role.updated` events):

```ts
export const ROLE_PERMS: Record<string, string[]> = {
  admin:      ['*:*'],
  instructor: ['course:create','course:update','lesson:*','enrollment:read'],
  learner:    ['course:read','enrollment:create','progress:update','notification:read'],
  sales:      ['contact:*','deal:*','activity:*'],
};
export function permissionsFor(roles: string[] = []) { /* union over ROLE_PERMS */ }
export function can(perms: Set<string>, needed: string) {
  const [res, act] = needed.split(':');
  return perms.has('*:*') || perms.has(`${res}:*`) || perms.has(`*:${act}`) || perms.has(needed);
}
```

`IdentityGuard` (global) reads the gateway headers and attaches `req.user`:

```ts
const roles = String(req.headers['x-user-roles'] || '').split(',').filter(Boolean);
req.user = { id: req.headers['x-user-id'], roles, permissions: permissionsFor(roles) };
```

`PermissionsGuard` (global) reads the `@Permissions()` metadata and enforces it
(deny-by-default; a route with no metadata is gated only by IdentityGuard):

```ts
const required = reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [handler, cls]);
if (required?.length) {
  const missing = required.find((p) => !can(req.user.permissions, p));
  if (missing) throw new ForbiddenException({ code: 'FORBIDDEN', message: `requires ${missing}` });
}
```

Usage on a controller — declarative, self-documenting:

```ts
@Permissions('course:read')   @Get('courses')               list() { … }
@Permissions('course:create') @Post('courses')              create(@CurrentUser() user) { … }
@Permissions('course:update') @Patch('courses/:id')         update(@Param('id') id, @CurrentUser() user) { … }
```

## 6. Resource-level / ownership checks (beyond roles)

Role/permission says *"instructors can update courses"*. It does **not** say
*"this instructor can update **this** course"*. That ownership check is
business logic inside the service, after the `@Permissions('course:update')` gate:

```ts
// CoursesService.update(id, dto, user) — runs after PermissionsGuard
const course = this.get(id);
const isOwner = course.instructorId === user.id;
const isAdmin = user.roles.includes('admin');
if (!isOwner && !isAdmin)
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'not your course' });
```

Pattern: **permission gate (can this *kind* of user do it?) → ownership/scope
check (can *this* user do it to *this* resource?)**.

## 7. Managing roles (Auth service)

| Endpoint | Permission | Action |
|---|---|---|
| `PUT /auth/users/:id/roles` | `role:assign` | set a user's roles (implemented) |
| `GET /auth/roles` | `user:manage` | list roles + permissions (planned) |

- Auth stores `users`, `roles`, `user_roles`, `role_permissions`.
- On any change, Auth emits `user.roles_changed` / `role.updated` so services
  refresh their cached role→permission tables (see `05-events.md`).
- **Role changes take effect on next token issuance.** Because access tokens are
  short-lived (15 min), a removed role naturally expires from active sessions.
  For instant revocation of elevated access, the Gateway can check a Redis
  `user:roles:<id>` entry (or force-logout via the token revocation list in `04`).

## 8. Defaults & safety rules
- **Deny by default.** No matching permission ⇒ 403. Never fall through to allow.
- New users get the `learner`/`user` role only.
- `admin` (`*:*`) is assignable only by an existing `admin` (`role:assign`).
- Log every authz failure with `x-request-id`, user id, and the needed permission.
- Validate role names against the catalogue on assignment (no free-text roles).

## 9. Decision: why permissions, not just roles

Checking `if (role === 'admin')` scattered across services becomes unmaintainable
the moment requirements grow ("managers can also delete deals"). Centralizing on
`resource:action` permissions means:
- adding a capability to a role = one table edit, no code change;
- a route's requirement is self-documenting (`@Permissions('deal:delete')`);
- multi-role users "just work" via permission union.
