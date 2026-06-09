import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { can } from '../permissions';

// Enforces @Permissions('resource:action') on a handler. Deny-by-default:
// a route with no @Permissions metadata passes (it's gated only by IdentityGuard);
// a route WITH metadata requires the user to satisfy every listed permission.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const perms: Set<string> = req.user?.permissions ?? new Set();
    const missing = required.find((p) => !can(perms, p));
    if (missing) throw new ForbiddenException({ code: 'FORBIDDEN', message: `requires ${missing}` });
    return true;
  }
}
