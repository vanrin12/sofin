import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

// Gate a route on one or more `resource:action` permissions.
// Usage: @Permissions('course:create')
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);
