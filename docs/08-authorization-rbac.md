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
   │  Service: fine-grained authz        │  does this user have `course:create`?
   │  requirePermission('course:create') │  + ownership / resource-level checks
   └────────────────────────────────────┘
```

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

## 5. Service-side enforcement (illustrative middleware)

```js
// packages/shared-auth/permissions.js
// role → permissions table, seeded per service (synced from Auth via `role.updated` events)
const ROLE_PERMS = {
  admin:      ['*:*'],
  instructor: ['course:create','course:update','lesson:*','enrollment:read'],
  learner:    ['course:read','enrollment:create','progress:update','notification:read'],
  sales:      ['contact:*','deal:*','activity:*'],
};

function permissionsFor(roles) {
  return new Set(roles.flatMap(r => ROLE_PERMS[r] ?? []));
}

function can(perms, needed) {
  const [res, act] = needed.split(':');
  return perms.has('*:*') || perms.has(`${res}:*`) || perms.has(needed);
}

// express middleware
function requirePermission(needed) {
  return (req, res, next) => {
    const roles = (req.headers['x-user-roles'] || '').split(',').filter(Boolean);
    const perms = permissionsFor(roles);
    if (!can(perms, needed)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: `requires ${needed}` } });
    }
    next();
  };
}
```

Usage in a route:

```js
router.post('/courses',           requirePermission('course:create'), createCourse);
router.delete('/courses/:id',     requirePermission('course:delete'), deleteCourse);
router.get('/courses',            requirePermission('course:read'),   listCourses);
```

## 6. Resource-level / ownership checks (beyond roles)

Role/permission says *"instructors can update courses"*. It does **not** say
*"this instructor can update **this** course"*. That ownership check is
business logic inside the service, after the permission gate:

```js
async function updateCourse(req, res) {
  const course = await repo.findById(req.params.id);
  const isOwner = course.instructor_id === req.headers['x-user-id'];
  const isAdmin = req.headers['x-user-roles'].includes('admin');
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'not your course' } });
  }
  // ...proceed
}
```

Pattern: **permission gate (can this *kind* of user do it?) → ownership/scope
check (can *this* user do it to *this* resource?)**.

## 7. Managing roles (Auth service)

| Endpoint | Permission | Action |
|---|---|---|
| `POST /auth/users/:id/roles` | `role:assign` | assign a role to a user |
| `DELETE /auth/users/:id/roles/:role` | `role:assign` | remove a role |
| `GET /auth/roles` | `user:manage` | list roles + permissions |

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
```

## 9. Decision: why permissions, not just roles

Checking `if (role === 'admin')` scattered across services becomes unmaintainable
the moment requirements grow ("managers can also delete deals"). Centralizing on
`resource:action` permissions means:
- adding a capability to a role = one table edit, no code change;
- a route's requirement is self-documenting (`requirePermission('deal:delete')`);
- multi-role users "just work" via permission union.
