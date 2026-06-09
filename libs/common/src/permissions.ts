// role -> permissions table. In production each service seeds/syncs this from
// Auth via `role.updated` events (see docs/05-events.md). Centralised here so
// every service shares one definition during the scaffold phase.
export const ROLE_PERMS: Record<string, string[]> = {
  admin: ['*:*'],
  instructor: ['course:create', 'course:update', 'lesson:*', 'enrollment:read'],
  sales: ['contact:*', 'deal:*', 'activity:*'],
  manager: ['*:read', 'deal:update', 'report:read'],
  learner: ['course:read', 'enrollment:create', 'progress:update', 'notification:read'],
};
// alias: "user" behaves like "learner"
ROLE_PERMS.user = ROLE_PERMS.learner;

export function permissionsFor(roles: string[] = []): Set<string> {
  const set = new Set<string>();
  for (const role of roles) for (const p of ROLE_PERMS[role] || []) set.add(p);
  return set;
}

// does the permission set satisfy `needed` (a "resource:action" string)?
export function can(perms: Set<string>, needed: string): boolean {
  const [resource, action] = needed.split(':');
  return (
    perms.has('*:*') ||
    perms.has(`${resource}:*`) ||
    perms.has(`*:${action}`) ||
    perms.has(needed)
  );
}
