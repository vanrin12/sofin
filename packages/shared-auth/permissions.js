'use strict';

// role -> permissions table. In production each service seeds/syncs this from
// Auth via `role.updated` events (see docs/05-events.md). Kept here so every
// service shares one definition during the scaffold phase.
const ROLE_PERMS = {
  admin: ['*:*'],
  instructor: ['course:create', 'course:update', 'lesson:*', 'enrollment:read'],
  sales: ['contact:*', 'deal:*', 'activity:*'],
  manager: ['*:read', 'deal:update', 'report:read'],
  learner: ['course:read', 'enrollment:create', 'progress:update', 'notification:read'],
};

// alias: "user" is treated the same as "learner"
ROLE_PERMS.user = ROLE_PERMS.learner;

function permissionsFor(roles = []) {
  const set = new Set();
  for (const role of roles) for (const p of ROLE_PERMS[role] || []) set.add(p);
  return set;
}

// does the permission set satisfy `needed` (a "resource:action" string)?
function can(perms, needed) {
  const [resource, action] = needed.split(':');
  return (
    perms.has('*:*') ||
    perms.has(`${resource}:*`) ||
    perms.has(`*:${action}`) ||
    perms.has(needed)
  );
}

module.exports = { ROLE_PERMS, permissionsFor, can };
